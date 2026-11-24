// Another version in the canvas's cards, read only (spec 4d, goal 5; plan 17, task D): every
// card's frame loads that version's page in place, on its own channel, and its caption names the
// version. The cards are never moved or made again, so going back to now is the same step the
// other way. Who decides which version shows is the timeline (`edit/timeline/`).

import type { Frame } from '../frames.ts';

export type VersionShown = {
  version: number;
  /** An older version, read only; `false` for the version the editor edits. */
  viewing: boolean;
  /** The caption of a card while `viewing`. */
  caption: string;
};

/** The frame address of a card for another version, from the one it has; `undefined`: none. */
export type AddressOf = (current: string, version: number) => string | undefined;

/**
 * Loads `shown.version` in every card of `frames` and marks the canvas (`main[data-viewing]`,
 * `figure[data-viewing]`). Returns the cards that load: each says `ready` when its page is there.
 * A card whose address cannot be read stays as it is.
 */
export function showVersion(
  main: HTMLElement,
  frames: readonly Frame[],
  shown: VersionShown,
  addressOf: AddressOf,
): Frame[] {
  const loading: Frame[] = [];
  for (const frame of frames) {
    const address = addressOf(frame.element.src, shown.version);
    if (address === undefined) continue;
    frame.ready = false;
    frame.element.src = address;
    loading.push(frame);
    const figure = frame.element.closest<HTMLElement>('figure');
    const name = figure?.querySelector<HTMLElement>('.card-name');
    if (!figure || !name) continue;
    if (shown.viewing) {
      // The caption of now is kept once, also when one older version follows another.
      if (figure.dataset.cardNow === undefined) figure.dataset.cardNow = name.textContent ?? '';
      name.textContent = shown.caption;
    } else if (figure.dataset.cardNow !== undefined) {
      name.textContent = figure.dataset.cardNow;
      delete figure.dataset.cardNow;
    }
    figure.toggleAttribute('data-viewing', shown.viewing);
  }
  main.toggleAttribute('data-viewing', shown.viewing);
  return loading;
}
