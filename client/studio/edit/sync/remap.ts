// Element identity on the page (spec 4b, decision 7; plan 14, task D1): an applied answer's `renames`
// change every id the editor holds, in the selection, both stacks and the change list.
//
// Two uses, with different rules:
// - After the person's own edit (`history.ts`) only the parts that name elements as they are now
//   follow (`remapCurrent`). A step on a stack is sent only after every later step was undone, and
//   the exact inverses put the text, and so every id, back as that step left it; remapping the
//   steps would go wrong for an element a later step removed, whose id a sibling then takes.
// - After Claude's change (`structure.ts`) nothing puts the ids back, so every part follows
//   (`remapIds`), and the steps that name an element no longer found are dropped (`forgetIds`).

import type { EditOp } from '../../../../src/edit/index.ts';
import type { ChangeEntry, EditorState, Gesture } from '../store.ts';

/** Old id → new id. Applied all at once: a swap `{a: b, b: a}` swaps. */
export type Renames = Readonly<Record<string, string>>;

/** The id `id` has after `renames`. */
export const renamed = (renames: Renames, id: string): string =>
  Object.hasOwn(renames, id) ? (renames[id] ?? id) : id;

/** New id → old id: what undoing the change that made `renames` does to the ids. */
export function invertRenames(renames: Renames): Record<string, string> {
  const out: Record<string, string> = {};
  for (const [from, to] of Object.entries(renames)) out[to] = from;
  return out;
}

/** Every element id `op` names (the same rule as `idsOf` in `src/edit/domain/ops.ts`). */
export function opIds(op: EditOp): string[] {
  switch (op.op) {
    case 'moveElement':
      return [op.id, op.anchor];
    case 'insertElement':
      return [op.anchor];
    case 'wrapElements':
      return [op.first, op.last];
    case 'moveSection':
    case 'insertSection':
    case 'removeSection':
    case 'patch':
    case 'file':
      return [];
    default:
      return [op.id];
  }
}

/** `op` with each id it names renamed; the same object when none is. */
export function remapOp(op: EditOp, renames: Renames): EditOp {
  const to = (id: string): string => renamed(renames, id);
  switch (op.op) {
    case 'moveElement': {
      const id = to(op.id);
      const anchor = to(op.anchor);
      return id === op.id && anchor === op.anchor ? op : { ...op, id, anchor };
    }
    case 'insertElement': {
      const anchor = to(op.anchor);
      return anchor === op.anchor ? op : { ...op, anchor };
    }
    case 'wrapElements': {
      const first = to(op.first);
      const last = to(op.last);
      return first === op.first && last === op.last ? op : { ...op, first, last };
    }
    case 'moveSection':
    case 'insertSection':
    case 'removeSection':
    case 'patch':
    case 'file':
      return op;
    default: {
      const id = to(op.id);
      return id === op.id ? op : { ...op, id };
    }
  }
}

/** The same array when no op changed. */
export function remapOps(ops: EditOp[], renames: Renames): EditOp[] {
  const next = ops.map((op) => remapOp(op, renames));
  return next.every((op, index) => op === ops[index]) ? ops : next;
}

/** A remapped step → the step as it was first stacked: it is still the same undo step. */
const origins = new WeakMap<Gesture, Gesture>();

export const originOf = (gesture: Gesture): Gesture => origins.get(gesture) ?? gesture;

/** `a` and `b` are one step, one of them perhaps remapped. */
export const sameStep = (a: Gesture, b: Gesture): boolean => originOf(a) === originOf(b);

/** `gesture` with its ops and `undoOps` renamed; the same object when nothing in it is. */
export function remapGesture(gesture: Gesture, renames: Renames): Gesture {
  const ops = remapOps(gesture.ops, renames);
  const undoOps = gesture.undoOps === undefined ? undefined : remapOps(gesture.undoOps, renames);
  if (ops === gesture.ops && undoOps === gesture.undoOps) return gesture;
  const next: Gesture = undoOps === undefined ? { ...gesture, ops } : { ...gesture, ops, undoOps };
  origins.set(next, originOf(gesture));
  return next;
}

/** The same array when no step changed. */
export function remapStack(stack: Gesture[], renames: Renames): Gesture[] {
  const next = stack.map((step) => remapGesture(step, renames));
  return next.every((step, index) => step === stack[index]) ? stack : next;
}

const unique = (ids: string[]): string[] => [...new Set(ids)];

const sameList = (a: readonly string[], b: readonly string[]): boolean =>
  a.length === b.length && a.every((id, index) => id === b[index]);

function remapChanges(changes: ChangeEntry[], renames: Renames): ChangeEntry[] {
  let changed = false;
  const next = changes.map((entry) => {
    if (entry.id === null) return entry;
    const id = renamed(renames, entry.id);
    if (id === entry.id) return entry;
    changed = true;
    return { ...entry, id };
  });
  return changed ? next : changes;
}

/**
 * The selection, hover, hidden elements, menu and change list after `renames`; an id `keep` says
 * no to leaves the first four (the change list keeps its lines). Only the changed parts.
 */
function remapView(
  state: EditorState,
  renames: Renames,
  keep: (id: string) => boolean,
): Partial<EditorState> {
  const patch: Partial<EditorState> = {};
  const to = (id: string): string => renamed(renames, id);
  const selection = unique(state.selection.filter(keep).map(to));
  if (!sameList(selection, state.selection)) patch.selection = selection;
  const hidden = unique(state.hidden.filter(keep).map(to));
  if (!sameList(hidden, state.hidden)) patch.hidden = hidden;
  if (state.hovered !== null) {
    const hovered = keep(state.hovered) ? to(state.hovered) : null;
    if (hovered !== state.hovered) patch.hovered = hovered;
  }
  const { menu } = state;
  if (menu !== null && menu.id !== null) {
    if (!keep(menu.id)) patch.menu = null;
    else if (to(menu.id) !== menu.id) patch.menu = { ...menu, id: to(menu.id) };
  }
  const changes = remapChanges(state.changes, renames);
  if (changes !== state.changes) patch.changes = changes;
  return patch;
}

/**
 * After the person's own applied edit: the selection, hover, hidden elements, menu and change list
 * follow `renames`; the stacks do not (see the top of this file). An id that was not renamed but
 * now names another element (another one was renamed to it, or `created` took it) belonged to an
 * element the edit removed, so it leaves the selection, the hover, the hidden list and the menu.
 */
export function remapCurrent(
  state: EditorState,
  renames: Renames,
  created: readonly string[] = [],
): Partial<EditorState> {
  const taken = new Set([...Object.values(renames), ...created]);
  return remapView(state, renames, (id) => Object.hasOwn(renames, id) || !taken.has(id));
}

/** The parts of `state` that hold ids, with each renamed id replaced; untouched parts left out. */
export function remapIds(
  state: EditorState,
  renames: Readonly<Record<string, string>>,
): Partial<EditorState> {
  if (Object.keys(renames).length === 0) return {};
  const patch = remapView(state, renames, () => true);
  const undo = remapStack(state.undo, renames);
  if (undo !== state.undo) patch.undo = undo;
  const redo = remapStack(state.redo, renames);
  if (redo !== state.redo) patch.redo = redo;
  if (state.conflict) {
    const gesture = remapGesture(state.conflict.gesture, renames);
    if (gesture !== state.conflict.gesture) patch.conflict = { ...state.conflict, gesture };
  }
  if (state.refused) {
    const gesture = remapGesture(state.refused.gesture, renames);
    if (gesture !== state.refused.gesture) patch.refused = { ...state.refused, gesture };
  }
  return patch;
}

const stepNames = (step: Gesture, gone: ReadonlySet<string>): boolean =>
  [...step.ops, ...(step.undoOps ?? [])].some((op) => opIds(op).some((id) => gone.has(id)));

/**
 * Elements no longer found after Claude's change: they leave the selection, the hover, the hidden
 * list and the menu, and every step that names one leaves its stack. Such a step's id may by now
 * be another element's, and an undo that wrote there would change the wrong element.
 */
export function forgetIds(state: EditorState, gone: ReadonlySet<string>): Partial<EditorState> {
  if (gone.size === 0) return {};
  const patch = remapView(state, {}, (id) => !gone.has(id));
  const undo = state.undo.filter((step) => !stepNames(step, gone));
  if (undo.length !== state.undo.length) patch.undo = undo;
  const redo = state.redo.filter((step) => !stepNames(step, gone));
  if (redo.length !== state.redo.length) patch.redo = redo;
  return patch;
}

/** Every element id the editor holds, each once: what Claude's change is matched for. */
export function heldIds(state: EditorState): string[] {
  const ids = new Set<string>([...state.selection, ...state.hidden]);
  if (state.hovered !== null) ids.add(state.hovered);
  if (state.menu !== null && state.menu.id !== null) ids.add(state.menu.id);
  for (const entry of state.changes) if (entry.id !== null) ids.add(entry.id);
  const gestures = [...state.undo, ...state.redo];
  if (state.conflict) gestures.push(state.conflict.gesture);
  if (state.refused) gestures.push(state.refused.gesture);
  for (const gesture of gestures) {
    for (const op of [...gesture.ops, ...(gesture.undoOps ?? [])]) {
      for (const id of opIds(op)) ids.add(id);
    }
  }
  return [...ids];
}
