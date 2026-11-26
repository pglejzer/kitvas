// The rules of the width cards (spec 4c, goal 4; plan 16, task B), pure so they are tested without
// a DOM: how many cards the address asks for, which preset widths stand beside the card of the
// width shown, and the address of a new card's frame. The card counts and the widths beside are
// the server's own (`CARD_COUNTS` and `extraWidths` of `src/studio/views/widths.ts`, ADR 0080).

import { CARD_COUNTS, type CardCount } from '../../../src/studio/views/widths.ts';

export { type CardCount, extraWidths } from '../../../src/studio/views/widths.ts';

/** `?cards=` as the page address writes it: 1, 2 or 3; one card for anything else. */
export function parseCards(text: string | null | undefined): CardCount {
  const asked = Number(text);
  return CARD_COUNTS.find((count) => count === asked) ?? 1;
}

/** The address with `cards` in it; one card names none. Everything else stays. */
export function cardsAddress(href: string, count: CardCount): string {
  const url = new URL(href);
  if (count === 1) url.searchParams.delete('cards');
  else url.searchParams.set('cards', String(count));
  return url.href;
}

/** A channel id from random bytes, in the form the frame reads (`base64url`, 16 to 64 chars). */
export function channelOf(bytes: Uint8Array): string {
  let binary = '';
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

const HASH = /^#kitvas=[A-Za-z0-9_-]{16,64}&studio=([1-9][0-9]{0,4})$/;

/**
 * The frame address of a new card: the address of the card beside it (the same version and frame
 * key), the state the page shows, and the card's own channel. `undefined` when `from` is no
 * framed address, so no card is made from it.
 */
export function cardAddress(
  from: string,
  channel: string,
  state: string | undefined,
): string | undefined {
  let url: URL;
  try {
    url = new URL(from);
  } catch {
    return undefined;
  }
  const port = HASH.exec(url.hash)?.[1];
  if (port === undefined || !/^[A-Za-z0-9_-]{16,64}$/.test(channel)) return undefined;
  if (state) url.searchParams.set('state', state);
  url.hash = `kitvas=${channel}&studio=${port}`;
  return url.href;
}

/** A rectangle on the page, as `getBoundingClientRect` gives it. */
export type PageRect = { left: number; top: number; right: number; bottom: number };

/** The first of `cards` whose rectangle holds `point`; `undefined` over none of them. */
export function cardAt<T>(
  cards: readonly T[],
  rectOf: (card: T) => PageRect,
  point: { x: number; y: number },
): T | undefined {
  return cards.find((card) => {
    const rect = rectOf(card);
    return (
      point.x >= rect.left && point.x <= rect.right && point.y >= rect.top && point.y <= rect.bottom
    );
  });
}
