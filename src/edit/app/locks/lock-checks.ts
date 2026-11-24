// Locks (spec 4d, goal 4; plan 17, task C). An op that would change a locked element is refused
// with `locked`: its tag, props, text, children or class rules, and a delete, wrap or replace of
// it or of an ancestor that removes it. Moving an ancestor is allowed (the element comes along
// unchanged), and so is moving the locked element itself. `patch` and `file` ops are never
// refused: they are undo steps. A paste over a locked element with the source its lock keeps is
// its Restore and goes through. The rules are `lock-rules.ts`; this file finds the places.
//
// The locks come from `<draft>/view.json` through the drafts module, read once per request, with
// their ids as the latest version names them. A lock is found at its id when the source there is
// the kept one; else at the one element of its file with that source (another writer moved it
// and its id changed); else at its id (another writer changed it, and it is still protected). A
// lock found nowhere protects nothing: the person is asked to lock again.

import { collapseSource, locksNow, pascalCase } from '../../../drafts/index.ts';
import { type EditOp, fileOfId, type Place } from '../../domain/ops.ts';
import { elementSpan, parentOf } from '../../domain/structure/subtree.ts';
import { openingTags, readTag } from '../../domain/tsx/apply-tsx.ts';
import type { Refusal, Span } from '../../domain/types.ts';
import { locate, stateOf, type Work } from '../request-state.ts';
import { changesLock, type HeldLock, type Touch } from './lock-rules.ts';

/** A lock as the request reads it: its id now and the source it keeps, whitespace collapsed. */
type Kept = { id: string; kept: string };
/** An element in the request's text now. */
type Placed = { file: string; at: number; text: string; span: Span };
type FileTouch = { file: string; touch: Touch };

const QUOTED = /"([^"]*)"|'([^']*)'|`([^`]*)`/g;

const read = new WeakMap<Work, readonly Kept[]>();

/** The draft's locks, read once per request (a plan made again reads them again). */
function keptOf(work: Work): readonly Kept[] {
  const known = read.get(work);
  if (known) return known;
  const locks = locksNow(work.deps.drafts, work.slug, work.version).map((lock) => ({
    id: lock.id,
    kept: collapseSource(lock.text),
  }));
  read.set(work, locks);
  return locks;
}

/** The element `id` (an id before the request) where the earlier ops left it; `null`: not there. */
async function placed(work: Work, id: string): Promise<Placed | null> {
  const found = await locate(work, id);
  if (!('at' in found)) return null;
  const span = elementSpan(found.text, found.at);
  return span === null ? null : { ...found, span };
}

const sourceOf = (place: Placed): string =>
  collapseSource(place.text.slice(place.span.start, place.span.end));

/** The file a lock's element is in now: where an earlier op moved it, else its id's. */
function fileNow(work: Work, id: string): string | null {
  const spot = work.track.get(id);
  if (spot === null) return null;
  return spot?.file ?? fileOfId(id);
}

/** The one element of `file` now whose source is `kept`; `null` when none or several are. */
function sameSource(work: Work, file: string, kept: string): Placed | null {
  const text = stateOf(work, file).text;
  if (text === null) return null;
  let found: Placed | null = null;
  for (const spot of work.track.values()) {
    if (spot === null || spot.file !== file) continue;
    const span = elementSpan(text, spot.at);
    if (span === null) continue;
    const place: Placed = { file, at: spot.at, text, span };
    if (sourceOf(place) !== kept) continue;
    if (found !== null) return null;
    found = place;
  }
  return found;
}

/** Where a lock's element is now (see the top of this file); `null` when it is lost. */
async function lockPlace(work: Work, lock: Kept): Promise<Placed | null> {
  const at = await placed(work, lock.id);
  if (at !== null && sourceOf(at) === lock.kept) return at;
  const file = at?.file ?? fileNow(work, lock.id);
  const moved = file === null ? null : sameSource(work, file, lock.kept);
  return moved ?? at;
}

/** Every class written in `span` of `text`: in a `className="…"`, or in the strings of one in braces. */
function classesIn(text: string, span: Span): string[] {
  const names = new Set<string>();
  for (const at of openingTags(text)) {
    if (at < span.start || at >= span.end) continue;
    const view = readTag(text, at);
    if (typeof view === 'string' || view.className === null) continue;
    const chunks =
      view.className.kind === 'string'
        ? [view.className.value]
        : [...view.className.source.matchAll(QUOTED)].map((m) => m[1] ?? m[2] ?? m[3] ?? '');
    for (const chunk of chunks) {
      for (const name of chunk.split(/\s+/)) if (name !== '') names.add(name);
    }
  }
  return [...names];
}

const insertion = (anchor: Placed, place: Place): FileTouch => ({
  file: anchor.file,
  touch:
    place === 'first' || place === 'last'
      ? { kind: 'into', at: anchor.at }
      : { kind: 'beside', at: anchor.at },
});

const one = (place: Placed | null, touch: (place: Placed) => Touch): FileTouch[] =>
  place === null ? [] : [{ file: place.file, touch: touch(place) }];

/** What `op` writes, by file; none for an op that names no element or whose element is gone. */
async function touchesOf(work: Work, op: EditOp): Promise<FileTouch[]> {
  switch (op.op) {
    case 'setProp':
    case 'removeProp':
    case 'setText':
    case 'addClass':
    case 'removeClass':
    case 'setUtility':
    case 'replaceTag':
      return one(await placed(work, op.id), (at) => ({ kind: 'element', at: at.at }));
    case 'setStyle':
    case 'removeStyle': {
      // The rule is the section's: it styles every element of the file that carries the class.
      const at = await placed(work, op.id);
      const file = at?.file ?? fileOfId(op.id);
      const own = one(at, (place) => ({ kind: 'element', at: place.at }));
      return [...own, { file, touch: { kind: 'class', name: op.className } }];
    }
    case 'removeElement':
    case 'resetElement':
    case 'moveItem':
    case 'duplicateItem':
    case 'removeItem':
    case 'setItemText':
      return one(await placed(work, op.id), (at) => ({ kind: 'subtree', span: at.span }));
    case 'replaceElement': {
      const source = collapseSource(op.source);
      return one(await placed(work, op.id), (at) => ({ kind: 'subtree', span: at.span, source }));
    }
    case 'unwrapElement':
      return one(await placed(work, op.id), (at) => ({ kind: 'unwrap', at: at.at }));
    case 'insertElement': {
      const anchor = await placed(work, op.anchor);
      return anchor === null ? [] : [insertion(anchor, op.place)];
    }
    case 'moveElement': {
      // It leaves its parent (that parent's children change) and goes to the anchor's place.
      const target = await placed(work, op.id);
      const anchor = await placed(work, op.anchor);
      const away = one(target, (at) => ({ kind: 'beside', at: at.at }));
      return anchor === null ? away : [...away, insertion(anchor, op.place)];
    }
    case 'wrapElements': {
      const first = await placed(work, op.first);
      const last = await placed(work, op.last);
      if (first === null || last === null || first.file !== last.file) return [];
      const span = { start: first.at, end: last.span.end };
      const parent = parentOf(first.text, first.at);
      return [{ file: first.file, touch: { kind: 'wrap', span, parent } }];
    }
    default:
      // Sections are checked on their own; `patch` and `file` never are.
      return [];
  }
}

/** The lock at `place`, with what the touches need of it: its parent only for a wrap. */
function heldAt(place: Placed, lock: Kept, touches: readonly FileTouch[]): HeldLock {
  const kinds = new Set(touches.map((each) => each.touch.kind));
  return {
    span: place.span,
    parent: kinds.has('wrap') ? parentOf(place.text, place.at) : null,
    classes: kinds.has('class') ? classesIn(place.text, place.span) : [],
    kept: lock.kept,
  };
}

/** A section removed takes every element of its file along. */
async function sectionHoldsLock(work: Work, locks: readonly Kept[], section: string) {
  const file = `src/tsx/sections/${pascalCase(section)}.tsx`;
  for (const lock of locks) {
    if (fileNow(work, lock.id) !== file) continue;
    if ((await lockPlace(work, lock))?.file === file) return true;
  }
  return false;
}

export async function lockRefusal(work: Work, op: EditOp): Promise<Refusal | null> {
  if (op.op === 'patch' || op.op === 'file') return null;
  if (op.op === 'moveSection' || op.op === 'insertSection') return null;
  const locks = keptOf(work);
  if (locks.length === 0) return null;
  if (op.op === 'removeSection') {
    return (await sectionHoldsLock(work, locks, op.section)) ? 'locked' : null;
  }
  const touches = await touchesOf(work, op);
  if (touches.length === 0) return null;
  const files = new Set(touches.map((each) => each.file));
  for (const lock of locks) {
    // A lock in a file the op does not write is not looked for: no compile for nothing.
    const file = fileNow(work, lock.id);
    if (file === null || !files.has(file)) continue;
    const place = await lockPlace(work, lock);
    if (place === null) continue;
    const here = touches.filter((each) => each.file === place.file);
    const held = heldAt(place, lock, here);
    if (here.some((each) => changesLock(each.touch, held))) return 'locked';
  }
  return null;
}
