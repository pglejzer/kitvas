import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  CARD_COUNTS,
  cardAddress,
  cardAt,
  cardsAddress,
  channelOf,
  extraWidths,
  nearestPreset,
  parseCards,
} from '../../../../client/studio/canvas/card-rules.ts';
import {
  CARD_COUNTS as SERVER_COUNTS,
  extraWidths as serverExtraWidths,
  nearestPreset as serverNearest,
} from '../../../../src/studio/views/draft-query.ts';

const CHANNEL = 'c'.repeat(22);
const PAGE = 'http://kitvas.localhost:5174/f/key123/shop/v3/html/index.html';
const FRAME = `${PAGE}?state=filled&live=2#kitvas=${'a'.repeat(22)}&studio=5173`;

test('the page and the server choose the same cards for every width', () => {
  assert.deepEqual([...CARD_COUNTS], [...SERVER_COUNTS]);
  for (let width = 320; width <= 2560; width += 7) {
    assert.equal(nearestPreset(width), serverNearest(width), String(width));
    for (const count of CARD_COUNTS) {
      const label = `${count} cards at ${width}`;
      assert.deepEqual(extraWidths(count, width), serverExtraWidths(count, width), label);
    }
  }
});

test('the address asks for 1, 2 or 3 cards; anything else is one', () => {
  assert.equal(parseCards('2'), 2);
  assert.equal(parseCards('3'), 3);
  for (const asked of [null, undefined, '', '0', '4', 'x', '1.5']) {
    assert.equal(parseCards(asked), 1, String(asked));
  }
});

test('the cards go into the address, and one card takes them out', () => {
  const page = 'http://kitvas.localhost:5173/drafts/shop?version=3&state=filled&width=390';
  assert.equal(cardsAddress(page, 3), `${page}&cards=3`);
  assert.equal(cardsAddress(`${page}&cards=3`, 2), `${page}&cards=2`);
  assert.equal(cardsAddress(`${page}&cards=3`, 1), page);
});

test('a channel from random bytes has the form the frame reads', () => {
  const channel = channelOf(new Uint8Array(16).map((_, index) => index * 17));
  assert.match(channel, /^[A-Za-z0-9_-]{16,64}$/);
  assert.equal(channelOf(new Uint8Array(16).fill(255)), `${'_'.repeat(21)}w`);
});

test('a new card frames the same version on its own channel, in the state shown', () => {
  assert.equal(
    cardAddress(FRAME, CHANNEL, 'empty'),
    `${PAGE}?state=empty&live=2#kitvas=${CHANNEL}&studio=5173`,
  );
  const same = cardAddress(FRAME, CHANNEL, undefined) ?? '';
  assert.ok(same.includes('state=filled'));
  assert.ok(same.endsWith(`#kitvas=${CHANNEL}&studio=5173`));
});

test('no card is made from an address without a channel, or with a bad channel', () => {
  assert.equal(cardAddress(PAGE, CHANNEL, ''), undefined);
  assert.equal(cardAddress('not an address', CHANNEL, ''), undefined);
  assert.equal(cardAddress(FRAME, 'short', ''), undefined);
});

test('the card under a point is the first whose rectangle holds it', () => {
  const cards = [
    { name: 'phone', rect: { left: 0, top: 0, right: 100, bottom: 200 } },
    { name: 'tablet', rect: { left: 120, top: 0, right: 300, bottom: 200 } },
  ];
  const at = (x: number, y: number) => cardAt(cards, (card) => card.rect, { x, y })?.name;
  assert.equal(at(50, 50), 'phone');
  assert.equal(at(200, 199), 'tablet');
  assert.equal(at(110, 50), undefined, 'between the cards');
  assert.equal(at(50, 250), undefined, 'below them');
});
