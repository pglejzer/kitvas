// Use case: build the latest version of a draft and check it.

import { join } from 'node:path';
import {
  DEFAULT_STATES,
  type DraftStore,
  inspectLayout,
  StatesSchema,
  serializeJson,
} from '../../drafts/index.ts';
import { cssVarName, type FlatToken, type LoadedKit } from '../../kit/index.ts';
import { type BuildError, type BuildFs, buildDraft, type RenderDeps } from '../../render/index.ts';
import { KitvasError, type Translate } from '../../shared/index.ts';
import { importFindings, rawControlFindings } from '../domain/code.ts';
import {
  type ChecksFile,
  mergeFindings,
  type RawFinding,
  type Shot,
  sortFindings,
  summarize,
  toolText,
  translateFinding,
} from '../domain/finding.ts';
import { type IdEntry, idEntries } from '../domain/ids.ts';
import { type SizeToken, styleFindings } from '../domain/styles.ts';
import { sheetClasses, tailwindFindings, tailwindUnknown } from '../domain/tailwind.ts';
import { elementAt, typeFindings } from '../domain/tsc.ts';
import type { Browser } from '../ports/browser.ts';
import type { TypeChecker } from '../ports/type-checker.ts';
import { type BrowserInput, browserChecks } from './browser-checks.ts';

export type CheckDeps = {
  render: RenderDeps;
  types: TypeChecker;
  /** Without one, a11y and runtime are skipped. */
  browser?: Browser;
  t: Translate;
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
  browser: string | null;
  notes: string[];
};

type DsInput = {
  fs: BuildFs;
  versionDir: string;
  kit: LoadedKit;
  ids: IdEntry[];
  built: boolean;
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

function stateIds(drafts: DraftStore, slug: string, base: string): string[] {
  const parsed = StatesSchema.safeParse(drafts.readJson(slug, `${base}/src/json/states.json`));
  return (parsed.success ? parsed.data : DEFAULT_STATES).states.map((state) => state.id);
}

/** The draft's files under a folder of `src/`, as paths inside the version with their text. */
function sources(fs: BuildFs, versionDir: string, folder: string, pattern: RegExp) {
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

/** The ds check: imports and controls of the TSX, the style sheets, and a Tailwind kit's classes. */
function dsFindings({ fs, versionDir, kit, ids, built }: DsInput): RawFinding[] {
  const raw: RawFinding[] = [];
  const code = sources(fs, versionDir, 'tsx', /\.tsx?$/);
  const components = new Set(kit.kit.components.map((component) => component.name));
  for (const { file, text } of code) raw.push(...importFindings({ file, text, components }));
  raw.push(...rawControlFindings({ ids, catalog: kit.kit.components }));

  const tokens = new Set(kit.tokens.map((token) => cssVarName(token.path)));
  const sizes = sizeTokens(kit.tokens);
  const sheets = sources(fs, versionDir, 'scss', /\.scss$/);
  // index.scss is generated from the layout and only lists the section sheets.
  for (const { name, file, text } of sheets) {
    if (name !== 'index.scss') raw.push(...styleFindings({ file, text, tokens, sizes }));
  }

  if (kit.kit.runtime.styles.tailwind === undefined) return raw;
  // A failed build may leave the list of an older one. Classes of the draft's own sheets make no
  // Tailwind CSS on purpose.
  const own = new Set(sheets.flatMap((sheet) => sheetClasses(sheet.text)));
  const unknown = built
    ? tailwindUnknown(readJson(fs, join(versionDir, 'build', 'json', 'tailwind.json'))).filter(
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

/** a11y and runtime: skipped with a note when there is no page or no browser. */
async function pageChecks(
  deps: CheckDeps,
  built: boolean,
  input: BrowserInput,
): Promise<PageResult> {
  const none: PageResult = { findings: [], shots: [], browser: null, notes: [] };
  // Old screenshots would show a page that no longer exists.
  deps.render.fs.remove(join(input.versionDir, 'build', 'shots'));
  if (!deps.browser) return none;
  if (!built) return { ...none, notes: [deps.t('check.note.buildFailed')] };
  try {
    return { ...(await browserChecks(deps.browser, input)), notes: [] };
  } catch (error) {
    if (!(error instanceof KitvasError && error.code === 'BROWSER_MISSING')) throw error;
    return { ...none, notes: [deps.t('check.note.noBrowser')] };
  }
}

export async function runChecks(deps: CheckDeps, slug: string): Promise<ChecksReport> {
  const { drafts, kits, fs } = deps.render;
  const build = await buildDraft(deps.render, slug);
  const { version, base, kit } = inspectLayout(drafts, kits, slug);
  const versionDir = join(drafts.dir(slug), base);
  const json = join(versionDir, 'build', 'json');
  const raw: RawFinding[] = build.errors.map(buildFinding);
  // Ids of a failed build would be stale, so findings then go without an element.
  const ids = build.built ? idEntries(readJson(fs, join(json, 'ids.json'))) : [];

  const messages = await deps.types.check({
    workingDir: versionDir,
    entry: join(versionDir, 'src', 'tsx', 'index.tsx'),
    kitEntry: join(kit.dir, kit.kit.runtime.entry),
    project: kit.project,
  });
  // A project kit's own files and the project's are checked by `kit verify`.
  raw.push(...typeFindings(messages, ids, { onlyDraft: kit.project !== undefined }));
  raw.push(...dsFindings({ fs, versionDir, kit, ids, built: build.built }));

  const page = await pageChecks(deps, build.built, {
    versionDir,
    states: stateIds(drafts, slug, base),
    ids,
    catalog: kit.kit.components,
  });
  raw.push(...page.findings);
  const browserRan = page.browser === null ? 'skipped' : 'ran';

  const findings = sortFindings(mergeFindings(raw.map((item) => translateFinding(item, deps.t))));
  const file: ChecksFile = {
    schemaVersion: 1,
    slug,
    version,
    checks: { build: 'ran', types: 'ran', ds: 'ran', a11y: browserRan, runtime: browserRan },
    summary: summarize(findings),
    browser: page.browser,
    notes: page.notes,
    shots: page.shots,
    findings,
  };
  const path = join(json, 'checks.json');
  fs.writeText(path, serializeJson(file));
  return { ...file, built: build.built, path };
}
