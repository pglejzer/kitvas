// The colour maths of the live checks (spec 4c, goals 5 and 7; plan 16, task C): colours as the
// browser computes them, compositing, and the WCAG 2.2 contrast ratio with its thresholds. No DOM
// here. The page keeps a copy of this file (`client/studio/edit/live/colour.ts`) for its picker
// warnings, because the two bundles share only `client/channel/`; a test keeps the two in step.

/** A colour in sRGB: channels 0 to 255, alpha 0 to 1. */
export type Rgba = { r: number; g: number; b: number; a: number };

/** WCAG 2.2, 1.4.3 (AA) and 1.4.6 (AAA): the ratio normal and large text need. */
export const AA = { normal: 4.5, large: 3 } as const;
export const AAA = { normal: 7, large: 4.5 } as const;
/** Large text: 24 px, or 18.66 px (14 pt) at a bold weight. */
export const LARGE_PX = 24;
export const LARGE_BOLD_PX = 18.66;
export const BOLD = 700;
/** WCAG 2.2, 2.5.8: a target is at least 24 by 24 CSS pixels. */
export const MIN_TARGET = 24;

/** What a page with no background of its own is painted on. */
export const CANVAS: Rgba = { r: 255, g: 255, b: 255, a: 1 };

const HEX = /^#([0-9a-f]{3,8})$/;
const RGB = /^rgba?\(([^()]*)\)$/;
const SRGB = /^color\(\s*srgb\s+([^()]*)\)$/;

const clamp = (value: number, low: number, high: number): number =>
  Math.min(high, Math.max(low, value));

/** One channel: a number on `scale` (255 for `rgb()`, 1 for `color(srgb …)`) or a percentage. */
function channel(text: string, scale: number): number | null {
  const value = text.trim();
  const percent = value.endsWith('%');
  const number = Number(percent ? value.slice(0, -1) : value);
  if (value === '' || !Number.isFinite(number)) return null;
  return clamp(percent ? number * 2.55 : (number * 255) / scale, 0, 255);
}

function alphaOf(text: string | undefined): number | null {
  if (text === undefined) return 1;
  const value = text.trim();
  const percent = value.endsWith('%');
  const number = Number(percent ? value.slice(0, -1) : value);
  if (value === '' || !Number.isFinite(number)) return null;
  return clamp(percent ? number / 100 : number, 0, 1);
}

/** The inside of `rgb(…)` or `color(srgb …)`, with commas or spaces and an optional `/ alpha`. */
function fromParts(body: string, scale: number): Rgba | null {
  const halves = body.split('/');
  if (halves.length > 2) return null;
  const colours = (halves[0] ?? '').trim();
  const parts = colours.includes(',') ? colours.split(',') : colours.split(/\s+/);
  const slash = halves[1];
  if (slash !== undefined ? parts.length !== 3 : parts.length !== 3 && parts.length !== 4) {
    return null;
  }
  const [r, g, b] = parts.slice(0, 3).map((part) => channel(part, scale));
  const a = alphaOf(slash ?? parts[3]);
  if (r == null || g == null || b == null || a === null) return null;
  return { r, g, b, a };
}

function fromHex(digits: string): Rgba | null {
  const short = digits.length === 3 || digits.length === 4;
  if (!short && digits.length !== 6 && digits.length !== 8) return null;
  const pairs = short ? [...digits].map((digit) => digit + digit) : (digits.match(/../g) ?? []);
  const [r = 0, g = 0, b = 0, a = 255] = pairs.map((pair) => Number.parseInt(pair, 16));
  return { r, g, b, a: a / 255 };
}

/**
 * A colour as `getComputedStyle` writes it (`rgb(…)`, `rgba(…)`, `color(srgb …)`), or as hex;
 * `null` for anything else (the frame paints those on a canvas to read them).
 */
export function parseColour(text: string): Rgba | null {
  const value = text.trim().toLowerCase();
  if (value === 'transparent') return { r: 0, g: 0, b: 0, a: 0 };
  const hex = HEX.exec(value);
  if (hex) return fromHex(hex[1] ?? '');
  const rgb = RGB.exec(value);
  if (rgb) return fromParts(rgb[1] ?? '', 255);
  const srgb = SRGB.exec(value);
  if (srgb) return fromParts(srgb[1] ?? '', 1);
  return null;
}

/** `top` painted over `bottom` (source-over). */
export function over(top: Rgba, bottom: Rgba): Rgba {
  const a = top.a + bottom.a * (1 - top.a);
  if (a <= 0) return { r: 0, g: 0, b: 0, a: 0 };
  const mix = (front: number, back: number): number =>
    (front * top.a + back * bottom.a * (1 - top.a)) / a;
  return { r: mix(top.r, bottom.r), g: mix(top.g, bottom.g), b: mix(top.b, bottom.b), a };
}

const linear = (value: number): number => {
  const c = value / 255;
  return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
};

/** WCAG 2.2 relative luminance of an opaque colour. */
export function luminance(colour: Rgba): number {
  return 0.2126 * linear(colour.r) + 0.7152 * linear(colour.g) + 0.0722 * linear(colour.b);
}

/** The contrast ratio of two opaque colours, 1 to 21. */
export function contrastRatio(one: Rgba, two: Rgba): number {
  const a = luminance(one);
  const b = luminance(two);
  return (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05);
}

/** Text of `text` colour on `background`, both made opaque the way the page paints them. */
export function textContrast(text: Rgba, background: Rgba): number {
  const behind = over(background, CANVAS);
  return contrastRatio(over(text, behind), behind);
}

export function isLargeText(px: number, weight: number): boolean {
  return px >= LARGE_PX || (px >= LARGE_BOLD_PX && weight >= BOLD);
}

/** The AA ratio text needs. */
export const neededRatio = (large: boolean): number => (large ? AA.large : AA.normal);
/** The AAA ratio text needs. */
export const enhancedRatio = (large: boolean): number => (large ? AAA.large : AAA.normal);

/** A ratio cut (never rounded up) to two decimals, so 4.499 never shows as a passing 4.5. */
export const shownRatio = (ratio: number): number => Math.floor(ratio * 100) / 100;

/** A box meets the minimum target size; a hundredth of a pixel of layout rounding is forgiven. */
export const targetOk = (width: number, height: number): boolean =>
  width + 0.01 >= MIN_TARGET && height + 0.01 >= MIN_TARGET;

/** `rgb(r, g, b)`, or `rgba(r, g, b, a)` when it is not opaque. */
export function formatRgb(colour: Rgba): string {
  const [r, g, b] = [colour.r, colour.g, colour.b].map((value) => Math.round(value));
  if (colour.a >= 1) return `rgb(${r}, ${g}, ${b})`;
  return `rgba(${r}, ${g}, ${b}, ${Math.round(colour.a * 1000) / 1000})`;
}
