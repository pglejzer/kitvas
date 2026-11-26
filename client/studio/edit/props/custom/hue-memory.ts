// The hue a grey forgets (the "Custom..." colour picker, ADR 0077). Black, white and every grey
// have no hue of their own, and black has no saturation either: a picker drawn again from such a
// colour (the panel draws again after every write) would jump back to red. This keeps the hue and
// the saturation the person set last, for as long as the colour is still the one the picker made.
// Pure: no DOM.

import type { Hsva } from './colour-math.ts';

let last: { css: string; h: number; s: number } | null = null;

/** The picker moved: `css` is the colour it shows now. */
export function rememberHue(css: string, hsva: Hsva): void {
  last = { css, h: hsva.h, s: hsva.s };
}

/** The hue and saturation set last, when `css` is still that colour; else `null`. */
export function recallHue(css: string): { h: number; s: number } | null {
  return last !== null && last.css === css ? { h: last.h, s: last.s } : null;
}

/** Forgets what was kept: for a test that starts clean. */
export function forgetHue(): void {
  last = null;
}

/**
 * Where a picker starts for the colour `read`, with what `kept` holds for it: a grey takes the
 * kept hue, and black the kept saturation too, so the knobs stay where the person left them.
 */
export function startOf(read: Hsva, kept: { h: number; s: number } | null): Hsva {
  if (kept === null) return read;
  if (read.v === 0) return { ...read, h: kept.h, s: kept.s };
  return read.s === 0 ? { ...read, h: kept.h } : read;
}
