// The kit's colour token nearest to a colour (plan 18f, task 4). Pure: a token is a candidate when
// it is an opaque colour; the distance is the "redmean" approximation of how far apart two sRGB
// colours look, cheap and close enough to pick `ink` for a hand-written blue-black.

import type { TokenOption } from '../../../../src/edit/index.ts';
import { CANVAS, over, parseColour, type Rgba } from '../live/colour.ts';

/** How far apart two opaque colours look; 0 for the same colour. */
export function colourDistance(one: Rgba, two: Rgba): number {
  const mean = (one.r + two.r) / 2;
  const dr = one.r - two.r;
  const dg = one.g - two.g;
  const db = one.b - two.b;
  return Math.sqrt((2 + mean / 256) * dr * dr + 4 * dg * dg + (2 + (255 - mean) / 256) * db * db);
}

/** The kit's colour tokens that are opaque, each with its colour read. */
export function colourTokens(tokens: readonly TokenOption[]): { token: TokenOption; rgba: Rgba }[] {
  return tokens.flatMap((token) => {
    const rgba = token.type === 'color' ? parseColour(token.css) : null;
    return rgba !== null && rgba.a >= 1 ? [{ token, rgba }] : [];
  });
}

/**
 * The colour token nearest to `value` (a hex or `rgb()` written in the source); the first of equals.
 * `null` when the value is not a colour kitvas reads (a name, a function) or the kit has no colour.
 */
export function nearestColourToken(
  value: string,
  tokens: readonly TokenOption[],
): TokenOption | null {
  const read = parseColour(value);
  if (read === null) return null;
  const shown = over(read, CANVAS);
  let best: { token: TokenOption; distance: number } | null = null;
  for (const { token, rgba } of colourTokens(tokens)) {
    const distance = colourDistance(shown, rgba);
    if (best === null || distance < best.distance) best = { token, distance };
  }
  return best?.token ?? null;
}

/** The name a card gives a colour token: its path without the group (`color.inkMid` is `inkMid`). */
export const tokenLabel = (token: TokenOption): string => token.path.replace(/^colou?rs?\./, '');
