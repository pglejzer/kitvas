// Colours as the facts carry them (`#rrggbbaa`): contrast, neutral greys and hue buckets.

export type Rgba = { r: number; g: number; b: number; a: number };

const HEX = /^#([0-9a-f]{3}|[0-9a-f]{6}|[0-9a-f]{8})$/i;

/** `#rgb`, `#rrggbb` or `#rrggbbaa`; channels 0–255, alpha 0–1. Null for anything else. */
export function parseColour(hex: string): Rgba | null {
  const match = HEX.exec(hex.trim());
  if (!match) return null;
  let digits = match[1] ?? '';
  if (digits.length === 3) {
    digits = [...digits].map((digit) => digit + digit).join('');
  }
  const channel = (at: number): number => Number.parseInt(digits.slice(at, at + 2), 16);
  return {
    r: channel(0),
    g: channel(2),
    b: channel(4),
    a: digits.length === 8 ? channel(6) / 255 : 1,
  };
}

/** `top` painted over an opaque `bottom`. */
export function over(top: Rgba, bottom: Rgba): Rgba {
  const mix = (front: number, back: number): number => front * top.a + back * (1 - top.a);
  return { r: mix(top.r, bottom.r), g: mix(top.g, bottom.g), b: mix(top.b, bottom.b), a: 1 };
}

/** WCAG relative luminance of an opaque colour. */
export function luminance({ r, g, b }: Rgba): number {
  const linear = (value: number): number => {
    const channel = value / 255;
    return channel <= 0.04045 ? channel / 12.92 : ((channel + 0.055) / 1.055) ** 2.4;
  };
  return 0.2126 * linear(r) + 0.7152 * linear(g) + 0.0722 * linear(b);
}

const WHITE: Rgba = { r: 255, g: 255, b: 255, a: 1 };

/**
 * WCAG contrast ratio, 1 to 21. A translucent background is laid on white first, then a
 * translucent foreground on that background. 1 when either colour cannot be read.
 */
export function contrast(foreground: string, background: string): number {
  const front = parseColour(foreground);
  const back = parseColour(background);
  if (!front || !back) return 1;
  const ground = back.a < 1 ? over(back, WHITE) : back;
  const ink = front.a < 1 ? over(front, ground) : front;
  const [light, dark] = [luminance(ink), luminance(ground)].sort((x, y) => y - x);
  return ((light ?? 0) + 0.05) / ((dark ?? 0) + 0.05);
}

/** Hue (0–360), saturation and lightness (0–1) of an opaque colour. */
function hsl({ r, g, b }: Rgba): { h: number; s: number; l: number } {
  const [red, green, blue] = [r / 255, g / 255, b / 255];
  const max = Math.max(red, green, blue);
  const min = Math.min(red, green, blue);
  const l = (max + min) / 2;
  const d = max - min;
  if (d === 0) return { h: 0, s: 0, l };
  const s = d / (1 - Math.abs(2 * l - 1));
  let h: number;
  if (max === red) h = ((green - blue) / d) % 6;
  else if (max === green) h = (blue - red) / d + 2;
  else h = (red - green) / d + 4;
  h *= 60;
  return { h: h < 0 ? h + 360 : h, s, l };
}

/** White, black, greys and near-greys: saturation 0.2 or less, or lightness at least 0.95 or at most 0.1. */
export function isNeutral(hex: string): boolean {
  const colour = parseColour(hex);
  if (!colour) return true;
  const { s, l } = hsl(colour);
  return s <= 0.2 || l >= 0.95 || l <= 0.1;
}

/** The colour's hue in 15° steps, 0–23; null for a neutral or unreadable colour. */
export function hueBucket(hex: string): number | null {
  const colour = parseColour(hex);
  if (!colour || isNeutral(hex)) return null;
  return Math.floor(hsl(colour).h / 15) % 24;
}
