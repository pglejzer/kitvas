// The box model of the Spacing group, drawn as mock v10 draws it (plan 18f, task 2; spec S4.6
// item 5): margin around padding around the element's size, a button on each side with its
// computed value, the picked sides in the accent, and the link switch under it. The panel puts
// the picked side's row under the box. The rules are pure in `box.ts`.

import { text } from '../../texts.ts';
import { el } from '../controls/controls.ts';
import {
  BOX_LINKS,
  BOX_SIDES,
  type BoxLayer,
  type BoxLink,
  type BoxSide,
  type BoxState,
  linkedSides,
  SIDE_PROPERTY,
  sideText,
  sizeOf,
} from './box.ts';

/** The element itself, in the middle: its size, or nothing while it is not known. */
function core(computed: Readonly<Record<string, string>> | null): HTMLElement {
  const size = sizeOf(computed);
  const words = size === null ? '' : text('props.box.size', { width: size[0], height: size[1] });
  return el('div', 'props-core', words);
}

export function boxView(options: {
  state: BoxState;
  computed: Readonly<Record<string, string>> | null;
  onPick(layer: BoxLayer, side: BoxSide): void;
  onLink(link: BoxLink): void;
}): HTMLElement {
  const { state } = options;
  const root = el('div', 'props-boxmodel');
  root.dataset.row = 'box';
  const marked = new Set(linkedSides(state));
  const layerBox = (layer: BoxLayer, inner: HTMLElement): HTMLElement => {
    const box = el('div', 'props-layer');
    box.dataset.layer = layer;
    box.setAttribute('role', 'group');
    box.setAttribute('aria-label', text(`props.box.${layer}`));
    box.append(el('span', 'props-layer-name', text(`props.box.${layer}`)));
    for (const side of BOX_SIDES) {
      const at = SIDE_PROPERTY[layer][side];
      const button = el('button', 'props-side', sideText(options.computed, at));
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
    box.append(inner);
    return box;
  };
  root.append(layerBox('margin', layerBox('padding', core(options.computed))));

  const link = el('div', 'k-seg props-link');
  link.setAttribute('role', 'group');
  link.setAttribute('aria-label', text('props.box.link'));
  for (const one of BOX_LINKS) {
    const button = el('button', undefined, text(`props.box.link.${one}`));
    button.type = 'button';
    button.dataset.control = `link-${one}`;
    button.setAttribute('aria-pressed', String(state.link === one));
    button.addEventListener('click', () => options.onLink(one));
    link.append(button);
  }
  root.append(link);
  return root;
}
