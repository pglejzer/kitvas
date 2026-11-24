// The selection rectangle's geometry (ADR 0059). No DOM here: boxes come in, what the rectangle
// takes goes out. `drag.ts` measures and draws.

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

/** `box` lies fully inside `rect`. A box without a size (a hidden element) is inside nothing. */
export function contains(rect: Box, box: Box): boolean {
  if (box.width <= 0 && box.height <= 0) return false;
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
  if (box.width <= 0 && box.height <= 0) return false;
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

/** What a rectangle takes: the ids, and the box of every taken element for the outline. */
export type Taken = { ids: string[]; boxes: Box[] };

/**
 * What a rectangle takes: the elements it touches that do not hold it whole, the outermost of
 * those, in document order. So a rectangle across two cards takes the two cards, one inside a
 * card across three rows takes the rows, and a container the rectangle lies inside is never taken
 * for it. An element inside a taken one is left out, since that one already stands for it. Each
 * id once (the items of a mapped list share one), at most `limit` ids.
 */
export function takenBy(items: readonly RectItem[], rect: Box, limit: number): Taken {
  /** The item, or one it sits in, is taken. */
  const under: boolean[] = [];
  const ids = new Set<string>();
  const boxes: Box[] = [];
  for (const [index, item] of items.entries()) {
    const covered = under[item.parent] === true;
    const { id } = item;
    const own =
      !covered && id !== null && touches(rect, item.box) && !contains(item.box, rect) ? id : null;
    under[index] = covered || own !== null;
    if (own === null || (!ids.has(own) && ids.size >= limit)) continue;
    ids.add(own);
    boxes.push(item.box);
  }
  return { ids: [...ids], boxes };
}
