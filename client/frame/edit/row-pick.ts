// What a press in the frame takes inside a list (ADR 0069). A list item is the root a `.map`
// callback returns, of a list the editor can write (`FrameEntry.item`, ADR 0065). A press inside
// one takes the item first, on the copy pressed, and the element under the pointer once that copy
// of the item, or something inside it, is chosen. The hover outline shows what a plain click would
// take; a right click keeps a chosen item. The rule and the facts it reads are pure over plain
// values; the reader of the page comes last.

import type { FrameEntry } from '../../channel/structure-protocol.ts';
import { type Chosen, chosenElements, PAGE } from './items.ts';

export type RowFacts = {
  /**
   * The nearest list item at or above the pressed element, on its copy; `null`: none, or the
   * lists are not known.
   */
  row: string | null;
  /** The pressed element is that item itself. */
  isRow: boolean;
  /** That item, on this copy, is selected. */
  rowTaken: boolean;
  /** Something inside that item, on this copy, is selected. */
  inRow: boolean;
};

/** How an element was pressed: with the add key (`addsToSelection`), as a double click. */
export type Press = { add: boolean; double: boolean };

/** A plain click: what the hover outline shows. */
export const PLAIN: Press = { add: false, double: false };

/**
 * A right click: the item, also when it is chosen already, so its menu is the item's; the element
 * under the pointer while a part of the item is chosen.
 */
export const MENU: Press = { add: true, double: false };

/**
 * Whether the press takes the row (`true`) or the element under the pointer (`false`). A double
 * click edits the text under the pointer. While a part inside the row is chosen, parts are being
 * chosen: the element under the pointer. A plain click on a chosen row goes into it. With the add
 * key a chosen row is taken again, so it leaves the selection.
 */
export function takesRow(facts: RowFacts, press: Press): boolean {
  if (press.double || facts.row === null || facts.isRow || facts.inRow) return false;
  return press.add || !facts.rowTaken;
}

/** What the rule reads of an element in the structure. */
export type Listed = Pick<FrameEntry, 'lists' | 'item'>;

/** How the rule reads the page; plain values stand in for elements in the tests. */
export type RowReader<T> = {
  /** The element id `node` carries; `null` for none. */
  idOf(node: T): string | null;
  /** `node` itself or its nearest ancestor that carries `id`; `null` when none does. */
  closest(node: T, id: string): T | null;
  /** `node` lies inside `within` and is not `within`. */
  inside(node: T, within: T): boolean;
};

/**
 * The list item around `pressed`, or `pressed` itself: of the lists its entry names (outer first)
 * the innermost whose root is an item, on the copy around `pressed`. `null` when it stands in no
 * list, when its lists are not known (`lists: null`, or no entry yet), or when the page has no
 * copy of that root around it.
 */
export function rowAround<T>(
  pressed: T,
  entryOf: (id: string) => Listed | undefined,
  read: RowReader<T>,
): T | null {
  const id = read.idOf(pressed);
  const lists = id === null ? null : (entryOf(id)?.lists ?? null);
  if (lists === null) return null;
  const root = lists.findLast((list) => entryOf(list)?.item === true);
  return root === undefined ? null : read.closest(pressed, root);
}

/**
 * The facts of a press on `pressed` whose row is `row` (`rowAround`). `selected`: the elements
 * the selection outlines, so of an id with chosen copies only those.
 */
export function rowFacts<T>(
  pressed: T,
  row: T | null,
  selected: readonly T[],
  read: RowReader<T>,
): RowFacts {
  if (row === null) return { row: null, isRow: false, rowTaken: false, inRow: false };
  return {
    row: read.idOf(row),
    isRow: row === pressed,
    rowTaken: selected.includes(row),
    inRow: selected.some((element) => read.inside(element, row)),
  };
}

/** What a press reads: the structure, the selected elements and the page. */
export type RowScene<T> = {
  entryOf(id: string): Listed | undefined;
  /** The elements the selection outlines; read only for a press inside a row. */
  selected(): readonly T[];
  read: RowReader<T>;
};

/** The element a press on `pressed` takes: its row when `takesRow` says so, else `pressed`. */
export function pressTarget<T>(pressed: T | null, press: Press, scene: RowScene<T>): T | null {
  if (pressed === null || press.double) return pressed;
  const row = rowAround(pressed, scene.entryOf, scene.read);
  if (row === null || row === pressed) return pressed;
  const facts = rowFacts(pressed, row, scene.selected(), scene.read);
  return takesRow(facts, press) ? row : pressed;
}

// The page's side: a thin reader for the rules above.

export const ROW_PAGE: RowReader<Element> = {
  idOf: (node) => node.getAttribute('data-ks'),
  closest: (node, id) => PAGE.closest(node, id),
  inside: (node, within) => node !== within && within.contains(node),
};

/** What the frame knows when a press comes: the structure's entries and the page's selection. */
export type PressState = {
  entries: ReadonlyMap<string, Listed>;
  selected: ReadonlySet<string>;
  chosen: Chosen;
};

/**
 * The element a press on `pressed` (the marked element under the pointer) takes, read from the
 * page: its row (`pressTarget`), else `pressed` itself.
 */
export function pressedElement(
  pressed: Element | null,
  press: Press,
  state: PressState,
): Element | null {
  return pressTarget(pressed, press, {
    entryOf: (id) => state.entries.get(id),
    selected: () => chosenElements(state.selected, state.chosen),
    read: ROW_PAGE,
  });
}
