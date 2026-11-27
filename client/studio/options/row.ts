// The Options pill and its row on the canvas (plan 25), the script of `src/studio/pages/draft/
// options-row.ts`. The page works without it: every value is a link. With it a click on a value
// switches the frames in place (`choice.ts`), the address and the page's own links follow, and the
// row, the pill's dot and the caption above each card are drawn again. The row is open or folded
// per browser (`localStorage`, guarded: storage may throw); opening it moves only the canvas's
// room (the skin), so nothing else on the screen moves, and a switch never reloads a frame, so a
// selection, a lock and a note stay.

import {
  choiceFromQuery,
  choiceToQuery,
  type DraftOption,
  defaultChoice,
  OPTION_ID,
  OPTION_VALUE,
} from '../../../src/shared/values/options.ts';
import type { CardSource } from '../canvas/card-list.ts';
import { isPlainClick } from '../clicks.ts';
import type { Store } from '../edit/store.ts';
import { text } from '../edit/texts.ts';
import { type Frame, sendOptions } from '../frames.ts';
import {
  type ChoiceControl,
  createChoiceStore,
  laidOver,
  optionsAddress,
  registerChoiceStore,
} from './choice.ts';
import { mountMakeDefault } from './default.ts';
import { captionWords, endParts } from './words.ts';

/** Where the browser keeps whether the row is open: `1` or `0`. */
const OPEN_KEY = 'kitvas.options.open';

function remembered(): boolean | null {
  try {
    const value = localStorage.getItem(OPEN_KEY);
    return value === null ? null : value === '1';
  } catch {
    return null;
  }
}

function remember(open: boolean): void {
  try {
    localStorage.setItem(OPEN_KEY, open ? '1' : '0');
  } catch {
    // Storage is off: the row is open or folded for this visit only.
  }
}

/** The options the server wrote into the row: ids, labels, defaults and values. */
function optionsOfRow(row: HTMLElement): DraftOption[] {
  const found: DraftOption[] = [];
  for (const axis of row.querySelectorAll<HTMLElement>('.opt-axis[data-option]')) {
    const id = axis.dataset.option;
    const fallback = axis.dataset.default;
    if (id === undefined || fallback === undefined) continue;
    if (!OPTION_ID.test(id) || !OPTION_VALUE.test(fallback)) continue;
    const values = [...axis.querySelectorAll<HTMLElement>('[data-value]')].flatMap((link) => {
      const value = link.dataset.value;
      if (value === undefined || !OPTION_VALUE.test(value)) return [];
      return [{ id: value, label: link.textContent?.trim() ?? value }];
    });
    const label = axis.querySelector('.opt-name')?.textContent?.trim() ?? id;
    found.push({ id, label, default: fallback, values });
  }
  return found;
}

export type OptionsPage = {
  control: ChoiceControl;
  /** The editor started: Make default is offered while Edit is on, on the latest version. */
  joinEditor(store: Store): void;
};

/** What the page gives the options: its frames, and its cards when it has a list of them. */
export type OptionsDeps = {
  /** Every card's frame (the width shown first); an empty list while none is there. */
  frames(): readonly Frame[];
  cards?: CardSource | undefined;
};

/**
 * Starts the options of a draft page; `undefined` for a version without options. The store is the
 * page's (`choiceStoreOf`), made before the editor starts so its panels find it.
 */
export function mountOptions(main: HTMLElement, deps: OptionsDeps): OptionsPage | undefined {
  const row = main.querySelector<HTMLElement>('#options-row');
  const toggle = main.querySelector<HTMLButtonElement>('[data-options-toggle]');
  const region = main.querySelector<HTMLElement>('[data-shell="canvas"]');
  if (!row || !toggle || !region) return undefined;
  const options = optionsOfRow(row);
  if (options.length === 0) return undefined;

  const control = createChoiceStore({
    options,
    initial: choiceFromQuery(options, new URL(location.href).searchParams),
    frames: deps.frames,
    send: sendOptions,
    address: {
      href: () => location.href,
      replace(href) {
        try {
          history.replaceState(history.state, '', href);
        } catch {
          // An address the browser would not take: the page keeps working, the address stays.
        }
      },
    },
  });
  registerChoiceStore(main, control);

  const axes = row.querySelector<HTMLElement>('[data-options-axes]');
  const dot = toggle.querySelector<HTMLElement>('[data-options-off]');
  const note = row.querySelector<HTMLElement>('[data-options-default-note]');
  const reset = row.querySelector<HTMLButtonElement>('[data-options-reset]');
  const make = row.querySelector<HTMLButtonElement>('[data-options-default]');
  /** Set once the editor is here; it decides whether Make default shows. */
  let offered: (() => boolean) | null = null;

  const setOpen = (open: boolean): void => {
    region.dataset.options = open ? 'open' : 'closed';
    toggle.setAttribute('aria-expanded', String(open));
  };

  /** The row's fade at its end says there is more to scroll to. */
  function drawMore(): void {
    if (!axes) return;
    const more = axes.scrollLeft + axes.clientWidth < axes.scrollWidth - 1;
    if (more) axes.setAttribute('data-more', '');
    else axes.removeAttribute('data-more');
  }

  /** The links the page's controls hold keep the values: the address says them all. */
  function drawLinks(): void {
    const choice = control.get();
    const all = control.options();
    for (const link of main.querySelectorAll<HTMLAnchorElement>('a[href]')) {
      if (link.hasAttribute('data-value')) continue;
      try {
        if (new URL(link.href).pathname !== location.pathname) continue;
        link.href = optionsAddress(link.href, all, choice);
      } catch {
        // A link the browser cannot read stays as the server wrote it.
      }
    }
    // The typed width goes by a form: its values go as hidden fields.
    for (const form of main.querySelectorAll<HTMLFormElement>('form[data-dock="view"]')) {
      for (const field of form.querySelectorAll('input[data-dock-option]')) field.remove();
      for (const [name, value] of choiceToQuery(all, choice)) {
        const field = document.createElement('input');
        field.type = 'hidden';
        field.name = name;
        field.value = value;
        field.dataset.dockOption = '';
        form.prepend(field);
      }
    }
  }

  /** The caption above each card names the values that differ. */
  function drawCaption(): void {
    const words = captionWords(control.options(), control.get(), text);
    for (const caption of main.querySelectorAll<HTMLElement>('.card-caption')) {
      let span = caption.querySelector<HTMLElement>('.opt-caption');
      if (!span) {
        span = document.createElement('span');
        span.className = 'opt-caption';
        caption.append(span);
      }
      if (span.textContent !== words) span.textContent = words;
    }
  }

  const draw = (): void => {
    const choice = control.get();
    const all = control.options();
    for (const axis of row.querySelectorAll<HTMLElement>('.opt-axis[data-option]')) {
      const id = axis.dataset.option ?? '';
      for (const link of axis.querySelectorAll<HTMLAnchorElement>('a[data-value]')) {
        const value = link.dataset.value ?? '';
        link.setAttribute('aria-pressed', String(choice[id] === value));
        link.href = optionsAddress(location.href, all, laidOver(all, choice, { [id]: value }));
      }
    }
    const differs = choiceToQuery(all, choice).length;
    if (dot) dot.hidden = differs === 0;
    const parts = endParts(differs, offered?.() ?? false);
    if (note) note.hidden = !parts.note;
    if (reset) reset.hidden = !parts.reset;
    if (make) make.hidden = !parts.make;
    drawLinks();
    drawCaption();
    drawMore();
  };

  // The first state: open unless this browser folded it. The glide is turned on only once that
  // state is laid out (the read below), so a row this browser folded never glides shut on load:
  // a mark set in the next frame came before that frame's layout, and the canvas moved with it.
  setOpen(remembered() ?? true);
  control.subscribe(draw);
  deps.cards?.onChange(drawCaption);
  draw();
  void region.offsetHeight;
  region.setAttribute('data-options-live', '');

  toggle.addEventListener('click', () => {
    const open = region.dataset.options !== 'open';
    setOpen(open);
    remember(open);
  });
  row.addEventListener('click', (event) => {
    const link =
      event.target instanceof Element
        ? event.target.closest<HTMLAnchorElement>('a[data-value]')
        : null;
    if (!link || !isPlainClick(event)) return;
    const id = link.closest<HTMLElement>('[data-option]')?.dataset.option;
    const value = link.dataset.value;
    if (id === undefined || value === undefined) return;
    event.preventDefault();
    control.set({ [id]: value });
  });
  reset?.addEventListener('click', () => control.set(defaultChoice(control.options())));
  axes?.addEventListener('scroll', drawMore, { passive: true });
  if (axes && typeof ResizeObserver === 'function') new ResizeObserver(drawMore).observe(axes);

  return {
    control,
    joinEditor(store) {
      const made = mountMakeDefault(main, main.dataset.draft ?? '', control, store);
      offered = made.offered;
      make?.addEventListener('click', () => {
        void made.run();
      });
      // The editor's store speaks on every hover: the row is drawn again only when Make default
      // comes or goes.
      let shown = made.offered();
      store.subscribe(() => {
        const now = made.offered();
        if (now === shown) return;
        shown = now;
        draw();
      });
      draw();
    },
  };
}
