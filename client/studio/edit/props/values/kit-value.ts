// Whether a style value keeps to the kit (plan 18f, task 2; spec S4.6 item 5): a token of the kit
// is named by its own name, anything else is "Off kit" with the nearest token of the property's
// scale, which "Use <token>" writes. The nearest size is the closest value; the nearest colour the
// smallest distance in OKLab, the space where equal steps look equal. Pure: no DOM.

import type { TokenOption } from '../../../../../src/edit/index.ts';
import { tokenNameOf } from './stepper.ts';
import { varOf } from './steps.ts';

export type OnKit =
  | { kind: 'none' }
  | { kind: 'token'; name: string; var: string }
  | { kind: 'offkit'; nearest: TokenOption | null };

type Triple = [number, number, number];

const NUMBER = /^-?(?:\d+\.?\d*|\.\d+)$/;

/** A length in px (`rem` and `em` count 16 px, a bare `0` is one); `null` for anything else. */
function pixels(css: string): number | null {
  const match = /^(-?(?:\d+\.?\d*|\.\d+))(px|rem|em)?$/.exec(css.trim().toLowerCase());
  if (!match?.[1]) return null;
  const amount = Number(match[1]);
  if (match[2] === undefined) return amount === 0 ? 0 : null;
  return match[2] === 'px' ? amount : amount * 16;
}

const channel = (part: string): number | null => {
  const percent = part.endsWith('%');
  const value = Number(percent ? part.slice(0, -1) : part);
  if (part === '' || !Number.isFinite(value)) return null;
  return Math.min(1, Math.max(0, percent ? value / 100 : value / 255));
};

/** `#rgb`, `#rgba`, `#rrggbb`, `#rrggbbaa`, `rgb(…)` and `rgba(…)` as sRGB 0 to 1; alpha left out. */
export function rgbOf(css: string): Triple | null {
  const text = css.trim().toLowerCase();
  const hex = /^#([0-9a-f]{3,4}|[0-9a-f]{6}|[0-9a-f]{8})$/.exec(text)?.[1];
  if (hex !== undefined) {
    const full = hex.length <= 4 ? [...hex].map((digit) => digit + digit).join('') : hex;
    const at = (from: number): number => Number.parseInt(full.slice(from, from + 2), 16) / 255;
    return [at(0), at(2), at(4)];
  }
  const call = /^rgba?\(([^)]*)\)$/.exec(text)?.[1];
  if (call === undefined) return null;
  const parts = call.split(/[\s,/]+/).filter((part) => part !== '');
  const [red, green, blue] = parts.slice(0, 3).map(channel);
  if (red === null || green === null || blue === null) return null;
  if (red === undefined || green === undefined || blue === undefined) return null;
  return [red, green, blue];
}

const linear = (c: number): number => (c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4);

/** sRGB to OKLab (Björn Ottosson's matrices). */
export function oklabOf([red, green, blue]: Triple): Triple {
  const r = linear(red);
  const g = linear(green);
  const b = linear(blue);
  const l = Math.cbrt(0.4122214708 * r + 0.5363325363 * g + 0.0514459929 * b);
  const m = Math.cbrt(0.2119034982 * r + 0.6806995451 * g + 0.1073969566 * b);
  const s = Math.cbrt(0.0883024619 * r + 0.2817188376 * g + 0.6299787005 * b);
  return [
    0.2104542553 * l + 0.793617785 * m - 0.0040720468 * s,
    1.9779984951 * l - 2.428592205 * m + 0.4505937099 * s,
    0.0259040371 * l + 0.7827717662 * m - 0.808675766 * s,
  ];
}

/** Where a value sits for its type: px, a plain number, or a colour in OKLab. */
function measure(css: string, type: TokenOption['type']): number[] | null {
  if (type === 'dimension') {
    const px = pixels(css);
    return px === null ? null : [px];
  }
  if (type === 'color') {
    const rgb = rgbOf(css);
    return rgb === null ? null : oklabOf(rgb);
  }
  if (type === 'fontWeight' || type === 'number') {
    const text = css.trim();
    return NUMBER.test(text) ? [Number(text)] : null;
  }
  return null;
}

/**
 * The token of the scale closest to `css`, by the scale's type; `null` for a value it cannot read
 * (a `var()`, `auto`, a percentage) or an empty scale. A tie takes the earlier token.
 */
export function nearestToken(css: string, scale: readonly TokenOption[]): TokenOption | null {
  const type = scale[0]?.type;
  if (type === undefined) return null;
  const target = measure(css, type);
  if (target === null) return null;
  let best: TokenOption | null = null;
  let distance = Number.POSITIVE_INFINITY;
  for (const token of scale) {
    const at = token.type === type ? measure(token.css, type) : null;
    if (at === null || at.length !== target.length) continue;
    const far = Math.hypot(...at.map((part, index) => part - (target[index] ?? 0)));
    if (far < distance) {
      best = token;
      distance = far;
    }
  }
  return best;
}

/**
 * What a row's value says of the kit: nothing held; a token of the kit, by its name; or off the
 * kit, with the nearest token of `scale` (the property's own tokens). `tokens` are all the kit's.
 */
export function onKit(
  held: string | null,
  scale: readonly TokenOption[],
  tokens: readonly TokenOption[] = scale,
): OnKit {
  if (held === null || held.trim() === '') return { kind: 'none' };
  const name = varOf(held);
  const token = name === null ? undefined : tokens.find((one) => one.var === name);
  if (token !== undefined) return { kind: 'token', name: tokenNameOf(token), var: token.var };
  return { kind: 'offkit', nearest: name === null ? nearestToken(held, scale) : null };
}
