// The edit context (spec 4c, goals 1 and 3; plan 16, task B): where style edits go. The width is
// the edit card's (the card the person last worked in): the largest kit breakpoint at or below
// it, every width at the base. The state is the Properties header's state bar: Default, Hover,
// Focus, Active. A state is forced on the selected elements in every card, so what is edited is
// seen; another selection, or leaving Edit, lets them rest again. Plan 25: a version with
// options has a third control, the option value edits go to ("All options", or "Only Theme:
// Dark" for a value the page shows off its default); it follows the values shown. The rules are
// in `context-rules.ts`; `contextBarView` and `optionBarView` are what the properties panel draws.

import { sameOption } from '../../../../../src/edit/domain/op-kinds.ts';
import type { ContextOption, StyleContext, StyleState } from '../../../../../src/edit/index.ts';
import {
  type DraftOption,
  type OptionChoice,
  offDefault,
} from '../../../../../src/shared/values/options.ts';
import type { Inspect } from '../../../../../src/studio/api/edit/edit-schemas.ts';
import { frameWidth } from '../../../canvas/card-list.ts';
import { choiceStoreOf } from '../../../options/choice.ts';
import type { EditorContext } from '../../context.ts';
import {
  BAR_STATES,
  breakpointsOf,
  contextWidthOf,
  forceBody,
  keptOption,
  optionKey,
  optionWords,
  restContext,
  stateName,
  widthWords,
} from '../../style/context-rules.ts';
import type { Format } from '../../style/ops.ts';
import { text } from '../../texts.ts';
import { el, selectControl } from '../controls/controls.ts';

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

/**
 * The bar's third control (plan 25): "All options", then "Only <Option>: <Value>" for each value
 * the page shows that differs from its default. A full-width line of its own under the width and
 * the states, there for every version with options (disabled while every value is the default),
 * so a switch of a value never moves the rows; a redraw replaces this line only.
 */
export function optionBarView(bar: {
  list: readonly DraftOption[];
  choice: OptionChoice;
  option: ContextOption | null;
  pick(option: ContextOption | null): void;
  redraw(): void;
}): HTMLElement {
  const targets = offDefault(bar.list, bar.choice);
  const items = [
    { value: optionKey(null), label: text('context.option.all') },
    ...targets.map((one) => ({
      value: optionKey(one),
      label: text('context.option.only', optionWords(bar.list, one)),
    })),
  ];
  const control = selectControl({
    label: text('context.option.label'),
    value: optionKey(keptOption(bar.option, bar.list, bar.choice)),
    options: items,
    disabled: targets.length === 0,
    onChange: (value) => {
      const picked = targets.find((one) => optionKey(one) === value) ?? null;
      if (!sameOption(picked, bar.option)) bar.pick(picked);
    },
    // A draw held while the list was open shows once it closes.
    onClose: () => bar.redraw(),
  });
  // A row key, so the panel puts the focus back on it after a redraw.
  control.dataset.row = 'context-option';
  if (targets.length === 0) control.title = text('context.option.none');
  return control;
}

/** The list scope switch: `chosen` is whether one copy of the item is picked on the canvas. */
export type ScopeBar = {
  mode: 'all' | 'item';
  count: number;
  chosen: boolean;
  pick(mode: 'all' | 'item'): void;
};

/**
 * The item count the "All N items | This item" switch shows, or `null` when there is no switch:
 * one element only, an SCSS draft, a literal list of at least two items (ADR 0072).
 */
export function scopeOf(input: {
  views: number;
  count: number;
  format: Format;
  list: Inspect['list'];
}): number | null {
  const { views, count, format, list } = input;
  if (views !== 1 || format !== 'scss' || list?.kind !== 'literal') return null;
  return count >= 2 ? count : null;
}

/** The switch under the context bar: all the list's items, or the one picked on the canvas. */
export function scopeBarView(scope: ScopeBar): HTMLElement {
  const bar = el('div', 'k-seg props-scope');
  bar.setAttribute('role', 'group');
  bar.setAttribute('aria-label', text('props.scope.label'));
  // A row key, so the panel puts the focus back on the same button after a redraw.
  bar.dataset.row = 'scope';
  const buttons: [mode: 'all' | 'item', label: string][] = [
    ['all', text('props.scope.all', { count: scope.count })],
    ['item', text('props.scope.item')],
  ];
  for (const [mode, label] of buttons) {
    const button = el('button', undefined, label);
    button.type = 'button';
    button.dataset.control = `scope-${mode}`;
    button.setAttribute('aria-pressed', String(mode === scope.mode));
    if (mode === 'item' && !scope.chosen) {
      button.disabled = true;
      button.title = text('props.scope.pickCopy');
    }
    button.addEventListener('click', () => {
      if (mode !== scope.mode) scope.pick(mode);
    });
    bar.append(button);
  }
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

  // Plan 25: the bar's option follows the values the page shows; a value no longer shown off its
  // default gives way to "All options", so an edit never goes to a value that is not on the page.
  const choices = choiceStoreOf(ctx.main);
  if (choices !== undefined) {
    choices.subscribe((choice) => {
      const { context } = store.get();
      const option = keptOption(context.option, choices.options(), choice);
      if (option !== context.option) store.set({ context: { ...context, option } });
    });
  }

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
