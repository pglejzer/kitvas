// The Claude tab's foot (plan 18, task D; spec goal 6): Discard and Apply, always in view, for the
// variant the person chose (a click on its card, or Enter or Space on it; its card is ringed).
// Apply is the card's Apply of before: one gesture and one undo step. Discard lets the choice go.
// Previews stay as they are: pointing at a card or focusing it shows it on the canvas.

import { sayFor, saying } from '../history/said.ts';
import { el } from '../props/controls.ts';
import { text } from '../texts.ts';
import type { CardModel } from './tab.ts';

/** The chosen variant as the foot shows it. */
export type Chosen = {
  key: string;
  /** Its place in its request's answer, from 1. */
  number: number;
  label: string;
  /** It can be applied now: built, and nothing blocks it. */
  ready: boolean;
};

/** The chosen card, if it is still drawn and can still be applied; else `null`. */
export function chosenOf(
  chosen: string | null,
  cards: ReadonlyMap<string, { model: CardModel; index: number }>,
): Chosen | null {
  if (chosen === null) return null;
  const drawn = cards.get(chosen);
  if (drawn === undefined || drawn.model.applied || drawn.model.outdated) return null;
  const { model } = drawn;
  const ready = model.built.kind === 'ready' && model.blocked === null;
  return { key: chosen, number: drawn.index + 1, label: model.label, ready };
}

export type FootState = {
  chosen: Chosen | null;
  /** An edit is on its way, or a variant is being applied. */
  busy: boolean;
  /** Some request has variants: without one, the foot is not shown. */
  some: boolean;
};

export type Foot = {
  element: HTMLElement;
  render(state: FootState): void;
  /** The chosen variant was applied: Apply says so for a moment. */
  applied(): void;
};

export function createFoot(handlers: { apply(key: string): void; discard(): void }): Foot {
  const element = el('div', 'k-actions claude-foot');
  const note = el('span', 'k-meta claude-foot-note');
  const discard = el('button', 'k-btn', text('ai.foot.discard'));
  discard.type = 'button';
  const apply = el('button', 'k-btn k-btn-primary', text('ai.variant.apply'));
  apply.type = 'button';
  element.append(note, discard, apply);
  let last: FootState = { chosen: null, busy: false, some: false };

  function draw(): void {
    const { chosen, busy, some } = last;
    element.hidden = !some;
    note.textContent = text(chosen === null ? 'ai.foot.none' : 'ai.foot.note');
    discard.disabled = chosen === null;
    apply.disabled = chosen === null || !chosen.ready || busy;
    apply.title = chosen?.label ?? '';
    // "Applied" stays its moment; the words come back after it.
    if (saying(apply)) return;
    apply.textContent =
      chosen === null ? text('ai.variant.apply') : text('ai.foot.apply', { n: chosen.number });
  }

  discard.addEventListener('click', () => handlers.discard());
  apply.addEventListener('click', () => {
    const { chosen } = last;
    if (chosen?.ready && !last.busy) handlers.apply(chosen.key);
  });

  return {
    element,
    render(state) {
      last = state;
      draw();
    },
    applied() {
      sayFor(apply, text('ai.variant.applied'), draw);
    },
  };
}
