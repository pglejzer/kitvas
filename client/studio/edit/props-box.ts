// The box model of the Spacing group (plan 15, task C; spec goal 8): margin outside, padding
// inside, four sides each. A side is picked in the box and edited in the row under it; the link
// says whether that edit writes the one side, the pair of its axis, or all four. Each choice
// writes exactly one declaration (`padding-top`, `padding-block` or `padding`), so its undo is
// one op too. The logic is pure; `boxView` is the thin DOM over it.

import type { StyleProperty } from '../../../src/edit/index.ts';
import { el } from './controls.ts';
import { text } from './texts.ts';

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

const SIDE_PROPERTY: Record<BoxLayer, Record<BoxSide, StyleProperty>> = {
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
 * The box: margin around padding around the element, a button per side that shows its computed
 * value and picks it, and the link switch. The panel puts the picked side's row under it.
 */
export function boxView(options: {
  state: BoxState;
  computed: Readonly<Record<string, string>> | null;
  onPick(layer: BoxLayer, side: BoxSide): void;
  onLink(link: BoxLink): void;
}): HTMLElement {
  const { state } = options;
  const root = el('div', 'props-box');
  root.dataset.row = 'box';
  const marked = new Set(linkedSides(state));
  const layerBox = (layer: BoxLayer, inner: HTMLElement | null): HTMLElement => {
    const box = el('div', `props-box-${layer}`);
    box.setAttribute('role', 'group');
    box.setAttribute('aria-label', text(`props.box.${layer}`));
    box.append(el('span', 'props-box-name', text(`props.box.${layer}`)));
    for (const side of BOX_SIDES) {
      const at = SIDE_PROPERTY[layer][side];
      const button = el('button', 'props-box-side', sideText(options.computed, at));
      button.type = 'button';
      button.dataset.side = side;
      button.dataset.control = at;
      const label = text('props.box.side', {
        layer: text(`props.box.${layer}`),
        side: text(`props.box.${side}`),
      });
      button.setAttribute('aria-label', label);
      button.title = label;
      const active = state.layer === layer && marked.has(side);
      button.setAttribute('aria-pressed', String(active));
      button.addEventListener('click', () => options.onPick(layer, side));
      box.append(button);
    }
    box.append(inner ?? el('div', 'props-box-core'));
    return box;
  };
  root.append(layerBox('margin', layerBox('padding', null)));

  const link = el('div', 'props-seg props-box-link');
  link.setAttribute('role', 'group');
  link.setAttribute('aria-label', text('props.box.link'));
  for (const one of BOX_LINKS) {
    const button = el('button', 'props-seg-item', text(`props.box.link.${one}`));
    button.type = 'button';
    button.dataset.control = `link-${one}`;
    button.setAttribute('aria-pressed', String(state.link === one));
    button.addEventListener('click', () => options.onLink(one));
    link.append(button);
  }
  root.append(link);
  return root;
}
