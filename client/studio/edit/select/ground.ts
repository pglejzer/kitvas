// A click on the ground of the canvas, beside the cards, clears the selection. A frame hears a
// click only on its own page (a `pick` with no element, `mode.ts`); the ground around the cards
// is the studio's, so it is heard here and goes through the same rule (`pickSelection`).

import { addsToSelection, type ClickKeys } from '../../../channel/edit-protocol.ts';
import type { EditorContext } from '../context.ts';
import { type Chosen, pickSelection, sameChosen } from './copies.ts';

/** The parts of the canvas that are its ground: the scroll box, its sizer, the world's gaps. */
const GROUND: readonly string[] = ['scroll', 'sizer', 'world'];

/** An element's own `data-canvas`; a card, a handle or a pill on the ground has another or none. */
function canvasPart(target: unknown): string | undefined {
  if (typeof target !== 'object' || target === null || !('dataset' in target)) return undefined;
  const { dataset } = target;
  if (typeof dataset !== 'object' || dataset === null || !('canvas' in dataset)) return undefined;
  return typeof dataset.canvas === 'string' ? dataset.canvas : undefined;
}

const isGround = (target: unknown): boolean => GROUND.includes(canvasPart(target) ?? '');

/** Where a click of the page began (the press) and where the browser says it was. */
export type GroundClick = { press: unknown; target: unknown };

/**
 * The selection after a click of the page; `null` when it was not on the ground. A click's target
 * is the common parent of its press and its release, so the end of a drag that began on a card's
 * handle may name the ground: the press has to be on the ground too. The add key keeps the
 * selection, as it does for a click on empty page in a frame.
 */
export function groundSelection(current: Chosen, at: GroundClick, keys: ClickKeys): Chosen | null {
  if (!isGround(at.press) || !isGround(at.target)) return null;
  return pickSelection(current, { id: null, add: addsToSelection(keys) });
}

export function mountGround(ctx: EditorContext): void {
  const { main, store } = ctx;
  const scroll = main.querySelector('[data-canvas="scroll"]');
  let press: unknown = null;
  scroll?.addEventListener('pointerdown', (event) => {
    press = event.target;
  });
  scroll?.addEventListener('click', (event) => {
    const state = store.get();
    if (!state.on || !(event instanceof MouseEvent)) return;
    const next = groundSelection(state, { press, target: event.target }, event);
    if (next !== null && !sameChosen(next, state)) store.set(next);
  });
}
