// The width of the cards, set in place (plan 15, task B): the width pill's presets and number
// field, and the drag handle on the card's right edge. A frame's width is a style of the frame
// that is already there, so nothing loads again. The rules are in `width.ts`.

import { isPlainClick } from '../clicks.ts';
import { text } from '../edit/texts.ts';
import { toast } from '../edit/toast.ts';
import type { Frame } from '../frames.ts';
import { cardSize } from './caption.ts';
import { replaceAddress } from './cards.ts';
import { pillMenu } from './pill-menu.ts';
import { mountPillMenus } from './pill-menus.ts';
import {
  chooseWidth,
  dragWidth,
  frameHeight,
  parseView,
  presetOf,
  readShown,
  type Shown,
  sameShown,
  shownWidth,
  sizeOf,
  snapToPreset,
  stepView,
  widthAddress,
} from './width.ts';

/** Arrow keys repeat fast; the address and the checks follow once they rest. */
const SETTLE_MS = 250;

const PRESET_LINK = 'a[data-dock-width]';
const SIZE_LINK = 'a[data-dock-size]';
/** The pill's own button for a width that is not a preset: its number, pressed. */
const CUSTOM_LINK = 'a[data-dock-custom]';
const STATE_LINK = '[data-dock="states"] a[data-state]';

export type WidthDeps = {
  main: HTMLElement;
  frames: readonly Frame[];
  /** The canvas zoom and whether a card grows to both sides, for the handle. */
  zoom(): number;
  centred(): boolean;
  /**
   * The width settled and the address `href` names it. `preset`: it is one of the three, whose
   * findings and marks the page now gets from the server.
   */
  onSettled(href: string, preset: boolean): void;
  /** Whether the marks are hidden may have changed. */
  onMarks(): void;
  /** The cards of the width shown are `width` wide now, also during a drag (stage 4c). */
  onApply?(width: number): void;
};

/**
 * The size labels this control writes: the cards of the width shown. A width card of stage 4c
 * (`data-card="width"`) keeps its own preset.
 */
const SIZE_LABELS = ['current', 'before']
  .map((role) => `[data-card="${role}"] [data-card-size]`)
  .join(', ');

export type WidthControl = {
  /** The findings' marks do not belong to what the cards show now. */
  marksHidden(): boolean;
  /** After the page swapped the dock's links: marks them and keeps the custom width in them. */
  sync(): void;
};

export function mountWidth(deps: WidthDeps): WidthControl {
  const { main, frames } = deps;
  const field = main.querySelector<HTMLInputElement>('input[data-dock-view]');
  const form = field?.form ?? null;
  const note = main.querySelector<HTMLElement>('[data-dock-note]');
  const said = main.querySelector<HTMLElement>('[data-dock-said]');
  // The mark's words are its title; a press shows them to a hand that cannot hover.
  note?.addEventListener('click', () => toast(main, note.title));
  const handle = main.querySelector<HTMLElement>('[data-canvas="handle"]');
  // The state menu and More: the keyboard's part of both.
  mountPillMenus(main);

  const fromAddress = new URL(location.href).searchParams.get('view');
  let shown: Shown = readShown(main.dataset.width, main.dataset.view ?? fromAddress);
  /** What the address and the Checks pane were last told. */
  let settled: Shown = shown;
  let dragging = false;
  let timer: ReturnType<typeof setTimeout> | undefined;
  let hidden = shown.view !== null;

  const marksHidden = (): boolean => dragging || shown.view !== null || !sameShown(shown, settled);

  /** Tells the page once each time the marks go from shown to hidden or back. */
  function tellMarks(): void {
    if (marksHidden() === hidden) return;
    hidden = !hidden;
    deps.onMarks();
  }

  function markLinks(): void {
    for (const link of main.querySelectorAll<HTMLAnchorElement>(PRESET_LINK)) {
      const preset = presetOf(Number(link.dataset.dockWidth));
      if (shown.view === null && preset === shown.width) link.setAttribute('aria-current', 'true');
      else link.removeAttribute('aria-current');
    }
    // A width that is no preset shows in the pill as its number, pressed.
    const custom = pillMenu({ width: shownWidth(shown), cards: 1 }).custom;
    for (const link of main.querySelectorAll<HTMLAnchorElement>(CUSTOM_LINK)) {
      link.hidden = !custom;
      if (custom) {
        link.textContent = String(shownWidth(shown));
        link.setAttribute('aria-current', 'true');
      } else {
        link.textContent = '';
        link.removeAttribute('aria-current');
      }
    }
    // The menu's rows: the one at the width shown is current, a preset or not.
    for (const link of main.querySelectorAll<HTMLAnchorElement>(SIZE_LINK)) {
      if (Number(link.dataset.dockSize) === shownWidth(shown)) {
        link.setAttribute('aria-current', 'true');
      } else link.removeAttribute('aria-current');
    }
    // A state link keeps the width shown now, also before the server's fresh links are here.
    for (const link of main.querySelectorAll<HTMLAnchorElement>(STATE_LINK)) {
      if (!link.hasAttribute('href')) continue;
      try {
        link.href = widthAddress(link.href, shown);
      } catch {
        // An address the browser cannot read stays as the server wrote it.
      }
    }
  }

  /** Sizes the frames and writes what the page says about the width. `typed`: from the field. */
  function apply(typed = false): void {
    const width = shownWidth(shown);
    const height = frameHeight(width);
    for (const frame of frames) {
      frame.element.style.width = `${width}px`;
      frame.element.style.height = `${height}px`;
      frame.element.width = String(width);
    }
    for (const size of main.querySelectorAll<HTMLElement>(SIZE_LABELS)) {
      size.textContent = cardSize(width, text);
    }
    main.dataset.width = String(shown.width);
    if (shown.view === null) delete main.dataset.view;
    else main.dataset.view = String(shown.view);
    // A half-typed number stays while the person is in the field.
    if (field && (typed || document.activeElement !== field)) field.value = String(width);
    if (note) note.hidden = shown.view === null;
    // A screen reader hears it once, when the marks go.
    const words = shown.view === null ? '' : (note?.title ?? '');
    if (said && said.textContent !== words) said.textContent = words;
    handle?.setAttribute('aria-valuenow', String(width));
    markLinks();
    tellMarks();
    deps.onApply?.(width);
  }

  /** The address follows, and a preset gets its checks and marks back. */
  function settle(): void {
    clearTimeout(timer);
    timer = undefined;
    if (sameShown(shown, settled)) return;
    settled = shown;
    const href = widthAddress(location.href, shown);
    replaceAddress(href);
    deps.onSettled(href, shown.view === null);
    tellMarks();
  }

  function set(next: Shown, when: 'now' | 'soon' | 'later', typed = false): void {
    shown = next;
    apply(typed);
    if (when === 'now') settle();
    else if (when === 'soon') {
      clearTimeout(timer);
      timer = setTimeout(settle, SETTLE_MS);
    }
  }

  main.addEventListener('click', (event) => {
    if (!isPlainClick(event) || !(event.target instanceof Element)) return;
    // The number of the width shown is already what the cards show.
    if (event.target.closest(CUSTOM_LINK)) {
      event.preventDefault();
      return;
    }
    const size = event.target.closest<HTMLAnchorElement>(SIZE_LINK);
    if (size) {
      const asked = sizeOf(size.dataset.dockSize);
      if (asked === null) return;
      event.preventDefault();
      set(chooseWidth(shown, asked), 'now');
      // A pick closes the menu, the focus back on its button.
      const menu = size.closest('details');
      if (menu?.open) {
        menu.open = false;
        menu.querySelector('summary')?.focus();
      }
      return;
    }
    const link = event.target.closest<HTMLAnchorElement>(PRESET_LINK);
    const preset = link ? presetOf(Number(link.dataset.dockWidth)) : null;
    if (preset === null) return;
    event.preventDefault();
    set({ width: preset, view: null }, 'now');
  });

  if (field) {
    const commit = (): void => {
      const typed = parseView(field.value);
      // Nothing a width can be made of: the field shows the width again.
      set(typed === null ? shown : chooseWidth(shown, typed), 'now', true);
    };
    field.addEventListener('change', commit);
    form?.addEventListener('submit', (event) => {
      event.preventDefault();
      commit();
    });
    field.addEventListener('keydown', (event) => {
      if (event.key !== 'ArrowUp' && event.key !== 'ArrowDown') return;
      event.preventDefault();
      const from = parseView(field.value) ?? shownWidth(shown);
      const next = stepView(from, event.key === 'ArrowUp' ? 1 : -1, event.shiftKey);
      set(chooseWidth(shown, next), 'soon', true);
    });
  }

  if (handle) {
    let start: { x: number; width: number; zoom: number; centred: boolean } | null = null;
    const end = (): void => {
      if (!start) return;
      start = null;
      dragging = false;
      main.removeAttribute('data-resizing');
      settle();
      // Also when the width ended where it began: the marks were hidden for the drag.
      tellMarks();
    };
    handle.addEventListener('pointerdown', (event) => {
      if (event.button !== 0) return;
      event.preventDefault();
      start = {
        x: event.clientX,
        width: shownWidth(shown),
        zoom: deps.zoom(),
        centred: deps.centred(),
      };
      dragging = true;
      // The skin keeps the frames from taking the pointer while this is on.
      main.setAttribute('data-resizing', '');
      try {
        handle.setPointerCapture(event.pointerId);
      } catch {
        // A pointer that is already gone: the drag ends with the next `pointerup`.
      }
      handle.focus({ preventScroll: true });
    });
    handle.addEventListener('pointermove', (event) => {
      if (!start) return;
      const dragged = dragWidth(start.width, event.clientX - start.x, start.zoom, start.centred);
      set(chooseWidth(shown, snapToPreset(dragged)), 'later');
    });
    handle.addEventListener('pointerup', end);
    handle.addEventListener('pointercancel', end);
    handle.addEventListener('lostpointercapture', end);
    handle.addEventListener('keydown', (event) => {
      const up = event.key === 'ArrowRight' || event.key === 'ArrowUp';
      const down = event.key === 'ArrowLeft' || event.key === 'ArrowDown';
      if (!up && !down) return;
      event.preventDefault();
      const next = stepView(shownWidth(shown), up ? 1 : -1, event.shiftKey);
      set(chooseWidth(shown, next), 'soon');
    });
  }

  apply();
  return {
    marksHidden,
    sync() {
      apply();
    },
  };
}
