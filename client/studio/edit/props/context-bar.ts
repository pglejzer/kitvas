// The edit context (spec 4c, goals 1 and 3; plan 16, task B): where style edits go. The width is
// the edit card's (the card the person last worked in): the largest kit breakpoint at or below
// it, every width at the base. The state is the Properties header's state bar: Default, Hover,
// Focus, Active. A state is forced on the selected elements in every card, so what is edited is
// seen; another selection, or leaving Edit, lets them rest again. The rules are in
// `context-rules.ts`; `contextBarView` is the bar the properties panel draws.

import type { StyleContext, StyleState } from '../../../../src/edit/index.ts';
import { frameWidth } from '../../canvas/card-list.ts';
import type { EditorContext } from '../context.ts';
import {
  BAR_STATES,
  breakpointsOf,
  contextWidthOf,
  forceBody,
  restContext,
  stateName,
  widthWords,
} from '../style/context-rules.ts';
import { text } from '../texts.ts';
import { el } from './controls.ts';

/**
 * The line under the header: the width edits go to as a chip, and the state they go to as a
 * segmented control (plan 18: the context bar of stage 4c in the new look).
 */
export function contextBarView(options: {
  context: StyleContext;
  pick(state: StyleState | null): void;
}): HTMLElement {
  const { context } = options;
  const bar = el('div', 'props-where');
  // A row key, so the panel puts the focus back on the same state after a redraw.
  bar.dataset.row = 'context';
  const words = widthWords(context.width);
  const width = el('span', 'k-chip props-width', text(words.key, words.params));
  width.title = text('context.where.hint');
  // Heard before the chip: "Edits apply to All widths". On screen the chip says enough.
  const where = el('span', 'k-sr', text('context.where'));
  const states = el('div', 'k-seg props-states');
  states.setAttribute('role', 'group');
  states.setAttribute('aria-label', text('context.states'));
  for (const state of BAR_STATES) {
    const name = stateName(state);
    const button = el('button', undefined, text(`context.state.${name}`));
    button.type = 'button';
    button.dataset.control = `state-${name}`;
    button.setAttribute('aria-pressed', String(state === context.state));
    button.addEventListener('click', () => {
      if (state !== context.state) options.pick(state);
    });
    states.append(button);
  }
  bar.append(where, width, states);
  return bar;
}

export function mountContextBar(ctx: EditorContext): void {
  const { store, bridge } = ctx;
  /** The `inspect` asked of a new edit card, for the computed values at its width. */
  let asked = -1;
  let edit = bridge.frame;

  /** The width context follows the edit card and the kit's breakpoints. */
  function follow(): void {
    const { context, inspected } = store.get();
    const frame = bridge.frame;
    const cardWidth = bridge.cards?.widthOf(frame) ?? frameWidth(frame);
    const width = contextWidthOf(cardWidth, breakpointsOf(inspected));
    bridge.setPreviewWidth?.(width);
    if (width !== context.width) store.set({ context: { ...context, width } });
  }

  /** Another edit card: the panel's computed values are read again from it. */
  function readComputed(): void {
    const { on, selection } = store.get();
    const id = selection[0];
    if (!on || id === undefined) return;
    asked = bridge.nextRequest();
    bridge.send({ type: 'inspect', request: asked, id });
  }

  bridge.cards?.onChange(() => {
    follow();
    if (bridge.frame === edit) return;
    edit = bridge.frame;
    readComputed();
  });

  bridge.on((message) => {
    if (message.type !== 'inspected' || message.request !== asked) return;
    asked = -1;
    if (message.id !== store.get().selection[0]) return;
    store.set({ computed: message.found ? message.styles : null });
  });

  store.subscribe((state, previous) => {
    // The breakpoints come with the element's inspect answer.
    if (state.inspected !== previous.inspected) follow();
    const rest = restContext(state, previous);
    if (rest) {
      // The next notification sends the resting state to the frames.
      store.set({ context: rest });
      return;
    }
    const forced = state.context.state;
    const changed = forced !== previous.context.state;
    const moved = forced !== null && state.selection !== previous.selection;
    if (changed || moved) bridge.sendLive(forceBody(state.on ? state.selection : [], forced));
    else if (previous.on && !state.on) bridge.sendLive(forceBody([], null));
  });

  follow();
}
