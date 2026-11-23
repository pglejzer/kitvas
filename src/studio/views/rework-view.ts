// What the studio shows of a rework's original ("version 0"): which picture, how many problems,
// and how many of them the current version fixed. Pure; the page reads the files.

import type { Before } from '../../checks/index.ts';

/** The `rework` block of a version's checks.json: the original's problems fixed and left. */
export type ReworkScore = { fixed: number; left: number };

export type OriginalView = {
  /** The original's problems; `null` when it was not measured. */
  problems: number | null;
  /** The path of the picture inside the draft; `null` when the original has none. */
  image: string | null;
};

/** The captured width nearest to `width`, a tie going to the wider; `null` without any. */
export function nearestShotWidth(widths: number[], width: number): number | null {
  let best: number | null = null;
  for (const candidate of widths) {
    if (best === null || Math.abs(candidate - width) <= Math.abs(best - width)) best = candidate;
  }
  return best;
}

/** The picture of a URL original is its shot nearest to the studio width; else its first image. */
export function originalView(before: Before, width: number): OriginalView {
  const problems =
    before.problems === null
      ? null
      : Object.values(before.problems.counts).reduce((sum, count) => sum + count, 0);
  const shot = nearestShotWidth(before.source.widths, width);
  const first = before.source.files[0];
  let image: string | null = null;
  if (before.source.source === 'url' && shot !== null) image = `before/shots/${shot}.png`;
  else if (first !== undefined) image = `before/images/${first}`;
  return { problems, image };
}
