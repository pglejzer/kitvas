// Applying the editor's operations to a draft's files (spec 4a, decisions 2, 6, 7 and 10;
// ADR 0049). Every new text is made and checked in memory first. Only a request whose every op
// applies and whose every changed file still compiles is written, and then all its files or none.

import {
  type DraftStore,
  editSession,
  latestVersion,
  loadDraft,
  startEditSession,
  versionFolder,
} from '../../drafts/index.ts';
import { KitvasError } from '../../shared/index.ts';
import { applyScss, type ScssOp, scssBalanced } from '../domain/apply-scss.ts';
import { applyTsx } from '../domain/apply-tsx.ts';
import { type EditOp, fileOfId } from '../domain/ops.ts';
import type { ApplyResult, Refusal } from '../domain/types.ts';
import type { EditCompiler } from '../ports/compiler.ts';
import { locateElement } from './locate.ts';

/**
 * Called right before the files are written, with the version they go into and their new ETags,
 * so the studio's watcher can tell its own writes from anyone else's.
 */
export type BeforeWrite = (slug: string, version: number, etags: Record<string, string>) => void;

export type ApplyEditsDeps = {
  drafts: DraftStore;
  compiler: EditCompiler;
  now(): Date;
  /** The ETag of a file's text, as the API gives it out. */
  etag(text: string): string;
  /** The section SCSS file of a TSX file, as a path inside the version; `null` when it has none. */
  sectionScss(slug: string, version: number, tsxFile: string): string | null;
  beforeWrite?: BeforeWrite | undefined;
};

/** The studio API's `EditRequest`, and the draft it is for. */
export type EditInput = {
  slug: string;
  /** The version the editor shows; it must be the latest. */
  version: number;
  ops: EditOp[];
  /** ETags of the files the ops were made from, by path inside the version. */
  etags: Record<string, string>;
  /** "Keep mine": write even where the place no longer holds `before`. */
  force?: boolean | undefined;
};

/** The answer: the same shape as `EditOutcome` of the studio's API, which returns it as it is. */
export type EditResult =
  | {
      outcome: 'applied';
      version: number;
      started: boolean;
      etags: Record<string, string>;
      merged: boolean;
    }
  | {
      outcome: 'conflict';
      version: number;
      index: number;
      reason: 'changed' | 'gone';
      file: string;
      text: string;
      etag: string;
    }
  | { outcome: 'refused'; version: number; refusals: { index: number; reason: Refusal }[] };

type Refused = { index: number; reason: Refusal };

/** One file of a request: its text as read, its text after the ops, the ops that changed it. */
type FileState = { read: string; text: string; ops: number[] };

/** The new texts of one try, made from the files as they were read. */
type Plan = {
  /** The latest version: the one the texts were read from. */
  version: number;
  /** A session was open, so the texts go into `version` and no new version is started. */
  open: boolean;
  /** By path inside the version. */
  files: Map<string, FileState>;
  merged: boolean;
};

/** What changed on disk while a plan was made. */
type Moved = { draft: true } | { file: string };

/**
 * A plan is made with awaits in between (each compile), so someone may write a file meanwhile. It
 * is then made again from the new text, at most this many times.
 */
const ROUNDS = 3;

const isScss = (op: EditOp): op is ScssOp => op.op === 'setStyle' || op.op === 'removeStyle';

const stale = (slug: string, version: number, latest: number): KitvasError =>
  new KitvasError('EDIT_STALE_VERSION', { slug, version, latest });

const conflict = (
  deps: ApplyEditsDeps,
  at: { version: number; index: number; file: string },
  reason: 'changed' | 'gone',
  text: string,
): EditResult => ({ outcome: 'conflict', ...at, reason, text, etag: deps.etag(text) });

const refused = (version: number, refusals: Refused[]): EditResult => ({
  outcome: 'refused',
  version,
  refusals: [...refusals].sort((a, b) => a.index - b.index),
});

/**
 * Every changed file must still compile (TSX) or balance (SCSS) before anything is written; the
 * ops that changed a file that does not are `invalid`.
 */
async function invalidOps(
  compiler: EditCompiler,
  files: Map<string, FileState>,
): Promise<Refused[]> {
  const found: Refused[] = [];
  for (const [file, state] of files) {
    if (state.text === state.read) continue;
    const valid = file.endsWith('.tsx')
      ? (await compiler.jsxDev(state.text, file)) !== null
      : scssBalanced(state.text);
    if (valid) continue;
    for (const index of state.ops) found.push({ index, reason: 'invalid' });
  }
  return found;
}

/** Applies the ops in order on the texts in memory. Nothing is written here. */
async function plan(deps: ApplyEditsDeps, input: EditInput): Promise<Plan | EditResult> {
  const { slug } = input;
  const draft = loadDraft(deps.drafts, slug);
  const version = latestVersion(draft);
  if (input.version !== version) throw stale(slug, input.version, version);
  // An open session's version is the latest, so the texts always come from the latest version.
  const base = versionFolder(version);
  const options = { force: input.force === true };
  const files = new Map<string, FileState>();
  const refusals: Refused[] = [];

  /** A file of the request, read once; `undefined` when it is not there. */
  const fileState = (file: string): FileState | undefined => {
    const known = files.get(file);
    if (known) return known;
    const read = deps.drafts.readText(slug, `${base}/${file}`);
    if (read === undefined) return undefined;
    const state: FileState = { read, text: read, ops: [] };
    files.set(file, state);
    return state;
  };
  /** Someone else wrote the file since the editor last heard of it. */
  const changedSince = (file: string, state: FileState): boolean =>
    input.etags[file] !== deps.etag(state.read);

  for (const [index, op] of input.ops.entries()) {
    const file = isScss(op) ? deps.sectionScss(slug, version, fileOfId(op.id)) : fileOfId(op.id);
    const state = file === null ? undefined : fileState(file);
    if (file === null || state === undefined) {
      refusals.push({ index, reason: 'not-found' });
      continue;
    }
    let result: ApplyResult;
    if (isScss(op)) {
      result = applyScss(state.text, op, options);
    } else {
      // Found again in the current text every time, never by ids.json (decision 6).
      const at = await locateElement(deps.compiler, state.text, file, op.id);
      if (typeof at !== 'number') {
        // An element missing from a file someone else changed was taken away by them.
        if (at === 'not-found' && changedSince(file, state)) {
          return conflict(deps, { version, index, file }, 'gone', state.read);
        }
        refusals.push({ index, reason: at });
        continue;
      }
      result = applyTsx(state.text, at, op, options);
    }
    if ('conflict' in result) {
      return conflict(deps, { version, index, file }, 'changed', state.read);
    }
    if ('refused' in result) {
      refusals.push({ index, reason: result.refused });
      continue;
    }
    state.text = result.text;
    state.ops.push(index);
  }

  if (refusals.length === 0) refusals.push(...(await invalidOps(deps.compiler, files)));
  if (refusals.length > 0) return refused(version, refusals);
  const merged = [...files].some(([file, state]) => changedSince(file, state));
  return { version, open: editSession(draft) !== null, files, merged };
}

/** `null` when the draft and every file of the plan are still as the plan read them. */
function movedSince(deps: ApplyEditsDeps, slug: string, made: Plan): Moved | null {
  const draft = loadDraft(deps.drafts, slug);
  const open = editSession(draft) !== null;
  if (latestVersion(draft) !== made.version || open !== made.open) return { draft: true };
  const base = versionFolder(made.version);
  for (const [file, state] of made.files) {
    if (deps.drafts.readText(slug, `${base}/${file}`) !== state.read) return { file };
  }
  return null;
}

/** A file kept changing while the request was placed: the person chooses, as in a conflict. */
function stillMoving(deps: ApplyEditsDeps, slug: string, made: Plan, moved: Moved): EditResult {
  if ('draft' in moved) {
    throw stale(slug, made.version, latestVersion(loadDraft(deps.drafts, slug)));
  }
  const ops = made.files.get(moved.file)?.ops ?? [];
  const text = deps.drafts.readText(slug, `${versionFolder(made.version)}/${moved.file}`);
  if (text === undefined) {
    return refused(
      made.version,
      ops.map((index): Refused => ({ index, reason: 'not-found' })),
    );
  }
  const at = { version: made.version, index: ops[0] ?? 0, file: moved.file };
  return conflict(deps, at, 'changed', text);
}

/**
 * Writes a plan with no await in between: the session's version first when none is open, then
 * every changed file at once. If that write fails, its files are as they were and the new version
 * stays open as a copy of the one before.
 */
function write(deps: ApplyEditsDeps, slug: string, made: Plan): EditResult {
  const { merged } = made;
  const changed = [...made.files].filter(([, state]) => state.text !== state.read);
  if (changed.length === 0) {
    // Every op left its file as it was: no version is started for nothing.
    return { outcome: 'applied', version: made.version, started: false, etags: {}, merged };
  }
  const started = !made.open;
  // The new version is a copy of the one the texts were made from, so they fit it byte for byte.
  const version = started ? startEditSession(deps.drafts, slug, deps.now()) : made.version;
  const folder = versionFolder(version);
  const etags = Object.fromEntries(
    changed.map(([file, state]): [string, string] => [file, deps.etag(state.text)]),
  );
  deps.beforeWrite?.(slug, version, etags);
  deps.drafts.replaceAll(
    slug,
    changed.map(([file, state]) => ({ relPath: `${folder}/${file}`, text: state.text })),
  );
  return { outcome: 'applied', version, started, etags, merged };
}

async function settle(deps: ApplyEditsDeps, input: EditInput): Promise<EditResult> {
  for (let round = 1; ; round += 1) {
    const made = await plan(deps, input);
    if (!('files' in made)) return made;
    const moved = movedSince(deps, input.slug, made);
    if (moved === null) return write(deps, input.slug, made);
    if (round >= ROUNDS) return stillMoving(deps, input.slug, made, moved);
  }
}

/** The request running or waiting last for each draft, by the draft's folder. */
const queues = new Map<string, Promise<void>>();
const nothing = (): void => undefined;

/**
 * Applies one edit request. Requests on one draft run one at a time in this process, so two never
 * read and write the same files at once (two studio tabs). A request on a version that is not the
 * latest throws `EDIT_STALE_VERSION`.
 */
export async function applyEdits(deps: ApplyEditsDeps, input: EditInput): Promise<EditResult> {
  const key = deps.drafts.dir(input.slug);
  const result = (queues.get(key) ?? Promise.resolve()).then(() => settle(deps, input));
  const done = result.then(nothing, nothing);
  queues.set(key, done);
  done.then(() => {
    if (queues.get(key) === done) queues.delete(key);
  });
  return result;
}
