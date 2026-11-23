// Token scales for the properties panel (plan 13, task G): which tokens a property takes, how a
// stepper moves along them, what counts as a raw value the person typed. Pure: no DOM.
//
// The client may not import values from `src/`, so the property list and the token type table are
// copies of `STYLE_PROPERTIES` and `PROPERTY_TOKEN_TYPE` in `src/edit/domain/types.ts`;
// `test/client/studio/steps.test.ts` compares them.

import type { StyleProperty, StyleValue, TokenOption } from '../../../src/edit/index.ts';

export type TokenType = 'dimension' | 'color' | 'fontWeight' | 'number';

export const PROPERTIES: readonly StyleProperty[] = [
  'padding',
  'padding-block',
  'padding-inline',
  'margin',
  'margin-block',
  'margin-inline',
  'gap',
  'color',
  'background-color',
  'border-color',
  'font-size',
  'font-weight',
  'line-height',
  'border-radius',
  'border-width',
  'width',
  'height',
];

export const TOKEN_TYPE: Record<StyleProperty, TokenType> = {
  padding: 'dimension',
  'padding-block': 'dimension',
  'padding-inline': 'dimension',
  margin: 'dimension',
  'margin-block': 'dimension',
  'margin-inline': 'dimension',
  gap: 'dimension',
  color: 'color',
  'background-color': 'color',
  'border-color': 'color',
  'font-size': 'dimension',
  'font-weight': 'fontWeight',
  'line-height': 'number',
  'border-radius': 'dimension',
  'border-width': 'dimension',
  width: 'dimension',
  height: 'dimension',
};

const NUMBER = /^-?(?:\d+\.?\d*|\.\d+)$/;
const LENGTH = /^-?(?:\d+\.?\d*|\.\d+)(?:px|rem|em|%|vh|vw|ch|pt)$/i;
const HEX = /^#(?:[0-9a-f]{3,4}|[0-9a-f]{6}|[0-9a-f]{8})$/i;
const COLOR_FUNCTION = /^(?:rgb|rgba|hsl|hsla)\(\s*\d[0-9.,%\s/-]{2,60}\)$/i;
const KEYWORDS = new Set(['auto', 'transparent', 'currentcolor']);
const VAR = /^var\(\s*(--[A-Za-z0-9_-]+)\s*\)$/;

/** A length in px; `rem` and `em` count 16 px. `null` when it is not a plain length. */
function pixels(css: string): number | null {
  const match = /^(-?(?:\d+\.?\d*|\.\d+))(px|rem|em)?$/.exec(css.trim());
  if (!match?.[1]) return null;
  const size = Number(match[1]);
  return match[2] === 'rem' || match[2] === 'em' ? size * 16 : size;
}

function plainNumber(css: string): number | null {
  const text = css.trim();
  return NUMBER.test(text) ? Number(text) : null;
}

/** The number a value is ordered by, by the type of the token scale; `null` for colours. */
function orderOf(css: string, type: TokenOption['type']): number | null {
  if (type === 'dimension') return pixels(css);
  if (type === 'fontWeight' || type === 'number') return plainNumber(css);
  return null;
}

/**
 * Token groups a property reads from first, by the group's last word in kebab case: spacing reads
 * `space`, a radius `radius`. A kit whose groups have other names gets every token of the type.
 */
const GROUPS: Partial<Record<StyleProperty, readonly string[]>> = {
  padding: ['space', 'spacing'],
  'padding-block': ['space', 'spacing'],
  'padding-inline': ['space', 'spacing'],
  margin: ['space', 'spacing'],
  'margin-block': ['space', 'spacing'],
  'margin-inline': ['space', 'spacing'],
  gap: ['space', 'spacing', 'gap'],
  'font-size': ['font-size', 'text'],
  'border-radius': ['radius', 'rounded', 'border-radius'],
  'border-width': ['border-width', 'border', 'stroke'],
  width: ['size', 'sizes', 'width'],
  height: ['size', 'sizes', 'height'],
  'line-height': ['line-height', 'leading'],
};

/** `fontSize.md` is in the group `font-size`; `color.ink.mid` in `ink`. */
const groupOf = (token: TokenOption): string =>
  (token.path.split('.').slice(0, -1).at(-1) ?? '')
    .replace(/([a-z0-9])([A-Z])/g, '$1-$2')
    .toLowerCase();

/** The kit's tokens of the type the property takes; dimensions, weights and numbers by value. */
export function tokensFor(tokens: readonly TokenOption[], property: StyleProperty): TokenOption[] {
  const type = TOKEN_TYPE[property];
  const typed = tokens.filter((token) => token.type === type);
  const groups = GROUPS[property] ?? [];
  const grouped = typed.filter((token) => groups.includes(groupOf(token)));
  // A spacing row offers the spacing scale, not every dimension of the kit (radius, font sizes).
  const own = grouped.length > 0 ? grouped : typed;
  if (type === 'color') return own;
  const key = (token: TokenOption): number => orderOf(token.css, token.type) ?? Number.MAX_VALUE;
  return own.sort((a, b) => key(a) - key(b));
}

/** The token variable a CSS text names: `var(--kit-space-md)` or `--kit-space-md`. */
export function varOf(text: string): string | null {
  const trimmed = text.trim();
  const match = VAR.exec(trimmed);
  if (match?.[1]) return match[1];
  return /^--[A-Za-z0-9_-]+$/.test(trimmed) ? trimmed : null;
}

function sameValue(token: TokenOption, text: string): boolean {
  const own = orderOf(token.css, token.type);
  const other = orderOf(text, token.type);
  if (own !== null && other !== null) return own === other;
  return token.css.toLowerCase() === text.trim().toLowerCase();
}

/** Where `current` sits on the scale: a `var(...)`, or a value equal to one token's value. */
export function indexOnScale(tokens: readonly TokenOption[], current: string | null): number {
  if (!current) return -1;
  const name = varOf(current);
  if (name) return tokens.findIndex((token) => token.var === name);
  return tokens.findIndex((token) => sameValue(token, current));
}

/**
 * The next token of the scale in `direction`; `big` moves three. At the end of the scale it
 * stays on the last token. A value that is not on the scale (a raw or computed one) moves to the
 * first token past it in that direction, or `null` when the scale has none there.
 */
export function stepToken(
  tokens: readonly TokenOption[],
  current: string | null,
  direction: 1 | -1,
  big: boolean,
): TokenOption | null {
  const last = tokens.length - 1;
  if (last < 0) return null;
  const step = big ? 3 : 1;
  const clamp = (index: number): number => Math.min(last, Math.max(0, index));
  const at = indexOnScale(tokens, current);
  if (at >= 0) return tokens[clamp(at + direction * step)] ?? null;
  const type = tokens[0]?.type ?? 'color';
  const value = current === null ? null : orderOf(current, type);
  if (value === null) {
    return tokens[direction === 1 ? clamp(step - 1) : clamp(last - step + 1)] ?? null;
  }
  const order = tokens.map((token) => orderOf(token.css, type) ?? Number.MAX_VALUE);
  if (direction === 1) {
    const first = order.findIndex((size) => size > value);
    return first < 0 ? null : (tokens[clamp(first + step - 1)] ?? null);
  }
  let before = -1;
  order.forEach((size, index) => {
    if (size < value) before = index;
  });
  return before < 0 ? null : (tokens[clamp(before - step + 1)] ?? null);
}

/** A CSS length, colour or number the person typed, trimmed; `null` when it is none of them. */
export function parseRaw(input: string): string | null {
  const text = input.trim();
  if (text === '' || text.length > 200) return null;
  const ok =
    NUMBER.test(text) ||
    LENGTH.test(text) ||
    HEX.test(text) ||
    COLOR_FUNCTION.test(text) ||
    KEYWORDS.has(text.toLowerCase());
  return ok ? text : null;
}

/** Whether a style value is outside the kit: anything but `var(--…)` of a token the kit has. */
export function isOffKit(value: string, tokens: readonly TokenOption[]): boolean {
  const text = value.trim();
  if (text === '') return false;
  const name = varOf(text);
  return name === null || !tokens.some((token) => token.var === name);
}

/**
 * A value as the SCSS declaration has it: a kit token reference, else a raw value; one written
 * without the off-kit marker is `mark: false`, so the server finds it as it is.
 */
export function styleValueOf(text: string, offKit = true): StyleValue {
  const name = VAR.exec(text.trim())?.[1];
  if (name?.startsWith('--kit-')) return { token: name };
  return offKit ? { raw: text.trim() } : { raw: text.trim(), mark: false };
}
