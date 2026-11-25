// Where a lens pin goes in the frame, and which pin a click hit (redesign spec, goal 9; plan 19,
// task 1). No DOM here: boxes in page coordinates come in, positions go out. A pin sits above its
// element's top-left corner, never past the page's width (so it adds no horizontal scroll bar), and
// never on a pin placed before it: the pins of one element stack downward.

import type { Point, Rect } from '../drag/place.ts';

export type Size = { width: number; height: number };

/** A pin's height (mock v10: 22 px), and the width of a card pin, which wraps. */
export const PIN_HEIGHT = 22;
export const CARD_WIDTH = 214;
/** Between a pin and its element's edge, and between two stacked pins. */
export const PIN_GAP = 2;

const overlaps = (a: Rect, b: Rect): boolean =>
  a.left < b.left + b.width &&
  b.left < a.left + a.width &&
  a.top < b.top + b.height &&
  b.top < a.top + a.height;

/**
 * Where a pin of `size` goes, in page coordinates: just above the element's top-left corner, moved
 * left to stay inside `pageWidth` and never left of 0. An element with no room above it (one at the
 * very top) gets its pin inside its top-left corner. A pin that would cover one of `taken` (the pins
 * placed before it) moves below it, again until it covers none.
 */
export function placeLensPin(
  element: Rect,
  size: Size,
  pageWidth: number,
  taken: readonly Rect[],
): Point {
  const right = Math.max(0, pageWidth - size.width);
  const left = Math.min(Math.max(0, element.left), right);
  const above = element.top - size.height - PIN_GAP;
  let top = above >= 0 ? above : Math.max(0, element.top) + PIN_GAP;
  // Only a pin that shares this one's columns can be in its way; the highest first.
  const column = taken
    .filter((rect) => rect.left < left + size.width && left < rect.left + rect.width)
    .sort((a, b) => a.top - b.top);
  // Each move goes below a pin it covered, so it ends after at most one move per pin.
  let moved = true;
  while (moved) {
    moved = false;
    for (const rect of column) {
      if (!overlaps({ left, top, width: size.width, height: size.height }, rect)) continue;
      top = rect.top + rect.height + PIN_GAP;
      moved = true;
    }
  }
  return { left, top };
}

/**
 * The pin under a point, as an index into `boxes` (viewport boxes, in the order the pins were
 * drawn): the last one that holds it, as a later pin is drawn over an earlier one; -1 for none.
 */
export function pinAt(boxes: readonly Rect[], x: number, y: number): number {
  for (let index = boxes.length - 1; index >= 0; index -= 1) {
    const box = boxes[index];
    if (!box) continue;
    const inside =
      x >= box.left && x < box.left + box.width && y >= box.top && y < box.top + box.height;
    if (inside) return index;
  }
  return -1;
}
