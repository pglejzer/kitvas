// The controls that keep a style to the kit (plan 18f, task 2; spec S4.6 item 5): which control a
// style row with a token type gets, and the stops of a stepper over the kit's tokens of the
// property's type. A colour gets the kit's swatches; a radius, a border's width and the sizes a
// stepper; a kit with no tokens of the type, a scale too long to label and every other property
// keep today's typed field. Pure: no DOM (`token-stepper.ts` and `swatches.ts` draw).

import type { StyleProperty, TokenOption } from '../../../../../src/edit/index.ts';
import { KIND } from './kinds.ts';
import { hasOwnScale, indexOnScale, tokensFor, varOf } from './steps.ts';

/** A scale longer than this has no room for its labels under the track: the field stays. */
export const MAX_STOPS = 6;

/** A radius at least this big is a pill: its stop says only its name (`full`). */
const PILL_PX = 999;

/** The properties a stepper suits: a radius, the width of a border or an outline, the sizes. */
const STEPPED: ReadonlySet<StyleProperty> = new Set<StyleProperty>([
  'border-radius',
  'border-width',
  'outline-width',
  'width',
  'height',
  'min-width',
  'min-height',
]);

export type StyleLook = 'stepper' | 'swatches' | 'field';

/**
 * The control of a token property's row, by the kit's tokens of its type. A stepper needs a scale
 * of the property's own group: a kit without radius tokens never steps a radius over its spacing.
 */
export function styleLook(property: StyleProperty, tokens: readonly TokenOption[]): StyleLook {
  const scale = tokensFor(tokens, property);
  if (KIND[property] === 'color') return scale.length > 0 ? 'swatches' : 'field';
  if (!STEPPED.has(property) || !hasOwnScale(tokens, property)) return 'field';
  return scale.length >= 2 && scale.length <= MAX_STOPS ? 'stepper' : 'field';
}

/** A token's own name: the last part of its path (`radius.sm` is `sm`). */
export function tokenNameOf(token: Pick<TokenOption, 'path'>): string {
  const cut = token.path.lastIndexOf('.');
  return cut < 0 ? token.path : token.path.slice(cut + 1);
}

/** A stop's label: the name and the value in px (`sm · 6`), a pill by its name alone. */
export function stopLabel(token: Pick<TokenOption, 'path' | 'css'>): string {
  const name = tokenNameOf(token);
  const css = token.css.trim();
  const px = /^(-?\d+(?:\.\d+)?)px$/.exec(css)?.[1];
  if (px !== undefined) return Number(px) >= PILL_PX ? name : `${name} · ${px}`;
  return css === '' ? name : `${name} · ${css}`;
}

export type Stop = { var: string; name: string; label: string; css: string; added: boolean };

/**
 * The stepper of a row: a stop for each of the kit's tokens of the property's type, in order;
 * `at`, the stop the source names (`var(--…)` of it), `-1` for none; `hint`, the stop the frame's
 * computed value equals while the source sets nothing, `-1` for none.
 */
export type Stepper = { stops: Stop[]; at: number; hint: number };

export function stepperOf(
  tokens: readonly TokenOption[],
  property: StyleProperty,
  held: string | null,
  computed: string | null,
): Stepper {
  const scale = tokensFor(tokens, property);
  const stops = scale.map((token) => ({
    var: token.var,
    name: tokenNameOf(token),
    label: stopLabel(token),
    css: token.css,
    added: token.added === true,
  }));
  // Only a token is on a stop: a raw value equal to one is still off the kit.
  const named = held === null ? null : varOf(held);
  const at = named === null ? -1 : stops.findIndex((stop) => stop.var === named);
  const hint = held === null && computed ? indexOnScale(scale, computed) : -1;
  return { stops, at, hint };
}
