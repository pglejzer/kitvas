// A part of a list item (ADR 0065): an element inside the JSX a `.map` callback returns that is
// not the callback's root. It is an element of the template, so Delete, Duplicate and a move
// change every item; the note above the properties says so, and its control selects the item the
// part belongs to, on the copy the part was chosen on. Once such a change is written it is said
// over the canvas too (`partDone`). Pure over the store's state.

import type { CopyRef } from '../../../channel/edit-protocol.ts';
import { type Chosen, chosenCopy } from '../select/copies.ts';
import type { EditorState } from '../store.ts';
import { text } from '../texts.ts';

type View = Pick<EditorState, 'selection' | 'copies' | 'inspected' | 'tree' | 'structure'>;

export type PartTarget = {
  id: string;
  /** The item the part belongs to: the root of its innermost list; `null` when none is named. */
  root: string | null;
  /** The items the page shows (the copies of the root); `null` when that is not known. */
  count: number | null;
};

const countOf = (state: Pick<View, 'tree'>, id: string): number | null =>
  state.tree.find((node) => node.id === id)?.count ?? null;

/**
 * `id` as a part of a list item by the structure map alone: it stands in a list and is not the
 * root of its innermost one. For an element that need not be the selected one (a drag, or an
 * action run before the source view is in).
 */
export function partOf(state: Pick<View, 'structure' | 'tree'>, id: string): PartTarget | null {
  const entry = state.structure?.elements.find((each) => each.id === id);
  const lists = entry?.lists ?? [];
  const root = lists[lists.length - 1];
  if (entry === undefined || root === undefined || root === id) return null;
  // What stands in the expression's own place changes as the expression does: no part.
  if (entry.movable === 'in-expression') return null;
  return { id, root, count: countOf(state, root) };
}

/** A change to a part that every item shows. */
export type PartChange = 'delete' | 'duplicate' | 'move';

/** What is said once a change to a part is written: it shows in every item. */
export function partDone(part: PartTarget, change: PartChange): string {
  return part.count !== null && part.count > 1
    ? text(`lists.done.${change}`, { count: part.count })
    : text(`lists.doneAny.${change}`);
}

/** The one selected element as a part of a list item; `null` for anything else. */
export function partTarget(state: View): PartTarget | null {
  const id = state.selection[0];
  if (id === undefined || state.selection.length !== 1) return null;
  const list = state.inspected?.id === id ? (state.inspected.list ?? null) : null;
  if (list === null || list.root !== false) return null;
  const entry = state.structure?.elements.find((each) => each.id === id);
  // What stands in the expression's own place is no part: the root of a list whose copies
  // cannot be counted, or a condition's branch. It changes as the expression does.
  if (entry?.movable === 'in-expression') return null;
  const lists = entry?.lists ?? null;
  const root = lists === null ? null : (lists[lists.length - 1] ?? null);
  const shown = root === null ? null : countOf(state, root);
  return { id, root, count: shown ?? list.copies ?? null };
}

/** The note of a part: a change to it shows in every item. */
export function partNote(part: PartTarget): string {
  return part.count !== null && part.count > 1
    ? text('lists.note.part', { count: part.count })
    : text('lists.note.partAny');
}

/**
 * The selection the note's control makes: the item the part belongs to, on the copy the part was
 * chosen on. The part's path is the item's too (the same lists stand around both). Its place
 * among the item's copies is the part's own when the page shows one part for each item, else the
 * place the inspect counted for the path. `null` when the selection is no part with a named item.
 */
export function itemOfPart(state: View): Chosen | null {
  const part = partTarget(state);
  if (part === null || part.root === null) return null;
  const { root } = part;
  const copy = chosenCopy(state.selection, state.copies);
  if (copy === null) return { selection: [root], copies: [] };
  const items = countOf(state, root);
  const list = state.inspected?.list ?? null;
  const counted = list?.copy ?? null;
  const item =
    items !== null && countOf(state, part.id) === items
      ? copy.item
      : counted !== null && list?.copies === items
        ? counted
        : undefined;
  if (item === undefined && copy.path === undefined) return { selection: [root], copies: [] };
  const ref: CopyRef = {
    id: root,
    ...(item === undefined ? {} : { item }),
    ...(copy.path === undefined ? {} : { path: [...copy.path] }),
  };
  return { selection: [root], copies: [ref] };
}
