// The selection rectangle's geometry (ADRs 0059 and 0066). No DOM here: boxes come in, what the
// rectangle takes goes out. `drag.ts` measures and draws.

import type { Box, Point } from '../drag/slots.ts';

/** The box between two corners, whichever way the pointer went. */
export function rectOf(a: Point, b: Point): Box {
  return {
    left: Math.min(a.x, b.x),
    top: Math.min(a.y, b.y),
    width: Math.abs(a.x - b.x),
    height: Math.abs(a.y - b.y),
  };
}

/** The box has a size: a hidden element has neither a width nor a height. */
const sized = (box: Box): boolean => box.width > 0 || box.height > 0;

/** `box` lies fully inside `rect`. A box without a size (a hidden element) is inside nothing. */
export function contains(rect: Box, box: Box): boolean {
  if (!sized(box)) return false;
  return (
    box.left >= rect.left &&
    box.top >= rect.top &&
    box.left + box.width <= rect.left + rect.width &&
    box.top + box.height <= rect.top + rect.height
  );
}

/**
 * `rect` and `box` share some room. Edges that only meet do not count, and a box without a size
 * (a hidden element) is touched by nothing; a rectangle drawn as a straight line still touches.
 */
export function touches(rect: Box, box: Box): boolean {
  if (!sized(box)) return false;
  return (
    rect.left < box.left + box.width &&
    box.left < rect.left + rect.width &&
    rect.top < box.top + box.height &&
    box.top < rect.top + rect.height
  );
}

/** One `[data-ks]` element, in document order. */
export type RectItem = {
  /** `null` for one that is never taken (an odd id, a locked element): it hides nothing below it. */
  id: string | null;
  box: Box;
  /** Index of the nearest item the element sits in, or -1. It comes before this one. */
  parent: number;
};

/**
 * What a rectangle takes: the place in `items` of every element taken, in document order, and
 * its box for the outline. Every rendered copy is an element of its own here.
 */
export type Taken = { taken: number[]; boxes: Box[] };

/**
 * What a rectangle takes (ADR 0066), from the outermost elements inwards:
 * - an element that lies fully inside it is taken whole, and nothing inside that one;
 * - an element it covers only in part is not taken, and each of its children gets the same test;
 * - an element it covers only in part that has no element children is taken.
 * So a rectangle around two cards takes the two cards, one across three rows of a card takes the
 * rows, and a container that holds the whole rectangle is never taken for it, however far outside
 * the content the rectangle starts. At most `limit` elements.
 */
export function takenBy(items: readonly RectItem[], rect: Box, limit: number): Taken {
  /** How many children with a size each item has. */
  const children: number[] = items.map(() => 0);
  for (const item of items) {
    if (item.parent < 0 || !sized(item.box)) continue;
    children[item.parent] = (children[item.parent] ?? 0) + 1;
  }
  /** The item, or one it sits in, is taken. */
  const under: boolean[] = [];
  const taken: number[] = [];
  const boxes: Box[] = [];
  for (const [index, item] of items.entries()) {
    const covered = under[item.parent] === true;
    const whole = contains(rect, item.box);
    const leaf = children[index] === 0 && touches(rect, item.box);
    const own = !covered && item.id !== null && (whole || leaf);
    under[index] = covered || own;
    if (!own || taken.length >= limit) continue;
    taken.push(index);
    boxes.push(item.box);
  }
  return { taken, boxes };
}

/** The element's box in the frame's viewport pixels, as `getBoundingClientRect` answers. */
export const boxOf = (element: Element): Box => {
  const { left, top, width, height } = element.getBoundingClientRect();
  return { left, top, width, height };
};

/** The element's box in page coordinates: the viewport box moved by the scroll. */
export const pageRect = (element: Element): Box => {
  const { left, top, width, height } = element.getBoundingClientRect();
  return { left: left + scrollX, top: top + scrollY, width, height };
};
