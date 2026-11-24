// The places a dragged list item can go (ADR 0059). Every copy a `.map` renders carries the same
// element id, and copy `n` in document order is item `n` of the data: the only slots are before
// or after another copy, and a drop names the index the item has afterwards. Pure geometry over
// boxes in the frame's viewport pixels, on top of `slotFrom`; `drag.ts` reads the page for it.

import { type Box, type Flow, type Point, type Slot, slotFrom } from './slots.ts';

/** A place among the copies of a list item. */
export type ItemSlot = {
  /** The index the dragged item has after the drop: `moveItem`'s `to`. */
  to: number;
  /** The copy the line is drawn beside, and on which side of it in the order of the data. */
  anchor: number;
  place: 'before' | 'after';
  line: NonNullable<Slot['line']>;
};

/** The copies of one list item as the page lays them out. */
export type ItemRow = {
  /** The box of the element the copies sit in. */
  parent: Box;
  /** How that element lays its children out. */
  flow: Flow;
  /** Every copy's box in document order: copy `n` is item `n`. */
  copies: readonly Box[];
};

/** How far outside the copies' parent the pointer still finds a slot, in frame pixels. */
export const ITEM_REACH = 32;

/** The index the item at `from` has once it stands `place` the item at `anchor`. */
export function indexAfter(from: number, anchor: number, place: 'before' | 'after'): number {
  const target = place === 'before' ? anchor : anchor + 1;
  // Taking the item out first moves everything after it one place down.
  return from < target ? target - 1 : target;
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
 * The slot for the copy `from` with the pointer at `point`: beside the nearest other copy, on the
 * pointer's half of it along the parent's axis. `null` with no other copy to go beside, or with
 * the pointer more than `reach` outside the parent. A slot whose `to` is `from` is the item's own
 * place: it is shown, and a drop there changes nothing.
 */
export function itemSlot(
  point: Point,
  row: ItemRow,
  from: number,
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
