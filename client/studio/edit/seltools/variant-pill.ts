// The variant pill on the selection (redesign spec, goal 11; plan 19, task 4; mock v10 `.varpill`),
// in the action bar's place while the selected element has an answered request: previous,
// "Variant 1 of 2", next, Discard and Apply. On showing it holds the first ready variant on the
// canvas; previous and next (and the left and right arrows) hold the neighbour, round the ends;
// pointing at another card of the request in the Claude tab moves the pill to it, as the canvas
// then shows it. Apply is the tab's Apply: one gesture, one undo step. Discard lets the variant go
// and closes the pill until the selection changes (or Claude answers again); the request stays in
// the tab. A variant that is not ready is named, and Apply is off with its card's reason.
//
// The rules are `pillOf`, pure; `createVariantPill` draws a view with `textContent` only.

import { isMac, shortcutHint } from '../../shell/shortcuts.ts';
import { iconButton } from '../../ui/icon.ts';
import type { VariantRef } from '../ai/control.ts';
import { el } from '../props/controls/controls.ts';
import { text } from '../texts.ts';
import { roveButtons, titleOf } from './action-bar.ts';

/** What the pill is worked out from. */
export type PillInput = {
  /** The pill may show: Edit, the Design lens, the latest version, something selected. */
  open: boolean;
  /** The selection as one key: another key is another selection. */
  selection: string;
  /** `variantsFor(selection)` of the Claude tab's control. */
  refs: readonly VariantRef[];
  /** The variant the canvas shows now (`store.variant`), whoever asked for it. */
  shown: { request: string; index: number } | null;
};

/** What the pill keeps between two changes. */
export type PillMemory = {
  selection: string | null;
  /** The request the pill names, and which of its variants. */
  request: string | null;
  index: number;
  /** The variant of that request the canvas showed last time; `null` for none. */
  shown: number | null;
  /** Discard was pressed for this selection and this request. */
  discarded: { selection: string; request: string } | null;
};

export const PILL_START: PillMemory = {
  selection: null,
  request: null,
  index: 0,
  shown: null,
  discarded: null,
};

/** The pill as drawn. */
export type PillView = {
  ref: VariantRef;
  /** Its place, from 0, and how many variants the request has. */
  index: number;
  count: number;
  /** Why it cannot be applied now (its card's words); `null` while it can. */
  reason: string | null;
};

export type PillOutcome = {
  memory: PillMemory;
  /** `null`: no pill. */
  view: PillView | null;
  /** The variant the canvas should hold; `null`: none. */
  hold: string | null;
};

/** The card's words for why a variant cannot be applied now; `null` while it can. */
export function reasonOf(ref: VariantRef): string | null {
  return ref.reason ?? null;
}

function firstReady(refs: readonly VariantRef[]): number {
  return Math.max(
    0,
    refs.findIndex((ref) => ref.ready),
  );
}

/**
 * The pill after any change: which variant it names, and what the canvas should hold. A new
 * request, or another selection, starts at its first ready variant. When the canvas has moved to
 * another variant of the request since last time (a card pointed at in the Claude tab), the pill
 * follows it; a step of the pill's own is not undone by what the canvas still shows.
 */
export function pillOf(memory: PillMemory, input: PillInput): PillOutcome {
  const another = input.selection !== memory.selection;
  const discarded = another ? null : memory.discarded;
  const closed: PillOutcome = {
    memory: { selection: input.selection, request: null, index: 0, shown: null, discarded },
    view: null,
    hold: null,
  };
  const { refs } = input;
  const request = refs[0]?.request;
  if (!input.open || request === undefined) return closed;
  if (discarded?.request === request) return closed;
  const fresh = another || request !== memory.request;
  let index = fresh ? firstReady(refs) : Math.min(Math.max(0, memory.index), refs.length - 1);
  const { shown } = input;
  const now = shown !== null && shown.request === request ? shown.index : null;
  const before = fresh ? null : memory.shown;
  if (now !== null && now !== before && now < refs.length) index = now;
  const ref = refs[index];
  if (ref === undefined) return closed;
  return {
    memory: { selection: input.selection, request, index, shown: now, discarded },
    view: { ref, index, count: refs.length, reason: ref.ready ? null : reasonOf(ref) },
    hold: ref.ready ? ref.key : null,
  };
}

/** Previous or next, round the ends. */
export function pillStepped(memory: PillMemory, count: number, by: -1 | 1): PillMemory {
  if (count === 0) return memory;
  return { ...memory, index: (((memory.index + by) % count) + count) % count };
}

/** Discard: no pill for this selection and this request any more. */
export function pillDiscarded(memory: PillMemory): PillMemory {
  const { selection, request } = memory;
  if (selection === null || request === null) return memory;
  return { ...memory, discarded: { selection, request } };
}

export type PillPorts = {
  step(by: -1 | 1): void;
  discard(): void;
  apply(): void;
};

export type VariantPill = {
  element: HTMLElement;
  /** `busy`: an edit or an apply is on its way, so Apply waits. */
  render(view: PillView, busy: boolean): void;
};

export function createVariantPill(ports: PillPorts): VariantPill {
  const element = el('div', 'k-pop k-pill var-pill');
  element.setAttribute('role', 'toolbar');
  element.setAttribute('aria-label', text('seltools.pill'));
  const mac = isMac(navigator.platform);
  const say = (key: string): string => text(key);
  const prevWords = text('seltools.prev');
  const nextWords = text('seltools.next');
  const prev = iconButton('chevron-left', prevWords);
  prev.title = titleOf(prevWords, shortcutHint('variant-prev', mac, say));
  const next = iconButton('chevron-right', nextWords);
  next.title = titleOf(nextWords, shortcutHint('variant-next', mac, say));
  const count = el('b', 'var-count');
  count.setAttribute('aria-live', 'polite');
  const sep = el('span', 'k-sep');
  sep.setAttribute('role', 'separator');
  sep.setAttribute('aria-orientation', 'vertical');
  const discard = el('button', 'k-btn', text('seltools.discard'));
  discard.type = 'button';
  const apply = el('button', 'k-btn k-btn-primary var-apply', text('seltools.apply'));
  apply.type = 'button';
  element.append(prev, count, next, sep, discard, apply);
  const buttons = [prev, next, discard, apply];
  for (const button of buttons) button.tabIndex = button === apply ? 0 : -1;
  roveButtons(element, () => buttons);

  const off = (button: HTMLButtonElement): boolean =>
    button.getAttribute('aria-disabled') === 'true';
  prev.addEventListener('click', () => {
    if (!off(prev)) ports.step(-1);
  });
  next.addEventListener('click', () => {
    if (!off(next)) ports.step(1);
  });
  discard.addEventListener('click', () => ports.discard());
  apply.addEventListener('click', () => {
    if (!off(apply)) ports.apply();
  });

  return {
    element,
    render(view, busy) {
      count.textContent = text('seltools.of', { n: view.index + 1, count: view.count });
      count.title = view.ref.label;
      const alone = view.count < 2;
      prev.setAttribute('aria-disabled', String(alone));
      next.setAttribute('aria-disabled', String(alone));
      const ready = view.ref.ready && !busy;
      apply.setAttribute('aria-disabled', String(!ready));
      apply.title = view.reason ?? view.ref.label;
    },
  };
}
