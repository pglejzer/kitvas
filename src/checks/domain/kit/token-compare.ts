// Compares a kit token with what the browser read from the design system's own variable.
// Colours are compared as the browser painted them, so a theme written in oklch or hsl can be
// held against the kit's sRGB value.

/** Channels 0 to 255, alpha included. */
export type Rgba = { red: number; green: number; blue: number; alpha: number };

/** Painting and rounding move a channel by a step or two; more than this is another colour. */
export const CHANNEL_TOLERANCE = 2;
/** Dimensions are compared in px; `rem` counts as 16 px, the browser's default. */
const REM_PX = 16;
const DIMENSION_TOLERANCE = 0.01;

const HEX = /^#([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})?$/i;
const DIMENSION = /^([+-]?(?:\d+\.?\d*|\.\d+))(px|rem)?$/i;

const pair = (channel: number): string =>
  Math.min(255, Math.max(0, Math.round(channel)))
    .toString(16)
    .padStart(2, '0');

/** `#rrggbb`, or `#rrggbbaa` when not opaque. */
export function colorHex({ red, green, blue, alpha }: Rgba): string {
  const opaque = `#${pair(red)}${pair(green)}${pair(blue)}`;
  return Math.round(alpha) >= 255 ? opaque : `${opaque}${pair(alpha)}`;
}

/** Reads `#rrggbb` and `#rrggbbaa`; `undefined` for anything else. */
export function parseHex(text: string): Rgba | undefined {
  const match = HEX.exec(text.trim());
  if (!match) return undefined;
  const channel = (part: string | undefined): number => Number.parseInt(part ?? 'ff', 16);
  return {
    red: channel(match[1]),
    green: channel(match[2]),
    blue: channel(match[3]),
    alpha: channel(match[4]),
  };
}

/** A token's colour (components and alpha from 0 to 1) in channels. */
export function tokenRgba(components: readonly [number, number, number], alpha = 1): Rgba {
  const [red, green, blue] = components;
  return {
    red: Math.round(red * 255),
    green: Math.round(green * 255),
    blue: Math.round(blue * 255),
    alpha: Math.round(alpha * 255),
  };
}

export function sameColor(a: Rgba, b: Rgba): boolean {
  return (
    Math.abs(a.red - b.red) <= CHANNEL_TOLERANCE &&
    Math.abs(a.green - b.green) <= CHANNEL_TOLERANCE &&
    Math.abs(a.blue - b.blue) <= CHANNEL_TOLERANCE &&
    Math.abs(a.alpha - b.alpha) <= CHANNEL_TOLERANCE
  );
}

/** A length in px: `8px`, `0.5rem`, `0`. `undefined` for anything else (`calc()`, `%`, `em`). */
export function toPx(text: string): number | undefined {
  const match = DIMENSION.exec(text.trim());
  if (!match) return undefined;
  const amount = Number(match[1]);
  const unit = match[2]?.toLowerCase();
  // Only zero may go without a unit.
  if (unit === undefined) return amount === 0 ? 0 : undefined;
  return unit === 'rem' ? amount * REM_PX : amount;
}

export function sameDimension(a: string, b: string): boolean {
  const first = toPx(a);
  const second = toPx(b);
  return (
    first !== undefined && second !== undefined && Math.abs(first - second) <= DIMENSION_TOLERANCE
  );
}

const tidy = (text: string): string => text.trim().replace(/\s+/g, ' ');

export const sameText = (a: string, b: string): boolean => tidy(a) === tidy(b);

export type TokenExpected = {
  /** The token's type: `color`, `dimension`, … */
  type: string;
  /** The token's value as CSS text: `#1a1a1a`, `8px`. */
  css: string;
  /** For a colour: its channels. */
  rgba?: Rgba | undefined;
};

export type TokenSeen = {
  /** The variable's computed value, trimmed; `''` when it has none. */
  value: string;
  /** The value as the browser painted it; `null` when it is not a colour. */
  color: string | null;
};

export type TokenVerdict =
  | { result: 'same' }
  | { result: 'unread' }
  /** `actual` is what the kit should say instead: the browser's hex for a colour. */
  | { result: 'different'; expected: string; actual: string };

export function compareToken(expected: TokenExpected, seen: TokenSeen): TokenVerdict {
  if (seen.value.trim() === '') return { result: 'unread' };
  const different: TokenVerdict = {
    result: 'different',
    expected: expected.css,
    actual: tidy(seen.value),
  };
  if (expected.type === 'color' && expected.rgba) {
    const painted = seen.color === null ? undefined : parseHex(seen.color);
    if (!painted) return different;
    if (sameColor(expected.rgba, painted)) return { result: 'same' };
    return { ...different, expected: colorHex(expected.rgba), actual: colorHex(painted) };
  }
  if (expected.type === 'dimension') {
    return sameDimension(expected.css, seen.value) ? { result: 'same' } : different;
  }
  return sameText(expected.css, seen.value) ? { result: 'same' } : different;
}
