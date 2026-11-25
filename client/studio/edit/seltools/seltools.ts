// The tools on the selection (redesign spec, goals 11 and 12; plan 19, task 4): the action bar
// and, in its place while the selected element has an answered request, the variant pill. Page
// markup in `div[data-sel-tools]` over the stage, placed from where the edit card says the element
// is (`anchor.ts`, `place.ts`). Edit only, the Design lens only, never on an older version, and
// not while the context menu is open. The host is placed absolutely over the stage, so showing,
// hiding and moving the tools never moves anything else. What opens rises in (`.k-pop`); a return
// after a movement only becomes visible again.

import type { CanvasStudioMessage, FrameBox } from '../../../channel/canvas-protocol.ts';
import { type Frame, frameMessage } from '../../frames.ts';
import { lens } from '../../lens/lens.ts';
import { isMac } from '../../shell/shortcuts.ts';
import { aiControl } from '../ai/control.ts';
import { variantKey } from '../ai/requests.ts';
import type { EditorContext } from '../context.ts';
import type { EditorState } from '../store.ts';
import { toPageBox } from '../structure/menu-place.ts';
import { barModel, createActionBar } from './action-bar.ts';
import { type AnchorTarget, anchorTargets, createAnchor, type HoldReason } from './anchor.ts';
import { clipBox, type PageBox, placeBar } from './place.ts';
import { setVariantStep } from './step.ts';
import {
  createVariantPill,
  PILL_START,
  type PillView,
  pillDiscarded,
  pillOf,
  pillStepped,
} from './variant-pill.ts';

/**
 * What the tools never cover: the lens pill, the state and width pills and their open menus, the
 * zoom, the ask bar and what stands above it (its commands, its notes).
 */
const KEEP_OUT = [
  '[data-lens-pill]',
  '[data-shell="dock"]',
  '.pill-menu[open] > .k-pop',
  '[data-dock="zoom"]',
  '[data-ask-bar]',
  '[data-ask-bar] .ask-above > *',
];

const HOLDS: readonly HoldReason[] = ['drag', 'handle', 'resize', 'text'];

/** A pill's update may hold a variant, which tells the pill again: at most this many rounds. */
const MAX_ROUNDS = 4;

/**
 * `locate` as the anchor asks it: with `item` for the chosen copy of a list item, and always
 * `scroll: false`, so reading the box never fights the person's scroll.
 */
type AnchorLocate = Extract<CanvasStudioMessage, { type: 'locate' }>;

/**
 * False with no window to ask. A card still loading loses the message; its `ready` asks again.
 * (`frame.ready` is not read: the draft page sets it after this script hears that `ready`.)
 */
function sendLocate(frame: Frame, target: AnchorTarget, request: number): boolean {
  const view = frame.element.contentWindow;
  if (view === null) return false;
  const message: AnchorLocate = {
    kitvas: 1,
    channel: frame.channel,
    type: 'locate',
    request,
    id: target.id,
    ...(target.item === undefined ? {} : { item: target.item }),
    scroll: false,
  };
  // A sandboxed frame has an opaque origin, so the target is `*`; nothing secret is sent.
  view.postMessage(message, '*');
  return true;
}

/** A box of the page as the stage's pixels. */
function inStage(rect: DOMRect, stage: DOMRect): PageBox {
  const { width, height } = rect;
  return { x: rect.left - stage.left, y: rect.top - stage.top, width, height };
}

/** The tools show at all: Edit, the Design lens, the latest version, something selected. */
const gate = (state: EditorState): boolean =>
  state.on && state.viewing === null && state.selection.length > 0 && lens.get() === 'design';

const selectionKey = (state: EditorState): string => state.selection.join('\n');

/** Shown or hidden; set only when it changes, so the entrance runs once per opening. */
function setShown(element: HTMLElement, on: boolean): void {
  if (element.hidden === !on) return;
  element.hidden = !on;
}

export function mountSelTools(ctx: EditorContext): void {
  const { store, bridge, main } = ctx;
  const host = main.querySelector<HTMLElement>('[data-sel-tools]');
  const found = host?.closest<HTMLElement>('section.stage-canvas');
  if (!host || !found) return;
  const stage: HTMLElement = found;
  const mac = isMac(navigator.platform);

  const anchor = createAnchor({
    clock: {
      after(ms, run) {
        const timer = setTimeout(run, ms);
        return () => clearTimeout(timer);
      },
    },
    locate: (target, request) => sendLocate(bridge.frame, target, request),
    toStage,
  });

  /** The edit card's box as stage pixels, cut to what shows of the card. */
  function toStage(box: FrameBox): PageBox | null {
    const element = bridge.frame.element;
    const rect = element.getBoundingClientRect();
    // The card's scale on the screen, as the zoom put it.
    const scale = element.offsetWidth > 0 ? rect.width / element.offsetWidth : store.get().zoom;
    const page = toPageBox(rect, scale, box);
    const card = { x: rect.left, y: rect.top, width: rect.width, height: rect.height };
    const shown = clipBox(page, card);
    if (shown === null) return null;
    const origin = stage.getBoundingClientRect();
    return { ...shown, x: shown.x - origin.left, y: shown.y - origin.top };
  }

  function keepOut(): PageBox[] {
    const origin = stage.getBoundingClientRect();
    const boxes: PageBox[] = [];
    for (const node of stage.querySelectorAll<HTMLElement>(KEEP_OUT.join(', '))) {
      if (node.hidden) continue;
      const rect = node.getBoundingClientRect();
      if (rect.width > 0 && rect.height > 0) boxes.push(inStage(rect, origin));
    }
    return boxes;
  }

  /** The menu was opened from the bar's More: the focus comes back to it when it closes. */
  let fromMore = false;
  const bar = createActionBar(ctx, () => {
    fromMore = true;
  });
  let applying = false;
  const pill = createVariantPill({
    step: (by) => void step(by),
    discard,
    apply: () => void applyShown(),
  });
  bar.element.hidden = true;
  pill.element.hidden = true;
  host.append(bar.element, pill.element);

  let memory = PILL_START;
  let pillView: PillView | null = null;
  /** The variant the pill asked the canvas to hold, so it lets it go once. */
  let asked: string | null = null;
  let barDirty = true;
  let unhear: (() => void) | null = null;

  const showsNow = (key: string): boolean => {
    const shown = store.get().variant;
    return shown !== null && variantKey(shown.request, shown.index) === key;
  };

  function holdOnCanvas(key: string | null): void {
    const control = aiControl();
    if (!control) return;
    if (key !== null) {
      asked = key;
      if (!showsNow(key)) control.show(key);
    } else if (asked !== null) {
      asked = null;
      control.show(null);
    }
  }

  /** Places what shows, or keeps it away (no box, or no room) without hiding it. */
  function place(element: HTMLElement): void {
    const view = { width: stage.clientWidth, height: stage.clientHeight };
    const size = { width: element.offsetWidth, height: element.offsetHeight };
    const at = placeBar(anchor.box(), size, view, keepOut());
    if (at === null) {
      element.dataset.away = '';
      return;
    }
    element.style.translate = `${Math.round(at.left)}px ${Math.round(at.top)}px`;
    delete element.dataset.away;
  }

  function once(): void {
    // The Claude tab sets its control when it mounts; it may come after this.
    const control = aiControl();
    if (unhear === null && control) unhear = control.onChange(update);
    const state = store.get();
    const open = gate(state);
    const refs = open && control ? control.variantsFor(state.selection) : [];
    const selection = selectionKey(state);
    const out = pillOf(memory, { open, selection, refs, shown: state.variant });
    memory = out.memory;
    pillView = out.view;
    const visible = open && state.menu === null;
    const showPill = visible && pillView !== null;
    const showBar = visible && !showPill;
    if (showBar && (barDirty || bar.element.hidden)) {
      bar.render(barModel(state, mac));
      barDirty = false;
    }
    if (showPill && pillView) pill.render(pillView, state.busy || applying);
    setShown(bar.element, showBar);
    setShown(pill.element, showPill);
    if (showBar) place(bar.element);
    if (showPill) place(pill.element);
    holdOnCanvas(out.hold);
  }

  let updating = false;
  let again = false;
  function update(): void {
    if (updating) {
      again = true;
      return;
    }
    updating = true;
    try {
      let rounds = 0;
      do {
        again = false;
        once();
        rounds += 1;
      } while (again && rounds < MAX_ROUNDS);
    } finally {
      updating = false;
    }
  }

  function step(by: -1 | 1): boolean {
    if (pillView === null) return false;
    memory = pillStepped(memory, pillView.count, by);
    update();
    return true;
  }

  function discard(): void {
    memory = pillDiscarded(memory);
    update();
  }

  async function applyShown(): Promise<void> {
    const control = aiControl();
    const view = pillView;
    if (!control || view === null || !view.ref.ready || applying) return;
    applying = true;
    update();
    try {
      await control.apply(view.ref.key);
    } finally {
      applying = false;
      update();
    }
  }

  setVariantStep(step);
  anchor.onChange(update);
  lens.subscribe(update);

  store.subscribe((state, previous) => {
    const selected = state.selection !== previous.selection || state.copies !== previous.copies;
    // What the bar's words and buttons are made of.
    const words =
      selected ||
      state.structure !== previous.structure ||
      state.locked !== previous.locked ||
      state.hidden !== previous.hidden ||
      state.tree !== previous.tree ||
      state.inspected !== previous.inspected ||
      state.clipboard !== previous.clipboard;
    if (words) barDirty = true;
    if (!state.on && previous.on) {
      for (const reason of HOLDS) anchor.hold(reason, false);
    }
    if (selected) {
      // A pick ends an inline text edit in the frame; the new element is located.
      anchor.hold('text', false);
      anchor.follow(anchorTargets(state));
    }
    if (state.zoom !== previous.zoom) anchor.moved();
    if (state.builds !== previous.builds) anchor.again();
    // Not on every change: the hover alone changes many times a second.
    const shows =
      words ||
      state.on !== previous.on ||
      state.viewing !== previous.viewing ||
      state.menu !== previous.menu ||
      state.busy !== previous.busy ||
      state.variant !== previous.variant ||
      state.requests !== previous.requests;
    if (shows) update();
    // The menu that More opened closed with the focus nowhere: it comes back to More.
    if (previous.menu !== null && state.menu === null && fromMore) {
      fromMore = false;
      const active = document.activeElement;
      const lost = active === null || active === document.body || !active.isConnected;
      if (lost && !bar.element.hidden) bar.more.focus();
    }
  });

  // The edit card's answers, its scrolls and its loads (a build taken in place says `ready`).
  window.addEventListener('message', (event) => {
    const heard = frameMessage(bridge.frames(), event);
    if (!heard || heard.frame !== bridge.frame) return;
    const { message } = heard;
    if (message.type === 'located') anchor.located(message.request, message.box);
    else if (message.type === 'scrolled') anchor.moved();
    else if (message.type === 'ready') anchor.again();
  });
  // A handle held in the frame, an inline text edit, a drag over the frame from the page.
  bridge.on((message) => {
    if (message.type === 'handle') anchor.hold('handle', !message.done);
    else if (message.type === 'text') anchor.hold('text', false);
    else if (message.type === 'drop' || message.type === 'reorder') anchor.again();
  });
  bridge.onSend?.((body) => {
    if (body.type === 'edit-text') anchor.hold('text', true);
    else if (body.type === 'drag') {
      anchor.hold('drag', body.phase === 'start' || body.phase === 'move');
    }
  });
  bridge.cards?.onChange(() => anchor.again());
  // A drag of the page (the layers, the Insert pane), ended wherever it is let go.
  document.addEventListener('dragstart', () => anchor.hold('drag', true), true);
  for (const type of ['dragend', 'drop'] as const) {
    window.addEventListener(type, () => anchor.hold('drag', false), true);
  }
  // The width handle (`data-resizing` on the screen while it is dragged).
  new MutationObserver(() => anchor.hold('resize', main.hasAttribute('data-resizing'))).observe(
    main,
    { attributes: true, attributeFilter: ['data-resizing'] },
  );
  // A scroll or a pan of the stage, a window or a panel resizing the stage, a card resized.
  main
    .querySelector<HTMLElement>('[data-canvas="scroll"]')
    ?.addEventListener('scroll', () => anchor.moved(), { passive: true });
  window.addEventListener('resize', () => anchor.moved());
  if (typeof ResizeObserver === 'function') {
    const sizes = new ResizeObserver(() => anchor.moved());
    sizes.observe(stage);
    for (const frame of bridge.frames()) sizes.observe(frame.element);
    bridge.cards?.onChange(() => {
      for (const frame of bridge.frames()) sizes.observe(frame.element);
    });
  }

  anchor.follow(anchorTargets(store.get()));
  update();
}
