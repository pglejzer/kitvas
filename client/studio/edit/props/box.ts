// The box model of the Spacing group (plan 15, task C; spec goal 8): margin outside, padding
// inside, four sides each. A side is picked in the box and edited in the row under it; the link
// says whether that edit writes the one side, the pair of its axis, or all four. Each choice
// writes exactly one declaration (`padding-top`, `padding-block` or `padding`), so its undo is
// one op too. The box opens on the link the element's class rule says (ADR 0070). The logic is
// pure; `boxView` in `box-model.ts` is the thin DOM over it.

import type { StyleProperty } from '../../../../src/edit/index.ts';
import type { Inspect } from '../../../../src/studio/api/edit/edit-schemas.ts';
import { ruleHeld } from '../style/ops.ts';

export const BOX_LAYERS = ['margin', 'padding'] as const;
export type BoxLayer = (typeof BOX_LAYERS)[number];
export const BOX_SIDES = ['top', 'right', 'bottom', 'left'] as const;
export type BoxSide = (typeof BOX_SIDES)[number];
/** `one`: the side alone; `pair`: both sides of its axis; `all`: the four sides. */
export const BOX_LINKS = ['one', 'pair', 'all'] as const;
export type BoxLink = (typeof BOX_LINKS)[number];

/** The side the box edits now, and how it is linked. */
export type BoxState = { layer: BoxLayer; side: BoxSide; link: BoxLink };

export const BOX_START: BoxState = { layer: 'padding', side: 'top', link: 'one' };

export const SIDE_PROPERTY: Record<BoxLayer, Record<BoxSide, StyleProperty>> = {
  margin: {
    top: 'margin-top',
    right: 'margin-right',
    bottom: 'margin-bottom',
    left: 'margin-left',
  },
  padding: {
    top: 'padding-top',
    right: 'padding-right',
    bottom: 'padding-bottom',
    left: 'padding-left',
  },
};

const AXIS_PROPERTY: Record<BoxLayer, { block: StyleProperty; inline: StyleProperty }> = {
  margin: { block: 'margin-block', inline: 'margin-inline' },
  padding: { block: 'padding-block', inline: 'padding-inline' },
};

const isBlock = (side: BoxSide): boolean => side === 'top' || side === 'bottom';

/** The one property an edit of the side writes under the link. */
export function boxProperty(state: BoxState): StyleProperty {
  if (state.link === 'all') return state.layer;
  if (state.link === 'pair') {
    const axes = AXIS_PROPERTY[state.layer];
    return isBlock(state.side) ? axes.block : axes.inline;
  }
  return SIDE_PROPERTY[state.layer][state.side];
}

/** The sides an edit changes, for the box to mark: the side, its pair, or all four. */
export function linkedSides(state: BoxState): BoxSide[] {
  if (state.link === 'all') return [...BOX_SIDES];
  if (state.link === 'pair') return isBlock(state.side) ? ['top', 'bottom'] : ['left', 'right'];
  return [state.side];
}

/**
 * The link the values of a layer's sides say (ADR 0070), as the class rule holds them (`null`: the
 * rule does not set the side): four equal sides are `all`, equal sides on each axis are `pair`,
 * anything else is `one`. `whole`: the rule declares the layer itself; with no side read from it
 * (a value that does not split) that is still `all`. `null` when the rule says nothing of the
 * layer.
 */
export function linkOfSides(
  sides: Readonly<Record<BoxSide, string | null>>,
  whole: boolean,
): BoxLink | null {
  const { top, right, bottom, left } = sides;
  const set = [top, right, bottom, left].filter((value) => value !== null);
  if (set.length === 0) return whole ? 'all' : null;
  if (set.length === BOX_SIDES.length && set.every((value) => value === top)) return 'all';
  return top === bottom && left === right ? 'pair' : 'one';
}

/**
 * The link the box opens on for an element: what its class rule says of the layer. `padding: 8px`
 * opens on all sides, `padding: 8px 16px` on the pairs, three or four values on one side.
 */
export function ruleLink(inspected: Inspect, layer: BoxLayer): BoxLink | null {
  const value = (property: StyleProperty): string | null =>
    ruleHeld(inspected, property)?.value ?? null;
  const sides = SIDE_PROPERTY[layer];
  return linkOfSides(
    {
      top: value(sides.top),
      right: value(sides.right),
      bottom: value(sides.bottom),
      left: value(sides.left),
    },
    value(layer) !== null,
  );
}

/** The box after the person picks a side: the same link, the new side. */
export const pickSide = (state: BoxState, layer: BoxLayer, side: BoxSide): BoxState => ({
  ...state,
  layer,
  side,
});

/** A side's computed value, short: `12px` shows as `12`, a value it cannot read as itself. */
export function sideText(
  computed: Readonly<Record<string, string>> | null,
  at: StyleProperty,
): string {
  const value = (computed?.[at] ?? '').trim();
  if (value === '') return '-';
  const px = /^(-?\d+(?:\.\d+)?)px$/.exec(value)?.[1];
  return px ?? value;
}

/**
 * The element's size inside the box (plan 18f, spec S4.6 item 5), from the frame's computed width
 * and height, rounded to whole px: `[148, 40]`. `null` when either is not a px length.
 */
export function sizeOf(computed: Readonly<Record<string, string>> | null): [number, number] | null {
  const px = (at: string): number | null => {
    const value = /^(\d+(?:\.\d+)?)px$/.exec((computed?.[at] ?? '').trim())?.[1];
    return value === undefined ? null : Math.round(Number(value));
  };
  const width = px('width');
  const height = px('height');
  return width === null || height === null ? null : [width, height];
}
