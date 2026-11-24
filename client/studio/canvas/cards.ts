// The width cards on the canvas (spec 4c, goal 4; plan 16, task B): the dock's Cards control shows
// one card (the width shown), two (that and the next preset) or all three presets side by side,
// and "Every width" shows all three zoomed to the selection. The card of the width shown is the
// server's `current` frame and follows the dock; the others are frames of the same version at a
// preset each, on channels of their own. Cards are added and removed, never moved, so no frame
// loads again: the order on screen is CSS `order`. The rules are in `card-rules.ts`.

import { isPlainClick } from '../clicks.ts';
import { text } from '../edit/texts.ts';
import type { Frame } from '../frames.ts';
import type { CardList } from './card-list.ts';
import {
  type CardCount,
  cardAddress,
  cardsAddress,
  channelOf,
  extraWidths,
  parseCards,
} from './card-rules.ts';
import { frameHeight, readShown, shownWidth, sizeLabel } from './width.ts';

export type CardsDeps = {
  main: HTMLElement;
  /** The frame of the width shown (`data-frame="current"`). */
  lead: Frame;
  list: CardList;
  /** "Every width" was chosen: the canvas zooms to the selection in every card. */
  onEvery(): void;
};

export type Cards = {
  /** The frames of the cards beside the width shown. */
  extras(): Frame[];
  /** The width shown settled: the cards beside it follow it. */
  sync(): void;
  /** The card of the width shown is `width` wide now, also while its handle is dragged. */
  leadWidth(width: number): void;
  /** The page took the dock's links from the server again: they keep the cards. */
  links(): void;
};

type Extra = { width: number; figure: HTMLElement; frame: Frame };

const COUNT_LINK = 'a[data-dock-cards]';
/** The dock's other links keep the cards shown. */
const KEEP_LINKS = 'a[data-dock-width], a.opt[data-state]';

function replaceAddress(href: string): void {
  try {
    history.replaceState(history.state, '', href);
  } catch {
    // A browser that limits how often the address changes: the cards are right all the same.
  }
}

/** A channel for a new card: it only tells the frames of this page apart, nothing secret. */
function newChannel(): string {
  const bytes = new Uint8Array(16);
  crypto.getRandomValues(bytes);
  return channelOf(bytes);
}

function sizeFrame(element: HTMLIFrameElement, width: number): void {
  element.style.width = `${width}px`;
  element.style.height = `${frameHeight(width)}px`;
  element.width = String(width);
}

/** The caption's "Editing" mark, made once per card and shown by the skin on the edit card. */
function markOf(figure: HTMLElement): void {
  const caption = figure.querySelector('.card-caption');
  if (!caption || caption.querySelector('[data-card-mark]')) return;
  const mark = document.createElement('span');
  mark.className = 'card-mark';
  mark.dataset.cardMark = '';
  mark.textContent = text('canvas.editing');
  caption.querySelector('.card-name')?.after(mark);
}

export function mountCards(deps: CardsDeps): Cards {
  const { main, lead, list } = deps;
  const world = main.querySelector<HTMLElement>('[data-canvas="world"]');
  const control = main.querySelector<HTMLElement>('[data-dock="cards"]');
  const address = new URL(location.href).searchParams;
  // Compare (and a rework's original) has a card per version instead.
  const off = control === null || control.hasAttribute('data-off') || address.has('compare');
  const on = world !== null && !off;
  const extras = new Map<number, Extra>();
  const leadFigure = lead.element.closest<HTMLElement>('figure');
  let count: CardCount = on ? parseCards(address.get('cards')) : 1;

  const shown = (): number => shownWidth(readShown(main.dataset.width, main.dataset.view));

  function drop(extra: Extra): void {
    extra.figure.remove();
    extras.delete(extra.width);
    list.remove(extra.frame);
  }

  /** Cards the server already drew for `?cards=`: the page takes them as they are. */
  function adopt(): void {
    if (!world) return;
    for (const figure of world.querySelectorAll<HTMLElement>('figure[data-card="width"]')) {
      const element = figure.querySelector<HTMLIFrameElement>('iframe[data-frame="width"]');
      const width = Number(figure.dataset.cardWidth);
      const channel = element?.dataset.channel;
      if (!on || !element || !channel || extras.has(width)) {
        figure.remove();
        continue;
      }
      const frame: Frame = { role: 'current', channel, element, ready: false };
      sizeFrame(element, width);
      extras.set(width, { width, figure, frame });
      list.add(frame);
    }
  }

  /** The same markup as the server's (`widthCard` in `src/studio/pages/draft/draft-stage.ts`). */
  function create(width: number): void {
    if (!world) return;
    const channel = newChannel();
    const src = cardAddress(lead.element.src, channel, main.dataset.state);
    if (src === undefined) return;
    const figure = document.createElement('figure');
    figure.className = 'canvas-card pane';
    figure.dataset.card = 'width';
    figure.dataset.cardWidth = String(width);
    const caption = document.createElement('figcaption');
    caption.className = 'card-caption';
    const name = document.createElement('span');
    name.className = 'card-name';
    name.textContent = leadFigure?.querySelector('.card-name')?.textContent ?? '';
    const size = document.createElement('span');
    size.className = 'card-size';
    size.dataset.cardSize = '';
    size.textContent = sizeLabel(width);
    caption.append(name, size);
    const box = document.createElement('div');
    box.className = 'frame-box';
    const element = document.createElement('iframe');
    // The sandbox is on before the frame is in the page, so it never loads without it.
    element.setAttribute('sandbox', 'allow-scripts');
    element.setAttribute('referrerpolicy', 'no-referrer');
    element.title = text('canvas.cardTitle', { title: lead.element.title, width });
    element.dataset.frame = 'width';
    element.dataset.channel = channel;
    sizeFrame(element, width);
    element.src = src;
    box.append(element);
    figure.append(caption, box);
    const frame: Frame = { role: 'current', channel, element, ready: false };
    extras.set(width, { width, figure, frame });
    // Appended after the others: no card already there moves in the DOM.
    world.append(figure);
    list.add(frame);
  }

  /** Narrow to wide on screen, with CSS `order`; one card keeps its place as the server drew it. */
  function arrange(): void {
    const many = extras.size > 0;
    if (leadFigure) leadFigure.style.order = many ? String(shown()) : '';
    for (const extra of extras.values()) {
      extra.figure.style.order = String(extra.width);
      const size = extra.figure.querySelector<HTMLElement>('[data-card-size]');
      if (size) size.textContent = sizeLabel(extra.width);
    }
  }

  /** The edit card's caption is marked while there is more than one card. */
  function markEdit(): void {
    const many = extras.size > 0;
    const edit = list.edit();
    const figures: [HTMLElement | null, Frame][] = [
      [leadFigure, lead],
      ...[...extras.values()].map((extra): [HTMLElement, Frame] => [extra.figure, extra.frame]),
    ];
    for (const [figure, frame] of figures) {
      if (!figure) continue;
      markOf(figure);
      figure.toggleAttribute('data-editing', many && frame === edit);
    }
  }

  function links(): void {
    if (!control) return;
    for (const link of control.querySelectorAll<HTMLAnchorElement>(COUNT_LINK)) {
      const asked = parseCards(link.dataset.dockCards);
      if (asked === count) link.setAttribute('aria-current', 'true');
      else link.removeAttribute('aria-current');
      try {
        link.href = cardsAddress(location.href, asked);
      } catch {
        // An address the browser cannot read stays as the server wrote it.
      }
    }
    if (!on) return;
    for (const link of main.querySelectorAll<HTMLAnchorElement>(KEEP_LINKS)) {
      if (!link.hasAttribute('href')) continue;
      try {
        link.href = cardsAddress(link.href, count);
      } catch {
        // As above.
      }
    }
    // The number field's form loads the view without the script: it names the cards too.
    const form = main.querySelector<HTMLFormElement>('form[data-dock="view"]');
    let field = form?.querySelector<HTMLInputElement>('input[name="cards"]') ?? null;
    if (count === 1) field?.remove();
    else if (form) {
      if (!field) {
        field = document.createElement('input');
        field.type = 'hidden';
        field.name = 'cards';
        form.prepend(field);
      }
      field.value = String(count);
    }
  }

  function sync(): void {
    const wanted = on ? extraWidths(count, shown()) : [];
    for (const extra of [...extras.values()]) {
      if (!wanted.some((width) => width === extra.width)) drop(extra);
    }
    for (const width of wanted) if (!extras.has(width)) create(width);
    arrange();
    markEdit();
    links();
  }

  function setCount(next: CardCount): void {
    if (!on) return;
    count = next;
    replaceAddress(cardsAddress(location.href, next));
    sync();
  }

  control?.addEventListener('click', (event) => {
    if (!isPlainClick(event) || !(event.target instanceof Element)) return;
    const link = event.target.closest<HTMLAnchorElement>(COUNT_LINK);
    if (!link || !on) return;
    event.preventDefault();
    setCount(parseCards(link.dataset.dockCards));
  });
  const every = control?.querySelector<HTMLButtonElement>('button[data-dock-every]');
  if (every && on) {
    every.hidden = false;
    every.addEventListener('click', () => {
      setCount(3);
      deps.onEvery();
    });
  }
  list.onChange(markEdit);

  adopt();
  sync();
  return {
    extras: () => [...extras.values()].map((extra) => extra.frame),
    sync,
    leadWidth(width) {
      if (leadFigure && extras.size > 0) leadFigure.style.order = String(width);
      list.changed();
    },
    links,
  };
}
