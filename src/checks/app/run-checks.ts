// Use case: build the latest version of a draft and check it.

import { join } from 'node:path';
import {
  DEFAULT_STATES,
  type DraftStore,
  inspectLayout,
  locksNow,
  readOptions,
  readSharedValues,
  StatesSchema,
  serializeJson,
  waiversFor,
} from '../../drafts/index.ts';
import { elementSpan, offsetOf } from '../../edit/index.ts';
import { cssVarName, type FlatToken, type LoadedKit } from '../../kit/index.ts';
import { type BuildError, type BuildFs, buildDraft, type RenderDeps } from '../../render/index.ts';
import { KitvasError, TAILWIND_FILE, type Translate } from '../../shared/index.ts';
import { importFindings, rawControlFindings } from '../domain/code/code.ts';
import { type IdEntry, idEntries } from '../domain/code/ids.ts';
import { sourceRuleFindings } from '../domain/code/source-rules.ts';
import { type SizeToken, styleFindings } from '../domain/code/styles.ts';
import { sheetClasses, tailwindFindings, tailwindUnknown } from '../domain/code/tailwind.ts';
import { elementAt, typeFindings } from '../domain/code/tsc.ts';
import {
  type ChecksFile,
  mergeFindings,
  type RawFinding,
  type Shot,
  sortFindings,
  summarize,
  toolText,
  translateFinding,
} from '../domain/findings/finding.ts';
import { splitWaived } from '../domain/findings/waived.ts';
import {
  type ElementNow,
  lockedChangedFindings,
  lockStates,
} from '../domain/locks/locked-changed.ts';
import { noEffectFindings, unknownOptionFindings } from '../domain/options/options-rules.ts';
import { FACTS_NODE_CAP } from '../domain/page/facts.ts';
import { VIEWPORTS } from '../domain/page/page.ts';
import type { Before } from '../domain/rework/before.ts';
import { beforeProblemFindings, protectedFindings, reworkScore } from '../domain/rework/rework.ts';
import type { VisitInput } from '../domain/rules/index.ts';
import { sharedUnusedFindings } from '../domain/shared-values/shared-values-rules.ts';
import type { Browser } from '../ports/browser.ts';
import type { TypeChecker } from '../ports/type-checker.ts';
import { readBefore, uncappedFindings } from './before.ts';
import { type BrowserInput, browserChecks, type OptionShot } from './browser-checks.ts';
import { shotMatches } from './option-effect.ts';

export type CheckDeps = {
  render: RenderDeps;
  types: TypeChecker;
  /** Without one, a11y, ui, ux and runtime are skipped. */
  browser?: Browser;
  t: Translate;
};

export type CheckOptions = {
  /** `kitvas check --deep`: the stress passes and the deep widths. */
  deep?: boolean;
};

export type ChecksReport = ChecksFile & {
  /** False when the build had errors; the browser checks then have nothing to open. */
  built: boolean;
  /** Absolute path of build/json/checks.json. */
  path: string;
};

type PageResult = {
  findings: RawFinding[];
  shots: Shot[];
  /** The shots of the options' other values; empty when the browser checks did not run. */
  optionShots: OptionShot[];
  browser: string | null;
  notes: string[];
  /** The visits that measured facts; empty when the browser checks did not run. */
  visits: VisitInput[];
};

type ReworkResult = { findings: RawFinding[]; score: { fixed: number; left: number } | null };

/** A file of the draft: its name, its path inside the version, its text. */
type SourceText = { name: string; file: string; text: string };

/** The TSX and the style sheets of the draft, read once for the ds check and the source rules. */
type Sources = { code: SourceText[]; sheets: SourceText[] };

type DsInput = {
  fs: BuildFs;
  versionDir: string;
  kit: LoadedKit;
  ids: IdEntry[];
  built: boolean;
  sources: Sources;
};

const buildFinding = (error: BuildError): RawFinding => ({
  check: 'build',
  rule: `build/${error.source}`,
  severity: 'fix',
  file: error.file || null,
  line: error.line,
  column: error.column,
  element: null,
  message: toolText(error.message),
  hint: { key: 'checkHint.build', params: {} },
  states: [],
  widths: [],
});

const sizeTokens = (tokens: FlatToken[]): SizeToken[] =>
  tokens.flatMap((token) =>
    token.type === 'dimension'
      ? [{ name: cssVarName(token.path), value: token.value.value, unit: token.value.unit }]
      : [],
  );

function readJson(fs: BuildFs, file: string): unknown {
  const text = fs.readText(file);
  if (text === undefined) return undefined;
  try {
    const parsed: unknown = JSON.parse(text);
    return parsed;
  } catch {
    return undefined;
  }
}

/** The state ids, and the baseline the state rules compare with: `filled` when there, else the default. */
function draftStates(
  drafts: DraftStore,
  slug: string,
  base: string,
): { ids: string[]; baseline: string } {
  const parsed = StatesSchema.safeParse(drafts.readJson(slug, `${base}/src/json/states.json`));
  const states = parsed.success ? parsed.data : DEFAULT_STATES;
  const ids = states.states.map((state) => state.id);
  return { ids, baseline: ids.includes('filled') ? 'filled' : states.default };
}

/** The draft's files under a folder of `src/`, as paths inside the version with their text. */
function folderFiles(fs: BuildFs, versionDir: string, folder: string, pattern: RegExp) {
  const dir = join(versionDir, 'src', folder);
  return fs
    .listFiles(dir)
    .filter((name) => pattern.test(name))
    .map((name) => ({
      name,
      file: `src/${folder}/${name}`,
      text: fs.readText(join(dir, name)) ?? '',
    }));
}

const draftSources = (fs: BuildFs, versionDir: string): Sources => ({
  code: folderFiles(fs, versionDir, 'tsx', /\.tsx?$/),
  sheets: folderFiles(fs, versionDir, 'scss', /\.scss$/),
});

/** The rules that read sources (ADR 0043). A TSX finding gets the element written at its place. */
function sourceFindings({ code, sheets }: Sources, ids: IdEntry[]): RawFinding[] {
  const raw: RawFinding[] = [];
  for (const { file, text } of code) {
    for (const finding of sourceRuleFindings({ file, text })) {
      raw.push({ ...finding, element: elementAt(ids, file, finding.line, finding.column) });
    }
  }
  // index.scss is generated from the layout and only lists the section sheets.
  for (const { name, file, text } of sheets) {
    if (name !== 'index.scss') raw.push(...sourceRuleFindings({ file, text }));
  }
  return raw;
}

/**
 * Spec 4d, goal 4: the locks whose element another writer changed or took away. The elements are
 * the build's (`ids.json`, of the same sources), each with its whole source now; only the files
 * a lock is in are read.
 */
function lockFindings(
  drafts: DraftStore,
  at: { slug: string; version: number },
  ids: IdEntry[],
  { code }: Sources,
): RawFinding[] {
  const locks = locksNow(drafts, at.slug, at.version);
  if (locks.length === 0) return [];
  const files = new Set(locks.map((lock) => lock.file));
  const texts = new Map(
    code.filter((one) => files.has(one.file)).map((one): [string, string] => [one.file, one.text]),
  );
  const elements = ids.flatMap((entry): ElementNow[] => {
    const text = texts.get(entry.file);
    if (text === undefined) return [];
    const start = offsetOf(text, entry.line, entry.column);
    const span = start >= 0 && text[start] === '<' ? elementSpan(text, start) : null;
    if (span === null) return [];
    const { id, file, line, column } = entry;
    return [{ id, file, line, column, source: text.slice(span.start, span.end) }];
  });
  return lockedChangedFindings(lockStates(locks, elements));
}

/** The ds check: imports and controls of the TSX, the style sheets, and a Tailwind kit's classes. */
function dsFindings({ fs, versionDir, kit, ids, built, sources }: DsInput): RawFinding[] {
  const raw: RawFinding[] = [];
  const { code, sheets } = sources;
  const components = new Set(kit.kit.components.map((component) => component.name));
  for (const { file, text } of code) raw.push(...importFindings({ file, text, components }));
  raw.push(...rawControlFindings({ ids, catalog: kit.kit.components }));

  const tokens = new Set(kit.tokens.map((token) => cssVarName(token.path)));
  const sizes = sizeTokens(kit.tokens);
  // index.scss is generated from the layout and only lists the section sheets.
  for (const { name, file, text } of sheets) {
    if (name !== 'index.scss') raw.push(...styleFindings({ file, text, tokens, sizes }));
  }

  if (kit.kit.runtime.styles.tailwind === undefined) return raw;
  // A failed build may leave the list of an older one. Classes of the draft's own sheets make no
  // Tailwind CSS on purpose.
  const own = new Set(sheets.flatMap((sheet) => sheetClasses(sheet.text)));
  const unknown = built
    ? tailwindUnknown(readJson(fs, join(versionDir, ...TAILWIND_FILE.split('/')))).filter(
        (name) => !own.has(name),
      )
    : [];
  for (const { file, text } of code) {
    for (const finding of tailwindFindings({ file, text, unknown })) {
      raw.push({ ...finding, element: elementAt(ids, file, finding.line, finding.column) });
    }
  }
  return raw;
}

/** a11y, ui, ux and runtime: skipped with a note when there is no page or no browser. */
async function pageChecks(
  deps: CheckDeps,
  built: boolean,
  input: BrowserInput,
): Promise<PageResult> {
  const none: PageResult = {
    findings: [],
    shots: [],
    optionShots: [],
    browser: null,
    notes: [],
    visits: [],
  };
  // Old screenshots would show a page that no longer exists.
  deps.render.fs.remove(join(input.versionDir, 'build', 'shots'));
  if (!deps.browser) return none;
  if (!built) return { ...none, notes: [deps.t('check.note.buildFailed')] };
  try {
    const { findings, shots, optionShots, browser, truncated, visits } = await browserChecks(
      deps.browser,
      input,
    );
    // The rules still ran on what was measured; the note says the rest was not.
    const notes = truncated ? [deps.t('check.note.factsTruncated', { cap: FACTS_NODE_CAP })] : [];
    return { findings, shots, optionShots, browser, notes, visits };
  } catch (error) {
    if (!(error instanceof KitvasError && error.code === 'BROWSER_MISSING')) throw error;
    return { ...none, notes: [deps.t('check.note.noBrowser')] };
  }
}

const isMainWidth = (width: number): boolean =>
  VIEWPORTS.some((viewport) => viewport.width === width);

/**
 * The rework rules (ADR 0045) over the baseline state's visits at the phone and laptop widths: the
 * protected items once the person confirmed them, and the original's problems against this
 * version's, counted with no cap. Nothing when no page was measured, since nothing could be held
 * against the original then.
 */
function reworkChecks(before: Before, page: PageResult): ReworkResult {
  const visits = page.visits.filter(
    (visit) => visit.stateKind === 'baseline' && isMainWidth(visit.seen.width),
  );
  if (visits.length === 0) return { findings: [], score: null };
  const findings: RawFinding[] = [];
  if (before.protected?.confirmed === true) {
    findings.push(...protectedFindings(before.protected.items, visits));
  }
  if (before.problems === null) return { findings, score: null };
  const after = uncappedFindings(visits);
  findings.push(...beforeProblemFindings(before.problems, after));
  return { findings, score: reworkScore(before.problems, after) };
}

export async function runChecks(
  deps: CheckDeps,
  slug: string,
  options: CheckOptions = {},
): Promise<ChecksReport> {
  const { drafts, kits, fs } = deps.render;
  const build = await buildDraft(deps.render, slug);
  const { draft, version, base, kit, layout } = inspectLayout(drafts, kits, slug);
  // Read first, so a `before/` the skill wrote wrong stops the check before the slow part.
  const before = draft.kind === 'rework' ? readBefore(drafts, slug) : null;
  const versionDir = join(drafts.dir(slug), base);
  const json = join(versionDir, 'build', 'json');
  const raw: RawFinding[] = build.errors.map(buildFinding);
  // Ids of a failed build would be stale, so findings then go without an element.
  const ids = build.built ? idEntries(readJson(fs, join(json, 'ids.json'))) : [];

  const messages = await deps.types.check({
    workingDir: versionDir,
    entry: join(versionDir, 'src', 'tsx', 'index.tsx'),
    kitEntry: kit.entry,
    project: kit.project,
    resolve: kit.kit.resolve,
  });
  // A project kit's own files and the project's are checked by `kit verify`.
  raw.push(...typeFindings(messages, ids, { onlyDraft: kit.project !== undefined }));
  const sources = draftSources(fs, versionDir);
  raw.push(...dsFindings({ fs, versionDir, kit, ids, built: build.built, sources }));
  raw.push(...sourceFindings(sources, ids));
  // Only with the build's ids: those of a failed build would be stale.
  if (build.built) raw.push(...lockFindings(drafts, { slug, version }, ids, sources));

  // A selector of an option the file does not declare matches nothing; the version's own options.
  const draftOptions = readOptions(drafts, slug, base);
  raw.push(
    ...unknownOptionFindings(
      sources.sheets.filter((sheet) => sheet.name !== 'index.scss'),
      draftOptions,
    ),
  );
  // A shared value is set by one section and read by another (ADR 0086); the sections' own files.
  raw.push(...sharedUnusedFindings(sources.code, readSharedValues(drafts, slug, base)));

  const deep = options.deep === true;
  const states = draftStates(drafts, slug, base);
  const page = await pageChecks(deps, build.built, {
    options: draftOptions,
    versionDir,
    states: states.ids,
    ids,
    catalog: kit.kit.components,
    deep,
    screen: layout.screen,
    baseline: states.baseline,
    kind: draft.kind,
  });
  raw.push(...page.findings);
  raw.push(...noEffectFindings(states.baseline, shotMatches(fs, versionDir, page.optionShots)));
  const rework = before === null ? null : reworkChecks(before, page);
  if (rework !== null) raw.push(...rework.findings);
  const browserRan = page.browser === null ? 'skipped' : 'ran';

  const all = sortFindings(mergeFindings(raw.map((item) => translateFinding(item, deps.t))));
  // Accepted findings (spec 4c, goal 6) are listed apart and never counted as something to fix. A
  // waiver carries to this version only while its element is still one of the build's.
  const known = new Set(ids.map((entry) => entry.id));
  const waivers = waiversFor(drafts, slug, version, (element) => known.has(element));
  const { kept: findings, waived } = splitWaived(all, waivers);
  const file: ChecksFile = {
    schemaVersion: 1,
    slug,
    version,
    checks: {
      build: 'ran',
      types: 'ran',
      ds: 'ran',
      a11y: browserRan,
      ui: browserRan,
      ux: browserRan,
      runtime: browserRan,
    },
    // Only when the deep passes ran: without a browser nothing deep was done.
    ...(deep && page.browser !== null ? { deep: true } : {}),
    // Only for a rework whose original has a problems list and whose version was measured.
    ...(rework?.score ? { rework: rework.score } : {}),
    summary: { ...summarize(findings), ...(waived.length > 0 ? { waived: waived.length } : {}) },
    browser: page.browser,
    notes: page.notes,
    shots: page.shots,
    findings,
    ...(waived.length > 0 ? { waived } : {}),
  };
  const path = join(json, 'checks.json');
  fs.writeText(path, serializeJson(file));
  return { ...file, built: build.built, path };
}
