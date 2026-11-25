// Applying the editor's operations to a draft's files (spec 4a, decisions 2, 6, 7 and 10; ADR
// 0049; spec 4b, decisions 2 to 9). Every new text is made and checked in memory first. Only a
// request whose every op applies and whose every changed file still compiles is written, and then
// all its files or none. A request with structural ops answers with its exact inverse made from
// the texts (`patch` and `file` ops), the renames of the elements whose ids it changed, and the
// elements it created.

import {
  appendRenames,
  type DraftStore,
  editSession,
  latestVersion,
  loadDraft,
  startEditSession,
  versionFolder,
} from '../../drafts/index.ts';
import type { KitStore } from '../../kit/index.ts';
import { KitvasError } from '../../shared/index.ts';
import {
  type EditOp,
  ELEMENT_ID,
  fileOfId,
  hashOf,
  inverseAll,
  isStructural,
  MAX_HUNK,
  type SimpleOp,
} from '../domain/ops.ts';
import { applyHunks, makeHunks } from '../domain/structure/patch.ts';
import { renameMap } from '../domain/structure/renames.ts';
import { applyScss, type ScssOp, scssBalanced } from '../domain/style/apply-scss.ts';
import { applyTsx } from '../domain/tsx/apply-tsx.ts';
import type { OffsetMap, Refusal } from '../domain/types.ts';
import type { EditCompiler } from '../ports/compiler.ts';
import { lockRefusal } from './locks/lock-checks.ts';
import {
  changedSince,
  commit,
  createWork,
  type FileState,
  type Found,
  locate,
  type OpResult,
  type Site,
  type Stop,
  sitesOf,
  startOf,
  stateOf,
  type Work,
} from './request-state.ts';
import { applyStructural } from './structure/structural.ts';
import { contextRefusal } from './style/context-checks.ts';
import { applyItemClass } from './style/item-class-apply.ts';
import { scssOptions, undoableByOps } from './style/style-checks.ts';

/**
 * Called right before the files are written, with the version they go into and their new ETags,
 * so the studio's watcher can tell its own writes from anyone else's.
 */
export type BeforeWrite = (slug: string, version: number, etags: Record<string, string>) => void;

export type ApplyEditsDeps = {
  drafts: DraftStore;
  compiler: EditCompiler;
  /**
   * The kits, for the draft's catalog (spec 4b): what takes children and what is interactive, the
   * names a moved or pasted subtree may use, and the kit import that follows use.
   */
  kits: KitStore;
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
      inverse: EditOp[];
      renames: Record<string, string>;
      created: string[];
      dropped: string[];
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

/** The new texts of one try, made from the files as they were read. */
type Plan = {
  /** The latest version: the one the texts were read from. */
  version: number;
  /** A session was open, so the texts go into `version` and no new version is started. */
  open: boolean;
  /** By path inside the version. */
  files: Map<string, FileState>;
  merged: boolean;
  /** The answer's inverse, renames, created ids and dropped props (spec 4b). */
  made: Made;
};

type Made = Pick<
  Extract<EditResult, { outcome: 'applied' }>,
  'inverse' | 'renames' | 'created' | 'dropped'
>;
const nothingMade: Made = { inverse: [], renames: {}, created: [], dropped: [] };

/** The sites of the changed TSX files as compiled, and the ops of files that fail the checks. */
type Final = { sites: Map<string, Site[]>; invalid: Refused[] };

/** What changed on disk while a plan was made. */
type Moved = { draft: true } | { file: string };

type InverseOp = Extract<EditOp, { op: 'patch' | 'file' }>;

/**
 * A plan is made with awaits in between (each compile), so someone may write a file meanwhile. It
 * is then made again from the new text, at most this many times.
 */
const ROUNDS = 3;
/** `EditOpSchema` takes this many hunks in one `patch`, and ids this long. */
const MAX_HUNKS = 50;
const MAX_ID = 200;

const isScss = (op: EditOp): op is ScssOp => op.op === 'setStyle' || op.op === 'removeStyle';
/** An id an op can name (`ElementIdSchema`): a deeper one is left out of the answer. */
const nameable = (id: string): boolean => id.length <= MAX_ID && ELEMENT_ID.test(id);

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

/** Where old offsets went in a change of one place (a 4a op): the rest is the same text. */
function spliceMap(before: string, after: string): OffsetMap {
  const limit = Math.min(before.length, after.length);
  let head = 0;
  while (head < limit && before.charCodeAt(head) === after.charCodeAt(head)) head += 1;
  let tail = 0;
  while (
    tail < limit - head &&
    before.charCodeAt(before.length - 1 - tail) === after.charCodeAt(after.length - 1 - tail)
  ) {
    tail += 1;
  }
  const end = before.length - tail;
  const shift = after.length - before.length;
  return (old) => (old < head ? old : old >= end ? old + shift : null);
}

/** The section SCSS a style op writes (its element is never located: the class is the place). */
function scssPlace(work: Work, op: ScssOp): Found | Stop {
  const file = work.deps.sectionScss(work.slug, work.version, fileOfId(op.id));
  const text = file === null ? null : stateOf(work, file).text;
  return file === null || text === null ? { refused: 'not-found' } : { file, at: 0, text };
}

/**
 * A 4a op. Its element is found again in the current text, never by `ids.json` (4a decision 6),
 * where the request's earlier ops left it (4b decision 3).
 */
async function applySimple(work: Work, index: number, op: SimpleOp): Promise<OpResult> {
  // Spec 4c: a width or state the kit has no breakpoint for, or a property a prop covers.
  const stop = await contextRefusal(work, op);
  if (stop !== null) return { refused: stop };
  const at = isScss(op) ? scssPlace(work, op) : await locate(work, op.id);
  if (!('at' in at)) return at;
  const result = isScss(op)
    ? applyScss(at.text, op, scssOptions(work))
    : applyTsx(at.text, at.at, op, work.options);
  if ('conflict' in result) return { conflict: 'changed', file: at.file };
  if ('refused' in result) return { refused: result.refused };
  commit(work, at.file, index, result.text, spliceMap(at.text, result.text));
  return 'done';
}

/** A whole file put back: its elements followed line by line, as the hunks between them do. */
function wholeMoved(before: string | null, after: string | null): OffsetMap {
  if (before === null || after === null) return () => null;
  const patched = applyHunks(before, makeHunks(after, before));
  return 'conflict' in patched ? () => null : patched.moved;
}

/**
 * A server-made inverse (spec 4b, decision 4): its hunks where each `find` is there once, or the
 * whole file where its text is the one `before` names. Anything else is a conflict, never a guess.
 */
async function applyInverse(work: Work, index: number, op: InverseOp): Promise<OpResult> {
  const { file } = op;
  // Its elements are taken first, so the request's later ops still find them (decision 3).
  if (file.endsWith('.tsx')) await startOf(work, file);
  const text = stateOf(work, file).text;
  if (op.op === 'patch') {
    if (text === null) return { conflict: 'gone', file };
    const patched = applyHunks(text, op.hunks);
    if ('conflict' in patched) return { conflict: 'changed', file };
    commit(work, file, index, patched.text, patched.moved);
    return 'done';
  }
  const expected = op.before === null ? text === null : text !== null && hashOf(text) === op.before;
  if (!expected && !work.options.force) {
    return { conflict: text === null ? 'gone' : 'changed', file };
  }
  commit(work, file, index, op.text, wholeMoved(text, op.text));
  return 'done';
}

async function applyOne(work: Work, index: number, op: EditOp): Promise<OpResult> {
  const locked = await lockRefusal(work, op);
  if (locked !== null) return { refused: locked };
  if (!isStructural(op)) return applySimple(work, index, op);
  if (op.op === 'addItemClass') return applyItemClass(work, index, op);
  if (op.op === 'patch' || op.op === 'file') return applyInverse(work, index, op);
  return applyStructural(work, index, op);
}

/**
 * Every changed file must still compile (TSX) or balance (SCSS) before anything is written; the
 * ops that changed one that does not are `invalid`. The layout is checked by the section ops that
 * write it, and a removed file has nothing to check. The compiled TSX gives the answer its ids.
 */
async function finalSites(work: Work): Promise<Final> {
  const sites = new Map<string, Site[]>();
  const invalid: Refused[] = [];
  for (const [file, state] of work.files) {
    const { text } = state;
    if (text === null || text === state.read) continue;
    let valid = true;
    if (file.endsWith('.tsx')) {
      const code = await work.deps.compiler.jsxDev(text, file);
      if (code !== null) sites.set(file, sitesOf(file, text, code));
      valid = code !== null;
    } else if (file.endsWith('.scss')) {
      valid = scssBalanced(text);
    }
    if (!valid) for (const index of state.ops) invalid.push({ index, reason: 'invalid' });
  }
  return { sites, invalid };
}

/** Old id → new id over the whole request (decision 7), for every element whose id changed. */
function renamesOf(work: Work, sites: Map<string, Site[]>): Record<string, string> {
  const renames: Record<string, string> = {};
  for (const [file, start] of work.starts) {
    const state = work.files.get(file);
    const after = sites.get(file);
    if (start === 'invalid' || after === undefined || state === undefined) continue;
    if (state.read === null || state.text === null) continue;
    Object.assign(renames, renameMap(start.sites, after, state.read, state.text, start.moved));
  }
  // What `renameMap` does not follow: a move to another file, a tag a replace changed.
  for (const [id, spot] of work.track) {
    if (spot === null || spot.own) continue;
    const site = sites.get(spot.file)?.find((each) => each.at === spot.at);
    if (site !== undefined && site.tag === spot.tag && site.id !== id) renames[id] = site.id;
  }
  return Object.fromEntries(
    Object.entries(renames).filter(([from, to]) => nameable(from) && nameable(to)),
  );
}

/** Ids of the elements the request created, and the root of each section it brought in. */
function createdOf(work: Work, sites: Map<string, Site[]>): string[] {
  const ids = new Set<string>();
  for (const made of work.created) {
    const site = sites.get(made.file)?.find((each) => each.at === made.at);
    if (site !== undefined) ids.add(site.id);
  }
  for (const [file, state] of work.files) {
    if (state.read !== null || state.text === null) continue;
    // A root's id has no `/` after its file: `sections/Plans2:section`.
    for (const site of sites.get(file) ?? []) {
      if (!site.id.slice(site.id.indexOf(':')).includes('/')) ids.add(site.id);
    }
  }
  return [...ids].filter(nameable);
}

/**
 * The exact inverse of a request with structural ops (decision 4), in the texts after it: hunks
 * for each changed file; the whole file for one created or removed, or too changed for a hunk.
 */
function serverInverse(files: Map<string, FileState>): EditOp[] {
  return [...files].flatMap(([file, { read, text }]): EditOp[] => {
    if (text === read) return [];
    if (read === null) return [{ op: 'file', file, text: null, before: hashOf(text ?? '') }];
    if (text === null) return [{ op: 'file', file, text: read, before: null }];
    const hunks = makeHunks(read, text);
    const fits =
      hunks.length > 0 &&
      hunks.length <= MAX_HUNKS &&
      hunks.every((hunk) => hunk.find.length <= MAX_HUNK && hunk.replace.length <= MAX_HUNK);
    if (fits) return [{ op: 'patch', file, hunks }];
    return [{ op: 'file', file, text: read, before: hashOf(text) }];
  });
}

function madeOf(work: Work, ops: readonly EditOp[], sites: Map<string, Site[]>): Made {
  const simple = ops.filter((op): op is SimpleOp => !isStructural(op));
  // 4a ops only: their exact inverses, made from the ops alone (spec 4a, decision 5), unless one
  // would write back a value its property refuses: then the hunks below undo it (plan 15).
  if (simple.length === ops.length && undoableByOps(work, simple)) {
    return { ...nothingMade, inverse: inverseAll(simple) };
  }
  return {
    inverse: serverInverse(work.files),
    renames: renamesOf(work, sites),
    created: createdOf(work, sites),
    dropped: [...work.dropped],
  };
}

/** Applies the ops in order on the texts in memory. Nothing is written here. */
async function plan(deps: ApplyEditsDeps, input: EditInput): Promise<Plan | EditResult> {
  const { slug } = input;
  const draft = loadDraft(deps.drafts, slug);
  const version = latestVersion(draft);
  if (input.version !== version) throw stale(slug, input.version, version);
  // An open session's version is the latest, so the texts always come from the latest version.
  const options = { force: input.force === true };
  const at = { slug, version, kitId: draft.kit.id, options, etags: input.etags };
  const work = createWork(deps, at);
  const refusals: Refused[] = [];

  for (const [index, op] of input.ops.entries()) {
    const done = await applyOne(work, index, op);
    if (done === 'done') continue;
    if ('refused' in done) {
      refusals.push({ index, reason: done.refused });
      continue;
    }
    const read = work.files.get(done.file)?.read ?? '';
    return conflict(deps, { version, index, file: done.file }, done.conflict, read);
  }

  const none: Final = { sites: new Map<string, Site[]>(), invalid: [] };
  const final = refusals.length === 0 ? await finalSites(work) : none;
  refusals.push(...final.invalid);
  if (refusals.length > 0) return refused(version, refusals);
  // Only files the editor sent an ETag for: a layout it never read is no merge.
  const merged = [...work.files].some(
    ([file, state]) => work.etags[file] !== undefined && changedSince(work, file, state),
  );
  const made = madeOf(work, input.ops, final.sites);
  return { version, open: editSession(draft) !== null, files: work.files, merged, made };
}

/** `null` when the draft and every file of the plan are still as the plan read them. */
function movedSince(deps: ApplyEditsDeps, slug: string, made: Plan): Moved | null {
  const draft = loadDraft(deps.drafts, slug);
  const open = editSession(draft) !== null;
  if (latestVersion(draft) !== made.version || open !== made.open) return { draft: true };
  const base = versionFolder(made.version);
  for (const [file, state] of made.files) {
    if ((deps.drafts.readText(slug, `${base}/${file}`) ?? null) !== state.read) return { file };
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
 * The request's renames and created ids go into the version's log (decision 7), which reset and
 * the timeline read. The files are written by then, so the answer must still reach the editor,
 * which undoes by the inverse: a failed append only leaves the log a step short.
 */
function logRenames(deps: ApplyEditsDeps, slug: string, version: number, made: Made): void {
  const { renames, created } = made;
  if (Object.keys(renames).length === 0 && created.length === 0) return;
  try {
    appendRenames(deps.drafts, slug, version, { at: deps.now().toISOString(), renames, created });
  } catch {
    // Nothing to undo: the log is not part of the draft's sources.
  }
}

/**
 * Writes a plan with no await in between: the session's version first when none is open, then
 * every changed file at once (a `null` text removes the file). If that write fails, its files are
 * as they were and the new version stays open as a copy of the one before.
 */
function write(deps: ApplyEditsDeps, slug: string, made: Plan): EditResult {
  const { merged } = made;
  const changed = [...made.files].filter(([, state]) => state.text !== state.read);
  if (changed.length === 0) {
    // Every op left its file as it was: no version is started for nothing.
    return {
      outcome: 'applied',
      version: made.version,
      started: false,
      etags: {},
      merged,
      ...nothingMade,
    };
  }
  const started = !made.open;
  // The new version is a copy of the one the texts were made from, so they fit it byte for byte.
  const version = started ? startEditSession(deps.drafts, slug, deps.now()) : made.version;
  const folder = versionFolder(version);
  const etags = Object.fromEntries(
    changed.flatMap(([file, { text }]): [string, string][] =>
      text === null ? [] : [[file, deps.etag(text)]],
    ),
  );
  deps.beforeWrite?.(slug, version, etags);
  deps.drafts.replaceAll(
    slug,
    changed.map(([file, state]) => ({ relPath: `${folder}/${file}`, text: state.text })),
  );
  logRenames(deps, slug, version, made.made);
  return { outcome: 'applied', version, started, etags, merged, ...made.made };
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
