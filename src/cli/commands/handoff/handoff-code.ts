// `kitvas handoff target | brief | changes | compare`: a draft into the person's own project (plan 22).
// kitvas reads facts, writes the fitter's brief and compares; the skill starts the fitter and the
// project's own scripts. Nothing here installs, runs or reverts anything.

import { type DraftStore, latestVersion, loadDraft, versionFolder } from '../../../drafts/index.ts';
import {
  type CodeBrief,
  type Compared,
  codeBriefFile,
  draftStates,
  type FitReport,
  isInsideProject,
  isProtectedPath,
  listProject,
  normalizeFolder,
  type ProjectChanges,
  projectChanges,
  readFit,
  readTarget,
  type TargetFacts,
  WRITE_SCOPES,
  type WriteSet,
} from '../../../handoff/index.ts';
import type { ProjectSetup } from '../../../kit/index.ts';
import { KitvasError, type Translate, z } from '../../../shared/index.ts';
import type { CommandContext } from '../../registry.ts';
import { type DraftDeps, openDrafts, slugAt } from '../draft/draft.ts';
import { parseWidths } from './handoff-figma.ts';

export type BriefRun = { brief: CodeBrief; dir: string; listed: boolean };
export type CompareInput = {
  slug: string;
  url: string;
  widths: number[];
  selector: string | null;
  state: string;
  allowPrivate: boolean;
};

export type CodeCommandDeps = DraftDeps & {
  projectFiles(project: string): ProjectSetup;
  /** `writeBrief` of the hand-off module, with the draft store and the kits of `project`. */
  brief(
    project: string,
    drafts: DraftStore,
    input: { slug: string; write: WriteSet; base: string; again: boolean },
  ): BriefRun;
  /** `compareHandoff` of the hand-off module, with the browser and the address lookup. */
  compare(project: string, drafts: DraftStore, input: CompareInput): Promise<Compared>;
};

/** What `changes` says of the fitter's report: absent, read, or refused with the reason. */
export type FitState =
  | { state: 'none' }
  | { state: 'read'; report: FitReport }
  | { state: 'refused'; code: string; message: string };

export type CodeView =
  | ({ view: 'target' } & TargetFacts)
  | { view: 'brief'; brief: CodeBrief; dir: string; listed: boolean }
  | ({ view: 'changes'; slug: string; version: number; fit: FitState } & ProjectChanges)
  | ({ view: 'compare'; slug: string; version: number } & Compared);

/** The folder of a version's code hand-off, inside the draft; the fitter's report is `fit.json` there. */
const codeDir = (version: number): string => `${versionFolder(version)}/handoff/code`;
const SELECTOR_MAX = 200;

const invalid = (at: string, reason: string): KitvasError =>
  new KitvasError('HANDOFF_INVALID', { at, reason });

/**
 * A folder of the project from an option: no `./`, no trailing slash, '' for the root. A path that
 * leaves the project, or whose real path does, is HANDOFF_OUTSIDE; `.git/` is never the person's word.
 */
function folderOf(deps: CodeCommandDeps, ctx: CommandContext, at: string, raw: string): string {
  const folder = normalizeFolder(raw);
  if (folder === '') return '';
  if (!isInsideProject(folder)) throw new KitvasError('HANDOFF_OUTSIDE', { path: raw });
  if (isProtectedPath(`${folder}/x`)) throw invalid(at, 'protected');
  const files = deps.projectFiles(ctx.cwd);
  if (files.exists(folder) && !files.realInside(folder)) {
    throw new KitvasError('HANDOFF_OUTSIDE', { path: raw });
  }
  return folder;
}

function writeSetOf(deps: CodeCommandDeps, ctx: CommandContext): WriteSet {
  const rawTo = ctx.flags.to;
  if (rawTo === undefined) throw new KitvasError('USAGE', { detail: ctx.t('handoff.usage.to') });
  const to = folderOf(deps, ctx, 'to', rawTo);
  const word = ctx.flags.scope ?? 'new';
  const scope = WRITE_SCOPES.find((known) => known === word);
  if (scope === undefined) throw invalid('scope', word);
  const named = (ctx.flags.files ?? '')
    .split(',')
    .map((part) => normalizeFolder(part.trim()))
    .filter((part) => part !== '');
  if (named.length > 0 && scope !== 'named') throw invalid('files', 'scope');
  for (const file of named) {
    if (!isInsideProject(file)) throw new KitvasError('HANDOFF_OUTSIDE', { path: file });
    if (isProtectedPath(file)) throw invalid('files', 'protected');
  }
  return { to, scope, files: [...new Set(named)] };
}

export function runTarget(deps: CodeCommandDeps, ctx: CommandContext): CodeView {
  const base = ctx.flags.in === undefined ? '' : folderOf(deps, ctx, 'in', ctx.flags.in);
  const facts = readTarget({ files: deps.projectFiles(ctx.cwd) }, { base });
  return { view: 'target', ...facts };
}

export function runBrief(deps: CodeCommandDeps, ctx: CommandContext): CodeView {
  const drafts = openDrafts(deps, ctx);
  const slug = slugAt(ctx, 1);
  const write = writeSetOf(deps, ctx);
  const base = ctx.flags.in === undefined ? '' : folderOf(deps, ctx, 'in', ctx.flags.in);
  const written = deps.brief(ctx.cwd, drafts, { slug, write, base, again: ctx.flags.again });
  return { view: 'brief', ...written };
}

const BriefDisk = z.object({
  write: z.object({
    to: z.string(),
    scope: z.enum(WRITE_SCOPES),
    files: z.array(z.string()),
  }),
});
const TargetDisk = z.object({ base: z.string() });
const BeforeDisk = z.object({
  schemaVersion: z.literal(1),
  watched: z.boolean(),
  files: z.record(z.string(), z.string()),
});

/** The latest version's brief: HANDOFF_NO_BRIEF when there is none. */
function briefOf(drafts: DraftStore, slug: string): { version: number; write: WriteSet } {
  const version = latestVersion(loadDraft(drafts, slug));
  const raw = drafts.readJson(slug, codeBriefFile(version));
  if (raw === undefined) throw new KitvasError('HANDOFF_NO_BRIEF', { slug, version });
  const parsed = BriefDisk.safeParse(raw);
  if (!parsed.success) throw invalid('brief', 'shape');
  return { version, write: parsed.data.write };
}

function refused(error: KitvasError, t: Translate): FitState {
  return { state: 'refused', code: error.code, message: t(`error.${error.code}`, error.params) };
}

/** The fitter's report, only as `readFit` lets it through; a refusal carries its reason. */
function fitOf(
  drafts: DraftStore,
  slug: string,
  version: number,
  write: WriteSet,
  t: Translate,
): FitState {
  let raw: unknown;
  try {
    raw = drafts.readJson(slug, `${codeDir(version)}/fit.json`);
  } catch (error) {
    if (!(error instanceof KitvasError)) throw error;
    return refused(invalid('fit', 'json'), t);
  }
  if (raw === undefined) return { state: 'none' };
  const read = readFit(raw, write);
  return read.ok ? { state: 'read', report: read.value } : refused(read.error, t);
}

export function runChanges(deps: CodeCommandDeps, ctx: CommandContext): CodeView {
  const drafts = openDrafts(deps, ctx);
  const slug = slugAt(ctx, 1);
  const { version, write } = briefOf(drafts, slug);
  const target = TargetDisk.safeParse(drafts.readJson(slug, `${codeDir(version)}/target.json`));
  const before = BeforeDisk.safeParse(drafts.readJson(slug, `${codeDir(version)}/before.json`));
  const listing = before.success
    ? before.data
    : { schemaVersion: 1 as const, watched: false, files: {} };
  const after = listProject(
    { files: deps.projectFiles(ctx.cwd) },
    { base: target.success ? target.data.base : '' },
  );
  const changes = projectChanges(listing, after, write);
  return {
    view: 'changes',
    slug,
    version,
    ...changes,
    fit: fitOf(drafts, slug, version, write, ctx.t),
  };
}

export async function runCompare(deps: CodeCommandDeps, ctx: CommandContext): Promise<CodeView> {
  const drafts = openDrafts(deps, ctx);
  const slug = slugAt(ctx, 1);
  const url = ctx.flags.url[0];
  if (url === undefined) throw new KitvasError('USAGE', { detail: ctx.t('handoff.usage.url') });
  if (!/^https?:\/\/\S+$/i.test(url)) throw invalid('url', 'address');
  const selector = ctx.flags.selector ?? null;
  if (
    selector !== null &&
    (selector.trim() === '' || selector.length > SELECTOR_MAX || /[\r\n]/.test(selector))
  ) {
    throw invalid('selector', 'selector');
  }
  const widths = parseWidths(ctx.flags.widths);
  const { version } = briefOf(drafts, slug);
  const states = draftStates(drafts, slug, versionFolder(version));
  const state = ctx.flags.state ?? states.baseline;
  if (!states.ids.includes(state)) throw invalid('state', state);
  const compared = await deps.compare(ctx.cwd, drafts, {
    slug,
    url,
    widths,
    selector,
    state,
    allowPrivate: ctx.flags.allowPrivate,
  });
  return { view: 'compare', slug, version, ...compared };
}

const where = (base: string, t: Translate): string =>
  base === '' ? t('handoff.target.root') : `"${base}"`;

export function renderCode(data: CodeView, t: Translate): string {
  switch (data.view) {
    case 'target': {
      const lines = [
        t('handoff.target.head', {
          base: where(data.base, t),
          root: data.root.length,
          packages: data.packages.length,
          extensions: data.extensions.length,
          folders: data.folders.length,
          tokens: data.tokens.length,
        }),
      ];
      for (const pack of data.packages) {
        const scripts = Object.keys(pack.scripts).join(', ');
        lines.push(
          t('handoff.target.package', { path: pack.path || '.', scripts: scripts || '-' }),
        );
      }
      if (data.conventions.length > 0) {
        lines.push(t('handoff.target.conventions', { files: data.conventions.join(', ') }));
      }
      lines.push(t(data.git ? 'handoff.target.git' : 'handoff.target.noGit'));
      if (data.capped) lines.push(t('handoff.target.capped'));
      return lines.join('\n');
    }
    case 'brief': {
      const { write } = data.brief;
      const lines = [
        t('handoff.brief.ok', {
          slug: data.brief.slug,
          version: data.brief.version,
          dir: data.dir,
          scope: write.scope,
          to: write.to || '.',
        }),
      ];
      if (data.brief.options !== undefined) {
        lines.push(
          t('handoff.brief.options', {
            options: data.brief.options
              .map((option) => `${option.id}=${option.default}`)
              .join(', '),
          }),
        );
      }
      if (!data.listed) lines.push(t('handoff.brief.unlisted'));
      return lines.join('\n');
    }
    case 'changes': {
      const lines = [
        t('handoff.changes.head', {
          slug: data.slug,
          inside: data.inside.length,
          outside: data.outside.length,
          removed: data.removed.length,
        }),
      ];
      if (!data.watched) lines.push(t('handoff.changes.unwatched'));
      for (const path of data.outside) lines.push(t('handoff.changes.outside', { path }));
      for (const path of data.removed) lines.push(t('handoff.changes.removed', { path }));
      if (data.fit.state === 'none') lines.push(t('handoff.changes.noFit'));
      if (data.fit.state === 'refused') {
        lines.push(t('handoff.changes.fitRefused', { message: data.fit.message }));
      }
      if (data.fit.state === 'read') {
        const report = data.fit.report;
        lines.push(
          t('handoff.changes.fit', {
            files: report.files.length,
            components: report.components.length,
            tokens: report.tokens.length,
            wiring: report.wiring.length,
            installs: report.installs.length,
            open: report.open.length,
          }),
        );
      }
      return lines.join('\n');
    }
    case 'compare': {
      const lines = data.results.map((result) =>
        result.state === 'scored'
          ? t('handoff.compare.scored', {
              width: result.width,
              score: result.score,
              line: result.line,
              size: result.size,
              colour: result.colour,
              structure: result.structure,
            })
          : t('handoff.compare.state', {
              width: result.width,
              state: result.state,
              detail: result.detail,
            }),
      );
      lines.push(t(data.passed ? 'handoff.compare.passed' : 'handoff.compare.notPassed'));
      return lines.join('\n');
    }
  }
}
