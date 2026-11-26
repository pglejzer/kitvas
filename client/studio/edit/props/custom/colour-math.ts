// The picker's colour arithmetic (plan 19, task T5; spec goal 14): HSV and RGB both ways, the
// text a colour is shown as, and the five forms a person may type. Pure: no DOM.

import { parseColour, type Rgba } from '../../../../../src/shared/values/colour.ts';
import { clamp } from '../../../../../src/shared/values/numbers.ts';

/** Hue 0 to 360, saturation, value and alpha 0 to 1. */
export type Hsva = { h: number; s: number; v: number; a: number };

const byte = (value: number): number => clamp(Math.round(value), 0, 255);

/**
 * RGB as HSV. A grey (or black) has no hue of its own: `hue` is the one to keep, so a person who
 * drags the square to the grey edge does not lose it. Without one it is 0.
 */
export function hsvOf(rgba: Rgba, hue = 0): Hsva {
  const r = rgba.r / 255;
  const g = rgba.g / 255;
  const b = rgba.b / 255;
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const delta = max - min;
  const s = max === 0 ? 0 : delta / max;
  if (delta === 0) return { h: hue, s, v: max, a: rgba.a };
  let h: number;
  if (max === r) h = ((g - b) / delta) % 6;
  else if (max === g) h = (b - r) / delta + 2;
  else h = (r - g) / delta + 4;
  h *= 60;
  if (h < 0) h += 360;
  return { h, s, v: max, a: rgba.a };
}

/** HSV as RGB, the channels rounded to whole numbers. */
export function rgbaOf(hsva: Hsva): Rgba {
  const h = (((hsva.h % 360) + 360) % 360) / 60;
  const s = clamp(hsva.s, 0, 1);
  const v = clamp(hsva.v, 0, 1);
  const c = v * s;
  const x = c * (1 - Math.abs((h % 2) - 1));
  const m = v - c;
  const sector = Math.floor(h);
  const [r, g, b] =
    sector === 0
      ? [c, x, 0]
      : sector === 1
        ? [x, c, 0]
        : sector === 2
          ? [0, c, x]
          : sector === 3
            ? [0, x, c]
            : sector === 4
              ? [x, 0, c]
              : [c, 0, x];
  return {
    r: byte(((r ?? 0) + m) * 255),
    g: byte(((g ?? 0) + m) * 255),
    b: byte(((b ?? 0) + m) * 255),
    a: clamp(hsva.a, 0, 1),
  };
}

const hex = (value: number): string => byte(value).toString(16).padStart(2, '0');

/** `#rrggbb`, or `rgb(r g b / a)` when the colour is not fully opaque. */
export function formatColour(rgba: Rgba): string {
  if (rgba.a >= 1) return `#${hex(rgba.r)}${hex(rgba.g)}${hex(rgba.b)}`;
  const alpha = Math.round(clamp(rgba.a, 0, 1) * 100) / 100;
  return `rgb(${byte(rgba.r)} ${byte(rgba.g)} ${byte(rgba.b)} / ${alpha})`;
}

const HSL =
  /^hsla?\(\s*(-?[\d.]+)(?:deg)?[\s,]+([\d.]+)%[\s,]+([\d.]+)%\s*(?:[,/]\s*([\d.]+%?)\s*)?\)$/;

function fromHsl(text: string): Rgba | null {
  const match = HSL.exec(text);
  if (!match) return null;
  const h = Number(match[1]);
  const s = Number(match[2]) / 100;
  const l = Number(match[3]) / 100;
  const raw = match[4];
  const a =
    raw === undefined ? 1 : raw.endsWith('%') ? Number(raw.slice(0, -1)) / 100 : Number(raw);
  if (![h, s, l, a].every(Number.isFinite) || s > 1 || l > 1) return null;
  const v = l + s * Math.min(l, 1 - l);
  const sv = v === 0 ? 0 : 2 * (1 - l / v);
  return rgbaOf({ h, s: sv, v, a: clamp(a, 0, 1) });
}

/**
 * What a person typed: `#rgb`, `#rrggbb`, `#rrggbbaa`, `rgb()` or `hsl()`, as a colour with whole
 * channels; `null` for anything else.
 */
export function readColour(input: string): Rgba | null {
  const text = input.trim().toLowerCase();
  if (text === '' || text.length > 80) return null;
  const parsed = text.startsWith('hsl') ? fromHsl(text) : parseColour(text);
  if (parsed === null) return null;
  return { r: byte(parsed.r), g: byte(parsed.g), b: byte(parsed.b), a: clamp(parsed.a, 0, 1) };
}
