// Select all (Ctrl or Cmd with A; ADR 0065). With a selection: every sibling of the first
// selected element. For a list item on a chosen copy the siblings are the items of its own list
// (the rows of that one plan); for a part of an item, its siblings on the same copies. With
// nothing selected: the page's sections. Pure over the store's state.

import { type CopyRef, MAX_COPIES, MAX_SELECTED } from '../../../channel/edit-protocol.ts';
import type { EditorState } from '../store.ts';
import { type Chosen, copiesOf } from './copies.ts';

type View = Pick<EditorState, 'selection' | 'copies' | 'structure' | 'inspected' | 'tree'>;

const sameList = (a: readonly string[], b: readonly string[]): boolean =>
  a.length === b.length && a.every((id, index) => id === b[index]);

/** The roots the sections return; for a draft without sections, every root there is. */
function sectionRoots(structure: NonNullable<EditorState['structure']>): string[] {
  const named = structure.sections.flatMap((section) =>
    section.element === null ? [] : [section.element],
  );
  if (named.length > 0) return named;
  return structure.elements.filter((entry) => entry.root === 'section').map((entry) => entry.id);
}

/**
 * Every item of the list the chosen copies `own` of the list root `id` stand in, `depth` lists
 * deep; `null` when the source view does not say how many items that list has.
 */
function itemsOf(
  state: View,
  id: string,
  own: readonly CopyRef[],
  depth: number,
): CopyRef[] | null {
  const list = state.inspected?.id === id ? (state.inspected.list ?? null) : null;
  const count = list?.kind === 'literal' ? list.count : null;
  if (count === null) return null;
  const size = Math.min(count, MAX_COPIES);
  // In a list inside no other, the place in the list is the place among the copies.
  if (depth === 1) {
    return Array.from({ length: size }, (_, place) => ({ id, item: place, path: [place] }));
  }
  // Inside another list the count is that of the one chosen copy's own list.
  const [copy] = own;
  const path = copy?.path;
  const last = path?.[path.length - 1];
  if (own.length !== 1 || copy === undefined || path === undefined || last === undefined) {
    return null;
  }
  const parents = path.slice(0, -1);
  return Array.from({ length: size }, (_, place) => ({
    id,
    // The items of one list stand one after another among the copies of the id.
    ...(copy.item === undefined ? {} : { item: copy.item - last + place }),
    path: [...parents, place],
  }));
}

/** What select-all selects now; `null` when there is nothing to select. */
export function selectAll(state: View): Chosen | null {
  const { structure } = state;
  if (!structure) return null;
  const sections = (): Chosen | null => {
    const roots = sectionRoots(structure).slice(0, MAX_SELECTED);
    return roots.length > 0 ? { selection: roots, copies: [] } : null;
  };
  const [first] = state.selection;
  const entry = structure.elements.find((each) => each.id === first);
  if (first === undefined || entry === undefined) return sections();
  const own = copiesOf(state.copies, first);
  const lists = entry.lists ?? [];
  if (own.length > 0 && lists[lists.length - 1] === first) {
    const items = itemsOf(state, first, own, lists.length);
    if (items !== null) return { selection: [first], copies: items };
    // In a list inside no other the element itself is every item. Inside another list the
    // items of that one list cannot be named now: what is chosen stays.
    return { selection: [first], copies: lists.length === 1 ? [] : own };
  }
  if (entry.parent === null) return sections();
  const siblings = structure.elements
    .filter((each) => each.parent === entry.parent)
    .slice(0, MAX_SELECTED);
  const selection = siblings.map((each) => each.id);
  if (own.length === 0) return { selection, copies: [] };
  // A part of a list item: its siblings on the copies it was chosen on, where the page shows as
  // many copies of the sibling as of the part. Any other sibling is selected as itself.
  const countOf = (id: string): number | undefined =>
    state.tree.find((node) => node.id === id)?.count;
  const copies = siblings.flatMap((each): CopyRef[] => {
    const alike = sameList(each.lists ?? [], lists) && countOf(each.id) === countOf(first);
    return alike ? own.map((one) => ({ ...one, id: each.id })) : [];
  });
  return { selection, copies: copies.slice(0, MAX_COPIES) };
}
