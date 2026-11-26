// The editor's undo, redo and change list, kept across a reload (ADR 0061). The page's store holds
// them while the session's edits are on disk at once, so a reload used to leave the file changed
// and nothing to take the change back with. One entry per draft in the studio origin's
// `localStorage` (the origin keeps its port per project) names the version and the session it is
// of: a saved version, another session or an entry that does not fit starts empty, and the entry
// goes. The rules are pure over an injected storage; `mountKeep` reads once when the edit state is
// known and writes after every change of the lists.

import { isRecord as isObject } from '../../../../src/shared/values/guards.ts';
import type { EditState } from '../../../../src/studio/api/edit/edit-schemas.ts';
import type { EditorContext } from '../context.ts';
import type { Gesture } from '../store.ts';
import type { StepEntry } from './chips.ts';
import { readChange, readGesture, readList } from './keep-shape.ts';

/** The part of `localStorage` the kept history uses; replaceable in tests. */
export type KeepStorage = {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
};

export type Session = NonNullable<EditState['session']>;

/** The lists kept: both stacks, and the session's lines of the change list. */
export type Kept = { undo: Gesture[]; redo: Gesture[]; changes: StepEntry[] };

/** The shape of the stored entry; another one is dropped. */
export const KEEP_FORMAT = 1;
/** Each list keeps its newest steps; the oldest undo steps can no longer be taken back. */
export const MAX_KEPT_STEPS = 200;
/** One step or line larger than this keeps nothing: the history is not worth a broken store. */
export const MAX_ENTRY_CHARS = 250_000;
/** The whole entry; past it the oldest steps go first. */
export const MAX_KEPT_CHARS = 2_000_000;

export const keepKey = (slug: string): string => `kitvas.edit.history:${slug}`;

/** The viewer's storage, or `null` where reading it throws (blocked site data, a sandbox). */
export function keepStorage(): KeepStorage | null {
  try {
    return typeof localStorage === 'undefined' ? null : localStorage;
  } catch {
    return null;
  }
}

export const sameSession = (a: Session | null, b: Session | null): boolean =>
  a === b || (a !== null && b !== null && a.version === b.version && a.startedAt === b.startedAt);

type Sized<T> = { item: T; size: number };

const sized = <T>(items: readonly T[]): Sized<T>[] =>
  items.slice(-MAX_KEPT_STEPS).map((item) => ({ item, size: JSON.stringify(item).length + 1 }));

/**
 * The text kept for the lists of `session`; `null` when nothing is to be kept (no session, empty
 * lists, or one entry larger than `MAX_ENTRY_CHARS`). Each list keeps its newest
 * `MAX_KEPT_STEPS`; past `MAX_KEPT_CHARS` the oldest undo steps go first, then the oldest lines,
 * then the redo steps farthest from the top.
 */
export function packKept(slug: string, session: Session | null, kept: Kept): string | null {
  if (session === null) return null;
  const undo = sized(kept.undo);
  const redo = sized(kept.redo);
  const changes = sized(kept.changes);
  const all = [...undo, ...redo, ...changes];
  if (all.length === 0 || all.some((one) => one.size > MAX_ENTRY_CHARS)) return null;
  let total = all.reduce((sum, one) => sum + one.size, 0);
  for (const list of [undo, changes, redo]) {
    while (total > MAX_KEPT_CHARS && list.length > 0) total -= list.shift()?.size ?? 0;
  }
  const items = <T>(list: Sized<T>[]): T[] => list.map((one) => one.item);
  return JSON.stringify({
    v: KEEP_FORMAT,
    slug,
    version: session.version,
    startedAt: session.startedAt,
    undo: items(undo),
    redo: items(redo),
    changes: items(changes),
  });
}

const bounded = <T>(list: T[] | null): T[] | null =>
  list !== null && list.length <= MAX_KEPT_STEPS ? list : null;

/**
 * The lists kept for `session` of the draft `slug`; `null` when the text is of another draft,
 * version or session, of another format, or does not fit in any part.
 */
export function readKept(raw: string | null, slug: string, session: Session | null): Kept | null {
  if (raw === null || session === null) return null;
  let read: unknown;
  try {
    read = JSON.parse(raw);
  } catch {
    return null;
  }
  if (!isObject(read) || read.v !== KEEP_FORMAT || read.slug !== slug) return null;
  if (read.version !== session.version || read.startedAt !== session.startedAt) return null;
  const undo = bounded(readList(read.undo, readGesture));
  const redo = bounded(readList(read.redo, readGesture));
  const changes = bounded(readList(read.changes, readChange));
  if (undo === null || redo === null || changes === null) return null;
  return { undo, redo, changes };
}

/** The kept lists of the open session; an entry of anything else is removed. */
export function loadKept(storage: KeepStorage, slug: string, session: Session | null): Kept | null {
  try {
    const raw = storage.getItem(keepKey(slug));
    const kept = readKept(raw, slug, session);
    if (kept === null && raw !== null) storage.removeItem(keepKey(slug));
    return kept;
  } catch {
    return null;
  }
}

/**
 * Keeps the lists of `session`, or removes the entry when nothing is to be kept. A store that
 * refuses the write loses the entry too: a reload must never bring back older stacks than the
 * file has.
 */
export function saveKept(
  storage: KeepStorage,
  slug: string,
  session: Session | null,
  kept: Kept,
): void {
  const key = keepKey(slug);
  try {
    const text = packKept(slug, session, kept);
    if (text === null) storage.removeItem(key);
    else storage.setItem(key, text);
  } catch {
    try {
      storage.removeItem(key);
    } catch {
      // Storage refused both: the history lives in this page only.
    }
  }
}

/**
 * Reads the kept lists once the edit state is known, and writes them after every change of the
 * stacks, the change list or the session. Only the open session's lines of the change list are
 * kept: those from its first edit on (or all of a session read back). "Undo save" reopens the
 * same session, so its lines are its own again.
 */
export function mountKeep(
  ctx: Pick<EditorContext, 'slug' | 'store'>,
  storage: KeepStorage | null = keepStorage(),
): void {
  const { slug, store } = ctx;
  if (storage === null) return;
  const place: KeepStorage = storage;
  let asked = false;
  let ready = false;
  let queued = false;
  /** The first line of the change list that is the open session's, and that session's version. */
  let from = 0;
  let fromVersion: number | null = null;

  function write(): void {
    queued = false;
    const state = store.get();
    const session = state.edit?.session ?? null;
    const kept = { undo: state.undo, redo: state.redo, changes: state.changes.slice(from) };
    saveKept(place, slug, session, kept);
  }

  function queue(): void {
    if (queued) return;
    queued = true;
    // One write for the several changes one answer makes.
    queueMicrotask(write);
  }

  function restore(): void {
    const state = store.get();
    const session = state.edit?.session ?? null;
    ready = true;
    fromVersion = session?.version ?? null;
    from = session === null ? state.changes.length : 0;
    const kept = loadKept(place, slug, session);
    // Nothing is replaced: a step made before the read wins over what was kept.
    if (kept !== null && state.undo.length === 0 && state.redo.length === 0) {
      store.set({ undo: kept.undo, redo: kept.redo, changes: [...kept.changes, ...state.changes] });
      return;
    }
    queue();
  }

  store.subscribe((state, previous) => {
    if (!ready) {
      // Read after this change is told to every panel, never in the middle of it.
      if (state.edit !== null && !asked) {
        asked = true;
        queueMicrotask(restore);
      }
      return;
    }
    const session = state.edit?.session ?? null;
    if (session !== null && session.version !== fromVersion) {
      // A new session: its first change came with this very change of the store.
      from = previous.changes.length;
      fromVersion = session.version;
    }
    const lists =
      state.undo !== previous.undo ||
      state.redo !== previous.redo ||
      state.changes !== previous.changes;
    if (lists || !sameSession(session, previous.edit?.session ?? null)) queue();
  });
}
