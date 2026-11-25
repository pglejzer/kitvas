// The places a dragged list item can go (ADRs 0059 and 0066). Every copy a `.map` renders carries
// the same element id. The copies that stand in one copy of the list root one level out are one
// list, and copy `n` of a list is item `n` of its array. The only slots are before or after
// another copy: in the item's own list, or in the same list of another parent. A drop names the
// path the item has afterwards. Pure geometry over boxes in the frame's viewport pixels, on top
// of `slotFrom`; `page-read.ts` reads the page for it.

import { type Box, distance, type Flow, type Point, type Slot, slotFrom } from './slots.ts';

/** A place among the copies of one list. */
export type ItemSlot = {
  /** The index the dragged item has in that list after the drop. */
  to: number;
  /** The copy the line is drawn beside, and on which side of it in the order of the data. */
  anchor: number;
  place: 'before' | 'after';
  line: NonNullable<Slot['line']>;
};

/** The copies of one list as the page lays them out. */
export type ItemRow = {
  /** The box of the element the copies sit in. */
  parent: Box;
  /** How that element lays its children out. */
  flow: Flow;
  /** Every copy's box in document order: copy `n` is item `n`. */
  copies: readonly Box[];
};

/**
 * How far outside a list's parent the pointer still finds a slot in it, in pixels on the screen
 * (the caller multiplies by the canvas scale). Within it of the item's own list, the slot stays
 * in that list.
 */
export const ITEM_REACH = 32;

/**
 * The index an item has once it stands `place` the item at `anchor`. `from`: its own index when
 * it comes from the same list, `null` when it comes from another one.
 */
export function indexAfter(from: number | null, anchor: number, place: 'before' | 'after'): number {
  const target = place === 'before' ? anchor : anchor + 1;
  // Taking the item out of its own list first moves everything after it one place down.
  return from !== null && from < target ? target - 1 : target;
}

function within(point: Point, box: Box, reach: number): boolean {
  return (
    point.x >= box.left - reach &&
    point.x <= box.left + box.width + reach &&
    point.y >= box.top - reach &&
    point.y <= box.top + box.height + reach
  );
}

/**
 * The slot in one list with the pointer at `point`: beside the nearest copy other than the
 * dragged one (`from`; `null` when the item comes from another list), on the pointer's half of it
 * along the parent's axis. `null` with no such copy, or with the pointer more than `reach` outside
 * the parent. A slot whose `to` is `from` is the item's own place: it is shown, and a drop there
 * changes nothing.
 */
export function itemSlot(
  point: Point,
  row: ItemRow,
  from: number | null,
  reach: number = ITEM_REACH,
): ItemSlot | null {
  if (!within(point, row.parent, reach)) return null;
  const children = row.copies
    // The index stands in for the id: every copy has the same one.
    .map((box, index) => ({ id: String(index), box }))
    // The dragged copy is no place to go, and a hidden copy takes no part in the layout.
    .filter(({ box }, index) => index !== from && (box.width > 0 || box.height > 0));
  const parent = {
    id: '',
    box: row.parent,
    axis: row.flow.axis,
    reverse: row.flow.reverse,
    children,
  };
  const slot = slotFrom(point, parent, false);
  if (!slot?.line) return null;
  const anchor = Number(slot.anchor);
  const place = slot.place === 'before' ? 'before' : 'after';
  return { to: indexAfter(from, anchor, place), anchor, place, line: slot.line };
}

/** The copies of one list, and the copy of the root one level out they stand in. */
export type CopyGroup<T> = { outer: T | null; copies: T[] };

/**
 * The lists the copies of one item id make: the copies that stand in the same copy of the root
 * one level out are one list, in page order. `outerOf` answers that copy; without it the list has
 * no list around it and all the copies are one list. A copy that stands in no copy of the outer
 * root is in no list.
 */
export function listsOf<T>(copies: readonly T[], outerOf?: (copy: T) => T | null): CopyGroup<T>[] {
  if (!outerOf) return copies.length > 0 ? [{ outer: null, copies: [...copies] }] : [];
  const groups = new Map<T, T[]>();
  for (const copy of copies) {
    const outer = outerOf(copy);
    if (outer === null) continue;
    const group = groups.get(outer);
    if (group) group.push(copy);
    else groups.set(outer, [copy]);
  }
  return [...groups].map(([outer, list]) => ({ outer, copies: list }));
}

/** One list on the page. `prefix`: the path of the copy of the root one level out it stands in. */
export type ItemList = ItemRow & { prefix: readonly number[] };

/** Where the dragged item stands: which list, and its index there. */
export type OwnPlace = { list: number; index: number };

/** A place for a dragged item among the lists of its id. */
export type ListSlot = ItemSlot & {
  /** Which of the lists takes the item. */
  list: number;
  /** The path the item has after the drop: the list's prefix, then `to`. */
  path: number[];
  /** The box of the element that list's copies sit in, for the outline. */
  box: Box;
};

/**
 * The slot for a dragged item among `lists`. While the pointer is inside the parent of the item's
 * own list, or within `reach` outside it, the slot is in that list (a list is left on purpose,
 * ADR 0066). Further away the list whose parent is nearest takes over, within `reach` of it. In
 * its own list `to` counts the item as taken out first; in another list it is the place among
 * that list's items as they are. `null` with no list in reach or no copy there to go beside.
 */
export function listSlot(
  point: Point,
  lists: readonly ItemList[],
  own: OwnPlace | null,
  reach: number = ITEM_REACH,
): ListSlot | null {
  const home = own === null ? undefined : lists[own.list];
  let at = own !== null && home !== undefined && within(point, home.parent, reach) ? own.list : -1;
  if (at < 0) {
    let best = Number.POSITIVE_INFINITY;
    for (const [index, list] of lists.entries()) {
      const far = distance(point, list.parent);
      if (far >= best || !within(point, list.parent, reach)) continue;
      best = far;
      at = index;
    }
  }
  const list = lists[at];
  if (list === undefined) return null;
  const from = own !== null && own.list === at ? own.index : null;
  const slot = itemSlot(point, list, from, reach);
  if (slot === null) return null;
  return { ...slot, list: at, path: [...list.prefix, slot.to], box: list.parent };
}
