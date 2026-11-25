// The copies of a selection (ADR 0065). An element id names every rendered copy of the element
// (each item of a `.map` shows one); a selected thing is an element and a copy. A click, a click
// with Shift, Ctrl or Cmd, and the rectangle choose copies; a row of the layers list or a key
// chooses the element itself, with no copy. Pure over plain data: the store settles a selection
// with its copies through `settle`, and `select/mode.ts` tells the frame with `selectBody`.

import {
  type CopyRef,
  type EditStudioBody,
  MAX_COPIES,
  MAX_SELECTED,
} from '../../../channel/edit-protocol.ts';

/** A selection with the copies chosen of its ids. */
export type Chosen = { selection: string[]; copies: CopyRef[] };

/** What a click in the frame names: an element or none, the copy it was on, and the add key. */
export type Picked = {
  id: string | null;
  add: boolean;
  item?: number | undefined;
  path?: readonly number[] | undefined;
};

const samePath = (a: readonly number[], b: readonly number[]): boolean =>
  a.length === b.length && a.every((place, index) => place === b[index]);

/** A ref that names no one copy: the element shows one copy, in no list. */
const bare = (ref: CopyRef): boolean => ref.item === undefined && ref.path === undefined;

/** The same copy written the same way. */
const identical = (a: CopyRef, b: CopyRef): boolean =>
  a.id === b.id &&
  a.item === b.item &&
  (a.path === undefined || b.path === undefined ? a.path === b.path : samePath(a.path, b.path));

/**
 * Whether two refs name one copy: the same place among the copies when both say it, else the
 * same path. A ref that names no copy stands for every copy of its id.
 */
export function sameCopy(a: CopyRef, b: CopyRef): boolean {
  if (a.id !== b.id) return false;
  if (bare(a) || bare(b)) return true;
  if (a.item !== undefined && b.item !== undefined) return a.item === b.item;
  if (a.path !== undefined && b.path !== undefined) return samePath(a.path, b.path);
  return false;
}

/** A copy of `id` as the frame named it, with only the fields it carries. */
export function refOf(
  id: string,
  at: { item?: number | undefined; path?: readonly number[] | undefined },
): CopyRef {
  return {
    id,
    ...(at.item === undefined ? {} : { item: at.item }),
    ...(at.path === undefined ? {} : { path: [...at.path] }),
  };
}

/** The chosen copies of `id`. */
export const copiesOf = (copies: readonly CopyRef[], id: string): CopyRef[] =>
  copies.filter((copy) => copy.id === id);

/** The one chosen copy of the one selected element; `null` for any other selection. */
export function chosenCopy(
  selection: readonly string[],
  copies: readonly CopyRef[],
): CopyRef | null {
  const [id] = selection;
  if (id === undefined || selection.length !== 1) return null;
  const own = copiesOf(copies, id);
  return own.length === 1 ? (own[0] ?? null) : null;
}

/** The store's `item`: the place of the one chosen copy of the one selected element. */
export const itemOf = (selection: readonly string[], copies: readonly CopyRef[]): number | null =>
  chosenCopy(selection, copies)?.item ?? null;

/**
 * The copies a selection keeps, and its `item`: only copies of selected ids, each naming a copy,
 * at most a `select` message's. `before` comes back itself when nothing in it changed, so a
 * listener that compares the arrays hears no change.
 */
export function settle(
  selection: readonly string[],
  copies: readonly CopyRef[],
  before: CopyRef[] = [],
): { copies: CopyRef[]; item: number | null } {
  const ids = new Set(selection);
  const kept = copies.filter((copy) => ids.has(copy.id) && !bare(copy)).slice(0, MAX_COPIES);
  const same =
    kept.length === before.length &&
    kept.every((copy, index) => {
      const other = before[index];
      return other !== undefined && identical(copy, other);
    });
  const chosen = same ? before : kept;
  return { copies: chosen, item: itemOf(selection, chosen) };
}

/**
 * The selection after a click. A plain click selects the element on the copy it was on. With the
 * add key the copy is added, or leaves when it is chosen already; an element selected as itself
 * (no copy) leaves whole, and so does one whose last chosen copy left. A click outside clears,
 * unless with the add key.
 */
export function pickSelection(current: Chosen, pick: Picked): Chosen {
  if (pick.id === null) return pick.add ? current : { selection: [], copies: [] };
  const { id } = pick;
  const ref = refOf(id, pick);
  if (!pick.add) return { selection: [id], copies: bare(ref) ? [] : [ref] };
  const others = current.copies.filter((copy) => copy.id !== id);
  const without = current.selection.filter((one) => one !== id);
  if (!current.selection.includes(id)) {
    if (current.selection.length >= MAX_SELECTED) return current;
    return { selection: [...current.selection, id], copies: bare(ref) ? others : [...others, ref] };
  }
  const own = copiesOf(current.copies, id);
  if (own.length === 0) return { selection: without, copies: others };
  const left = own.filter((copy) => !sameCopy(copy, ref));
  if (left.length === 0) return { selection: without, copies: others };
  if (left.length < own.length) {
    return { selection: current.selection, copies: [...others, ...left] };
  }
  if (current.copies.length >= MAX_COPIES) return current;
  return { selection: current.selection, copies: [...current.copies, ref] };
}

/**
 * The selection after a rectangle took `picks`: their elements in the frame's order, each on the
 * copies taken. With `add` the selection stays and what is not in it yet comes after it; an
 * element selected as itself stays so. A rectangle that took nothing clears, unless it adds.
 */
export function rectSelection(current: Chosen, picks: readonly CopyRef[], add: boolean): Chosen {
  const selection = add ? [...current.selection] : [];
  const copies = add ? [...current.copies] : [];
  /** Selected before the rectangle with no copy: every copy already. */
  const whole = new Set(selection.filter((id) => copiesOf(copies, id).length === 0));
  for (const pick of picks) {
    if (!selection.includes(pick.id)) {
      if (selection.length >= MAX_SELECTED) continue;
      selection.push(pick.id);
    }
    if (bare(pick) || whole.has(pick.id) || copies.length >= MAX_COPIES) continue;
    if (!copies.some((copy) => sameCopy(copy, pick))) copies.push(refOf(pick.id, pick));
  }
  return { selection, copies };
}

/** Whether two selections name the same elements on the same copies. */
export function sameChosen(a: Chosen, b: Chosen): boolean {
  if (a.selection.length !== b.selection.length) return false;
  if (a.copies.length !== b.copies.length) return false;
  if (!a.selection.every((id, index) => id === b.selection[index])) return false;
  return a.copies.every((copy, index) => {
    const other = b.copies[index];
    return other !== undefined && identical(copy, other);
  });
}

/**
 * The chosen copies after an applied edit: each follows its element's new id, and the copies of
 * an element that is `gone` are dropped.
 */
export function copiesAfter(
  copies: readonly CopyRef[],
  renames: Readonly<Record<string, string>>,
  gone: (id: string) => boolean,
): CopyRef[] {
  return copies.flatMap((copy) => {
    if (gone(copy.id)) return [];
    const id = Object.hasOwn(renames, copy.id) ? (renames[copy.id] ?? copy.id) : copy.id;
    return [id === copy.id ? copy : { ...copy, id }];
  });
}

/**
 * The `select` message for a selection: its ids, and the place of each chosen copy the frame can
 * find. An id with no copy named is outlined on every copy.
 */
export function selectBody(state: Chosen): EditStudioBody {
  const ids = state.selection.slice(0, MAX_SELECTED);
  const copies = state.copies
    .flatMap((copy) =>
      copy.item === undefined || !ids.includes(copy.id) ? [] : [{ id: copy.id, item: copy.item }],
    )
    .slice(0, MAX_COPIES);
  return copies.length > 0 ? { type: 'select', ids, copies } : { type: 'select', ids };
}
