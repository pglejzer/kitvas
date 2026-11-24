// The page's copy of the live checks' colour maths (`client/frame/live/colour.ts`), for the picker
// warnings and the accessibility card's verdicts: the frame bundle and the page bundle share only
// `client/channel/`. A test holds the two copies to the same answers; change both together.

/** A colour in sRGB: channels 0 to 255, alpha 0 to 1. */
export type Rgba = { r: number; g: number; b: number; a: number };

/** WCAG 2.2, 1.4.3 (AA) and 1.4.6 (AAA): the ratio normal and large text need. */
export const AA = { normal: 4.5, large: 3 } as const;
export const AAA = { normal: 7, large: 4.5 } as const;
/** WCAG 2.2, 2.5.8: a target is at least 24 by 24 CSS pixels. */
export const MIN_TARGET = 24;

/** What a page with no background of its own is painted on. */
export const CANVAS: Rgba = { r: 255, g: 255, b: 255, a: 1 };

const HEX = /^#([0-9a-f]{3,8})$/;
const RGB = /^rgba?\(([^()]*)\)$/;
const SRGB = /^color\(\s*srgb\s+([^()]*)\)$/;

const clamp = (value: number, low: number, high: number): number =>
  Math.min(high, Math.max(low, value));

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

/** A colour as the browser resolves it (`rgb(…)`, `color(srgb …)`) or hex; else `null`. */
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

/** The AA ratio text needs. */
export const neededRatio = (large: boolean): number => (large ? AA.large : AA.normal);
/** The AAA ratio text needs. */
export const enhancedRatio = (large: boolean): number => (large ? AAA.large : AAA.normal);
