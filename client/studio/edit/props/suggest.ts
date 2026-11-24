// "This looks like <Component> from the kit" in the properties header (spec 4d, goal 6): for a
// plain element a kit component covers, the inspect answer holds the component, the element's
// source written with it and the props it would drop. Replace sends that source as one
// `replaceElement` gesture (the server adds the kit import). With no safe source the same place
// offers Ask Claude with the replacement in words. The offer is pure over the answer; the DOM is thin.

import type { EditOp } from '../../../../src/edit/index.ts';
import type { Inspect } from '../../../../src/studio/api/edit/edit-schemas.ts';
import { text } from '../texts.ts';
import { el } from './controls.ts';
import type { Env } from './rows.ts';

/** What the two buttons do; the panel builds it from its `Env` (`suggestActions`). */
export type SuggestActions = {
  /** Sends the gesture: one undo step, labelled for the change list. */
  replace(op: EditOp, label: string): void;
  /** Shows the refused edit so Ask Claude can take it. */
  ask(op: EditOp, label: string): void;
};

export type Offer = {
  component: string;
  dropped: string[];
  /** The replacement as an edit; `null` when there is no safe source. */
  replace: EditOp | null;
  /** The same wish in the words of a plain tag swap, for Ask Claude. */
  ask: EditOp;
  /** The change list's line: the component, and the props it dropped. */
  label: string;
};

/** The offer for an inspected element; `null` when nothing is suggested. */
export function offerOf(inspected: Pick<Inspect, 'id' | 'hash' | 'suggest'>): Offer | null {
  const { suggest } = inspected;
  if (suggest === null || suggest === undefined) return null;
  const { component, dropped } = suggest;
  const label =
    dropped.length === 0
      ? text('suggest.label', { component })
      : text('suggest.labelDropped', { component, names: dropped.join(', ') });
  return {
    component,
    dropped,
    replace:
      suggest.source === ''
        ? null
        : { op: 'replaceElement', id: inspected.id, source: suggest.source, hash: inspected.hash },
    ask: { op: 'replaceTag', id: inspected.id, tag: component, hash: inspected.hash },
    label,
  };
}

function button(label: string, control: string, onClick: () => void): HTMLButtonElement {
  const node = el('button', 'k-btn k-btn-line', label);
  node.type = 'button';
  node.dataset.control = control;
  node.addEventListener('click', onClick);
  return node;
}

/**
 * The offer under the header, as the one item of its place (`.k-item`); `null` when there is none
 * or no way to act on it.
 */
export function suggestView(
  inspected: Inspect,
  actions: SuggestActions | undefined,
): HTMLElement | null {
  const offer = offerOf(inspected);
  if (offer === null || actions === undefined) return null;
  const box = el('div', 'k-item props-offer');
  box.dataset.row = 'suggest';
  box.append(el('p', undefined, text('suggest.looks', { component: offer.component })));
  const { replace, ask } = offer;
  if (replace === null) {
    box.append(
      el('p', 'props-hint', text('suggest.noSafe')),
      button(text('suggest.ask'), 'suggest-ask', () => actions.ask(ask, offer.label)),
    );
    return box;
  }
  if (offer.dropped.length > 0) {
    box.append(el('p', 'props-hint', text('suggest.drops', { names: offer.dropped.join(', ') })));
  }
  box.append(
    button(text('suggest.replace'), 'suggest-replace', () => actions.replace(replace, offer.label)),
  );
  return box;
}

/** The actions of the panel's `Env`: a gesture through `commit`, a refused one through `refuse`. */
export function suggestActions(env: Env): SuggestActions {
  return {
    replace: (op, label) => env.commit('suggest', () => [op], label),
    ask: (op, label) => env.refuse({ ops: [op], label }, 'invalid'),
  };
}
