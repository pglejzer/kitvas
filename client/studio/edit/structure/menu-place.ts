// Where the context menu stands and what it selects: pure rules of `menu.ts`, kept apart so the
// menu's own file stays short. Pixels are the page's unless a name says the frame's.

import { type Chosen, copiesOf, pickSelection, refOf, sameCopy, settle } from '../select/copies.ts';

export type Box = { left: number; top: number };

/** A point in the frame's CSS pixels as page pixels, through the frame's box and the zoom. */
export function toPagePoint(box: Box, zoom: number, point: { x: number; y: number }) {
  return { x: box.left + point.x * zoom, y: box.top + point.y * zoom };
}

/** Keeps the menu on screen: moved left or up by the amount it would stick out. */
export function clampToView(
  at: { x: number; y: number },
  size: { width: number; height: number },
  view: { width: number; height: number },
): { x: number; y: number } {
  return {
    x: Math.max(0, Math.min(at.x, view.width - size.width)),
    y: Math.max(0, Math.min(at.y, view.height - size.height)),
  };
}

/** The ids the menu acts on: a right click on an element outside the selection selects it first. */
export function selectionFor(selection: readonly string[], id: string | null): string[] {
  if (id === null || selection.includes(id)) return [...selection];
  return [id];
}

/** A box in frame pixels as page pixels: its corner moves like a point, its size scales. */
export function toPageBox(
  frame: Box,
  zoom: number,
  box: { x: number; y: number; width: number; height: number },
): { x: number; y: number; width: number; height: number } {
  const corner = toPagePoint(frame, zoom, box);
  return { ...corner, width: box.width * zoom, height: box.height * zoom };
}

/**
 * The selection a right click leaves. A click on a copy that is chosen already changes nothing; on
 * another copy it selects that one copy as a plain left click would; on no copy it is
 * `selectionFor`, and the copies of ids that left the selection go.
 */
export function menuSelection(
  current: Chosen,
  id: string | null,
  at: { item?: number | undefined; path?: readonly number[] | undefined },
): Chosen {
  if (id !== null && (at.item !== undefined || at.path !== undefined)) {
    const ref = refOf(id, at);
    const chosen =
      current.selection.includes(id) &&
      copiesOf(current.copies, id).some((copy) => sameCopy(copy, ref));
    return chosen ? current : pickSelection(current, { id, add: false, ...at });
  }
  const selection = selectionFor(current.selection, id);
  const same =
    selection.length === current.selection.length &&
    selection.every((one, index) => one === current.selection[index]);
  return same ? current : { selection, copies: settle(selection, current.copies).copies };
}
