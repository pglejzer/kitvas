// The kit token closest to a raw value the person typed (plan 13, task J). Pure: the off-kit list
// and "map to nearest" use it, so a raw `13px` can be offered `space.sm` (12px).

import type { TokenOption } from '../types.ts';

type Rgb = [number, number, number];

const NUMBER = '[+-]?(?:\\d+\\.?\\d*|\\.\\d+)';
const LENGTH = new RegExp(`^(${NUMBER})(px|rem)?$`);

/** A length in px (rem counts 16 px); a bare `0` is a length, any other bare number is not. */
function pixels(css: string): number | null {
  const match = LENGTH.exec(css.trim().toLowerCase());
  if (!match) return null;
  const amount = Number(match[1]);
  if (!Number.isFinite(amount)) return null;
  const unit = match[2];
  if (unit === undefined) return amount === 0 ? 0 : null;
  return unit === 'rem' ? amount * 16 : amount;
}

const channel = (text: string): number | null => {
  const trimmed = text.trim();
  const percent = trimmed.endsWith('%');
  const value = Number(percent ? trimmed.slice(0, -1) : trimmed);
  if (trimmed === '' || !Number.isFinite(value)) return null;
  return Math.min(255, Math.max(0, percent ? (value / 100) * 255 : value));
};

/** `#rgb`, `#rrggbb`, `rgb(r g b)`, `rgb(r, g, b)`, with or without an alpha part (alpha is ignored). */
function colour(css: string): Rgb | null {
  const text = css.trim().toLowerCase();
  const hex = /^#([0-9a-f]{3}|[0-9a-f]{6})$/.exec(text)?.[1];
  if (hex !== undefined) {
    const full = hex.length === 3 ? [...hex].map((digit) => digit + digit).join('') : hex;
    const at = (from: number): number => Number.parseInt(full.slice(from, from + 2), 16);
    return [at(0), at(2), at(4)];
  }
  const call = /^rgba?\(([^)]*)\)$/.exec(text);
  if (!call) return null;
  const parts = (call[1] ?? '').split(/[\s,/]+/).filter(Boolean);
  if (parts.length < 3) return null;
  const read = parts.slice(0, 3).map(channel);
  const [red, green, blue] = read;
  if (red === null || green === null || blue === null) return null;
  if (red === undefined || green === undefined || blue === undefined) return null;
  return [red, green, blue];
}

const plain = (css: string): number | null => {
  const text = css.trim();
  if (!new RegExp(`^${NUMBER}$`).test(text)) return null;
  return Number(text);
};

/** A value's position for its type: one number for scales, three for a colour; `null` unreadable. */
function measure(css: string, type: TokenOption['type']): number[] | null {
  switch (type) {
    case 'dimension': {
      const value = pixels(css);
      return value === null ? null : [value];
    }
    case 'color':
      return colour(css);
    case 'fontWeight':
    case 'number': {
      const value = plain(css);
      return value === null ? null : [value];
    }
    default:
      return null;
  }
}

/**
 * The token of `type` whose value is closest to `css`. Dimensions compare in px, colours by their
 * distance in sRGB, weights and numbers by value. Another type or a value it cannot read is `null`,
 * as is a kit without a token of that type. A tie takes the first token.
 */
export function nearestToken(
  css: string,
  type: TokenOption['type'],
  tokens: TokenOption[],
): TokenOption | null {
  const target = measure(css, type);
  if (target === null) return null;
  let best: TokenOption | null = null;
  let bestDistance = Number.POSITIVE_INFINITY;
  for (const token of tokens) {
    if (token.type !== type) continue;
    const at = measure(token.css, type);
    if (at === null || at.length !== target.length) continue;
    const distance = Math.hypot(...at.map((part, index) => part - (target[index] ?? 0)));
    if (distance < bestDistance) {
      best = token;
      bestDistance = distance;
    }
  }
  return best;
}
