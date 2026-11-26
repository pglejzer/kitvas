// What the canvas's width pill holds (plan 18f, task 5; spec S4.10), pure so it is tested without a
// DOM. The pill shows the three presets and "More"; More holds every size, the custom width and
// the cards (the presets' rows show only while the pill is narrowed to the width in use). A width that is not a preset shows in the pill as its own number, pressed.

import type { CardCount } from './card-rules.ts';
import { PRESETS, SIZES } from './width.ts';

/** What the canvas shows now: the width of the cards, and how many cards (the Cards choice). */
export type PillView = {
  /** The width shown: a preset, or any other width. */
  width: number;
  cards: CardCount;
  /** "Every width" was the last choice of the cards. */
  every?: boolean;
};

/** What the More menu holds and what its parts show. */
export type PillMenu = {
  /**
   * The sizes the menu lists: every size, the three presets too, so the pill can show only the
   * width in use when the canvas is narrow (`fit/`).
   */
  sizes: number[];
  /** The width shown is not a preset: the pill adds its number, pressed. */
  custom: boolean;
  /** The Cards choice marked in the menu. */
  cards: CardCount | 'every';
};

export function pillMenu(view: PillView): PillMenu {
  return {
    sizes: SIZES.map((size) => size.width),
    custom: !PRESETS.some((one) => one === view.width),
    cards: view.every === true ? 'every' : view.cards,
  };
}
