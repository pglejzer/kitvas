// Where the tools on the selection stand (redesign spec, goal 12; plan 19, task 4): the action bar
// or the variant pill, centred 8 px above the selected element; below it when there is no room
// above; hidden when neither fits, when the element is taller than the stage, and when nothing of
// it shows. Never outside the stage, never over a pill on the canvas or the ask bar (`keepOut`).
// Pixels are the stage's (`section.stage-canvas`), its top left corner at 0, 0. Pure.

import { type Box, type Size, unionBox } from '../../canvas/zoom.ts';

export type PageBox = Box;
export type { Size };
export { unionBox };

/** The room between the element and the tools. */
export const GAP = 8;
/** The room kept free inside the stage's edge, and around a pill or the ask bar. */
export const EDGE = 8;

/**
 * The part of `box` inside `to`; `null` when none of it is. A box with no width or height of its
 * own (an empty element) counts while it lies inside; one that is flat only because it was cut
 * lies at the edge, out of view.
 */
export function clipBox(box: PageBox, to: PageBox): PageBox | null {
  const left = Math.max(box.x, to.x);
  const top = Math.max(box.y, to.y);
  const right = Math.min(box.x + box.width, to.x + to.width);
  const bottom = Math.min(box.y + box.height, to.y + to.height);
  if (right < left || bottom < top) return null;
  const flat = right === left || bottom === top;
  if (flat && box.width > 0 && box.height > 0) return null;
  return { x: left, y: top, width: right - left, height: bottom - top };
}

const overlaps = (a: PageBox, b: PageBox): boolean =>
  a.x < b.x + b.width && b.x < a.x + a.width && a.y < b.y + b.height && b.y < a.y + a.height;

const clamp = (value: number, least: number, most: number): number =>
  Math.min(most, Math.max(least, value));

/** A box grown by `by` on every side. */
const grown = (box: PageBox, by: number): PageBox => ({
  x: box.x - by,
  y: box.y - by,
  width: box.width + 2 * by,
  height: box.height + 2 * by,
});

/**
 * The tools' top left corner for the selected element's `box` (in the stage's pixels, cut to what
 * shows of its card), the tools' size `bar`, the stage's size `view`, and the boxes they must not
 * cover; `null` to hide them. Above is tried first, then below. In each row the tools are centred
 * on what shows of the element and kept inside the stage; when a pill is in the way they move
 * beside it, as long as they still stand over the element.
 */
export function placeBar(
  box: PageBox | null,
  bar: Size,
  view: Size,
  keepOut: readonly PageBox[],
): { left: number; top: number } | null {
  if (box === null) return null;
  const shown = clipBox(box, { x: 0, y: 0, width: view.width, height: view.height });
  if (shown === null) return null;
  const leftMost = view.width - EDGE - bar.width;
  const topMost = view.height - EDGE - bar.height;
  if (leftMost < EDGE || topMost < EDGE) return null;
  const blocks = keepOut
    .filter((one) => one.width > 0 && one.height > 0)
    .map((one) => grown(one, EDGE));
  const centre = clamp(shown.x + shown.width / 2 - bar.width / 2, EDGE, leftMost);
  const rows = [shown.y - GAP - bar.height, shown.y + shown.height + GAP];
  for (const top of rows) {
    if (top < EDGE || top > topMost) continue;
    const row = { x: 0, y: top, width: view.width, height: bar.height };
    // Beside each block in this row, nearest to the centre first.
    const beside = blocks
      .filter((block) => overlaps(row, block))
      .flatMap((block) => [block.x - bar.width, block.x + block.width])
      .map((left) => clamp(left, EDGE, leftMost));
    const lefts = [centre, ...beside].sort((a, b) => Math.abs(a - centre) - Math.abs(b - centre));
    for (const left of lefts) {
      const at = { x: left, y: top, width: bar.width, height: bar.height };
      if (blocks.some((block) => overlaps(at, block))) continue;
      // Moved this far, the tools would stand over another element.
      if (left > shown.x + shown.width || left + bar.width < shown.x) continue;
      return { left, top };
    }
  }
  return null;
}
