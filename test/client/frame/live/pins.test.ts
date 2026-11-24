import assert from 'node:assert/strict';
import { test } from 'node:test';
import { PIN, placePin } from '../../../../client/frame/live/pins.ts';

const ORIGIN = { left: 0, top: 0 };
const PAGE = 1280;
const box = { left: 100, top: 50, width: 80, height: 30 };

test('a note pin is centred on the bottom-left corner, away from the live tags at the top', () => {
  assert.equal(PIN, 18);
  assert.deepEqual(placePin(box, ORIGIN, PAGE, PIN), { left: 91, top: 71 });
});

test('a pin stays on the page at its edges, inside the overlay', () => {
  const corner = { left: 0, top: 0, width: 40, height: 0 };
  assert.deepEqual(placePin(corner, ORIGIN, PAGE, PIN), { left: 0, top: 0 });
  const edge = { left: 1275, top: 300, width: 5, height: 40 };
  assert.deepEqual(placePin(edge, { left: 8, top: 8 }, PAGE, 30), {
    left: PAGE - 30 - 8,
    top: 331 - 8,
  });
});
