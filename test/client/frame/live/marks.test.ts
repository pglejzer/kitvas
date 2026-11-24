import assert from 'node:assert/strict';
import { test } from 'node:test';
import { LIVE_TAG, placeTag } from '../../../../client/frame/live/marks.ts';

const ORIGIN = { left: 0, top: 0 };
const PAGE = 1280;
const box = { left: 100, top: 50, width: 80, height: 30 };

test('a live tag is centred on the top-left corner, away from the full check dots', () => {
  assert.equal(LIVE_TAG, 20);
  assert.deepEqual(placeTag(box, ORIGIN, PAGE, LIVE_TAG), { left: 90, top: 40 });
});

test('positions are inside the overlay: its own corner is taken off', () => {
  assert.deepEqual(placeTag(box, { left: 8, top: 8 }, PAGE, LIVE_TAG), { left: 82, top: 32 });
});

test('a tag stays on the page at its edges', () => {
  const corner = { left: 0, top: 0, width: 40, height: 40 };
  assert.deepEqual(placeTag(corner, ORIGIN, PAGE, LIVE_TAG), { left: 0, top: 0 });
  const edge = { left: 1275, top: 300, width: 5, height: 40 };
  assert.deepEqual(placeTag(edge, ORIGIN, PAGE, 32), { left: PAGE - 32, top: 290 });
});
