// WCAG 2 contrast between two `#rrggbb` colours, and a colour laid over another with an alpha.
// Pure: the theme's tests use it, and the kit page shows a colour token's contrast with it.

import { luminance as wcagLuminance } from '../../shared/index.ts';

type Rgb = readonly [number, number, number];

/** `#rgb` or `#rrggbb` as 0 to 255 channels; `null` when it is neither. */
export function rgbOf(hex: string): Rgb | null {
  const short = /^#([0-9a-f])([0-9a-f])([0-9a-f])$/i.exec(hex);
  if (short) {
    const [, r = '0', g = '0', b = '0'] = short;
    return [Number.parseInt(r + r, 16), Number.parseInt(g + g, 16), Number.parseInt(b + b, 16)];
  }
  const long = /^#([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})$/i.exec(hex);
  if (!long) return null;
  const [, r = '00', g = '00', b = '00'] = long;
  return [Number.parseInt(r, 16), Number.parseInt(g, 16), Number.parseInt(b, 16)];
}

/** Relative luminance, 0 (black) to 1 (white). */
export function luminance([r, g, b]: Rgb): number {
  return wcagLuminance({ r, g, b, a: 1 });
}

/** The contrast ratio of two colours, 1 to 21; `null` when one is no hex colour. */
export function contrastRatio(a: string, b: string): number | null {
  const first = rgbOf(a);
  const second = rgbOf(b);
  if (!first || !second) return null;
  const [light, dark] = [luminance(first), luminance(second)].sort((x, y) => y - x);
  return ((light ?? 0) + 0.05) / ((dark ?? 0) + 0.05);
}

/** `top` at `alpha` over `under`, as `#rrggbb`; `null` when one is no hex colour. */
export function laidOver(top: string, alpha: number, under: string): string | null {
  const over = rgbOf(top);
  const base = rgbOf(under);
  if (!over || !base) return null;
  const mix = (index: 0 | 1 | 2): string =>
    Math.round(over[index] * alpha + base[index] * (1 - alpha))
      .toString(16)
      .padStart(2, '0');
  return `#${mix(0)}${mix(1)}${mix(2)}`;
}

/** `#rrggbb` with an alpha as a CSS colour: `rgb(r g b / alpha)`. */
export function withAlpha(hex: string, alpha: number): string {
  const rgb = rgbOf(hex);
  if (!rgb) return hex;
  return `rgb(${rgb[0]} ${rgb[1]} ${rgb[2]} / ${alpha})`;
}
