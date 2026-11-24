// The cards of the canvas as the editor sees them (spec 4c, goal 4; plan 16, task B): every card's
// frame, and the edit card, the one the person last worked in, whose width the edits are for. The
// draft page makes the list before the editor starts and adds and removes cards in it; the
// editor's bridge finds it by the card of the width shown (`cardsOf`). Pure: no DOM.

import type { Frame } from '../frames.ts';

export type CardSource = {
  /** Every card's frame: the edit card first, then the others in the order they came. */
  frames(): Frame[];
  /** The card the person last worked in: the card of the width shown until another is used. */
  edit(): Frame;
  /** Makes `frame` the edit card; a frame that is no card changes nothing. */
  setEdit(frame: Frame): void;
  /** The card whose messages carry `channel`. */
  byChannel(channel: string): Frame | undefined;
  /** A card's width in CSS pixels, as its frame is sized now. */
  widthOf(frame: Frame): number;
  /** Hears a card come or go, another edit card, or a width change. Returns the way to stop. */
  onChange(listener: () => void): () => void;
};

export type CardList = CardSource & {
  add(frame: Frame): void;
  remove(frame: Frame): void;
  /** A card's width changed: the listeners hear it. */
  changed(): void;
};

/** A frame's width as the page sized it: its `width` attribute, which the width control keeps. */
export function frameWidth(frame: Frame): number {
  const width = Number(frame.element.width);
  return Number.isFinite(width) && width > 0 ? width : 0;
}

/** The lists the draft page made, by the frame of the width shown. */
const lists = new WeakMap<Frame, CardList>();

/** A list with `lead`, the card of the width shown, which is never removed. */
export function createCardList(
  lead: Frame,
  widthOf: (frame: Frame) => number = frameWidth,
): CardList {
  const cards: Frame[] = [lead];
  const listeners = new Set<() => void>();
  let edit = lead;
  const tell = (): void => {
    for (const listener of [...listeners]) listener();
  };
  const list: CardList = {
    frames: () => [edit, ...cards.filter((card) => card !== edit)],
    edit: () => edit,
    setEdit(frame) {
      if (frame === edit || !cards.includes(frame)) return;
      edit = frame;
      tell();
    },
    byChannel: (channel) => cards.find((card) => card.channel === channel),
    widthOf,
    onChange(listener) {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
    add(frame) {
      if (cards.includes(frame)) return;
      cards.push(frame);
      tell();
    },
    remove(frame) {
      if (frame === lead || !cards.includes(frame)) return;
      cards.splice(cards.indexOf(frame), 1);
      // A card that goes takes the edits back to the card of the width shown.
      if (edit === frame) edit = lead;
      tell();
    },
    changed: tell,
  };
  lists.set(lead, list);
  return list;
}

/** The list the draft page made for `lead`; a list of that one frame when it made none. */
export function cardsOf(lead: Frame): CardSource {
  return lists.get(lead) ?? createCardList(lead);
}
