// The selection rectangle's geometry (spec 4b, goals: selection additions; plan 14, task C2).
// No DOM here: boxes come in, the ids the rectangle takes go out. `drag.ts` measures and draws.

import type { Box, Point } from './slots.ts';

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

/** One `[data-ks]` element, in document order. */
export type RectItem = {
  /** `null` for an id the studio would refuse: never taken, and it hides nothing below it. */
  id: string | null;
  box: Box;
  /** Index of the nearest item the element sits in, or -1. It comes before this one. */
  parent: number;
};

/**
 * The ids a rectangle takes: the outermost elements whose boxes lie fully inside it, in document
 * order. An element inside a taken one is left out, since its parent already stands for it. Each
 * id once (the items of a mapped list share one), at most `limit`.
 */
export function outermost(items: readonly RectItem[], rect: Box, limit: number): string[] {
  /** The item, or one it sits in, is inside the rectangle. */
  const under: boolean[] = [];
  const taken = new Set<string>();
  for (const [index, item] of items.entries()) {
    const covered = under[item.parent] === true;
    const id = item.id !== null && contains(rect, item.box) ? item.id : null;
    under[index] = covered || id !== null;
    if (id === null || covered || taken.size >= limit) continue;
    taken.add(id);
  }
  return [...taken];
}
