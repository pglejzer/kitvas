// Where the tools on the selection stand (redesign spec, goal 12; plan 19, task 4; review focus 3):
// above the element, below it with no room above, hidden when neither fits or nothing of it shows;
// never outside the stage and never over a pill or the ask bar.

import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  clipBox,
  EDGE,
  GAP,
  type PageBox,
  placeBar,
} from '../../../../../client/studio/edit/seltools/place.ts';

const VIEW = { width: 1000, height: 600 };
const BAR = { width: 220, height: 32 };
/** The lens pill at the top left, the state and width pills at the top right, the ask bar. */
const LENS: PageBox = { x: 12, y: 12, width: 180, height: 32 };
const WIDTH: PageBox = { x: 600, y: 12, width: 388, height: 32 };
const ASK: PageBox = { x: 265, y: 546, width: 470, height: 42 };

const box = (x: number, y: number, width: number, height: number): PageBox => ({
  x,
  y,
  width,
  height,
});

const covers = (at: { left: number; top: number }, other: PageBox): boolean =>
  at.left < other.x + other.width &&
  other.x < at.left + BAR.width &&
  at.top < other.y + other.height &&
  other.y < at.top + BAR.height;

test('centred 8 px above the element', () => {
  const at = placeBar(box(400, 200, 200, 40), BAR, VIEW, []);
  assert.deepEqual(at, { left: 390, top: 200 - GAP - BAR.height });
});

test('an element at the top edge gets the tools below it', () => {
  assert.deepEqual(placeBar(box(400, 10, 200, 40), BAR, VIEW, []), { left: 390, top: 58 });
});

test('an element taller than the stage hides the tools: there is no room above or below', () => {
  assert.equal(placeBar(box(300, -100, 400, 900), BAR, VIEW, []), null);
});

test('an element scrolled out, or none, hides the tools', () => {
  assert.equal(placeBar(box(300, -300, 200, 100), BAR, VIEW, []), null);
  assert.equal(placeBar(box(1200, 100, 100, 40), BAR, VIEW, []), null);
  assert.equal(placeBar(box(300, 600, 200, 100), BAR, VIEW, []), null);
  assert.equal(placeBar(null, BAR, VIEW, []), null);
});

test('an element cut by the stage is placed by what shows of it', () => {
  // Its top is scrolled out: nothing to stand above, so below what shows.
  assert.deepEqual(placeBar(box(400, -50, 200, 150), BAR, VIEW, []), { left: 390, top: 108 });
});

test('the tools never leave the stage at its sides', () => {
  const right = placeBar(box(950, 300, 40, 20), BAR, VIEW, []);
  assert.deepEqual(right, { left: VIEW.width - EDGE - BAR.width, top: 260 });
  const left = placeBar(box(0, 300, 40, 20), BAR, VIEW, []);
  assert.deepEqual(left, { left: EDGE, top: 260 });
});

test('a stage too small for the tools hides them', () => {
  assert.equal(placeBar(box(10, 40, 20, 20), BAR, { width: 200, height: 600 }, []), null);
});

test('under the lens pill the tools go below the element', () => {
  const at = placeBar(box(20, 70, 120, 40), BAR, VIEW, [LENS, WIDTH, ASK]);
  assert.deepEqual(at, { left: EDGE, top: 118 });
  assert.ok(at && !covers(at, LENS));
});

test('a wide element under the lens pill keeps the tools above it, beside the pill', () => {
  const at = placeBar(box(20, 70, 500, 40), BAR, VIEW, [LENS, WIDTH, ASK]);
  assert.deepEqual(at, { left: LENS.x + LENS.width + EDGE, top: 30 });
  assert.ok(at && !covers(at, LENS));
});

test('under the width pill the tools go below the element', () => {
  const at = placeBar(box(700, 60, 200, 40), BAR, VIEW, [LENS, WIDTH, ASK]);
  assert.deepEqual(at, { left: 690, top: 108 });
  assert.ok(at && !covers(at, WIDTH));
});

test('the tools never cover the ask bar: with no room above either, they hide', () => {
  // Above is out of the stage; below would sit on the ask bar.
  assert.equal(placeBar(box(400, 20, 200, 480), BAR, VIEW, [LENS, WIDTH, ASK]), null);
  // With room above, above it is.
  const at = placeBar(box(400, 470, 200, 60), BAR, VIEW, [LENS, WIDTH, ASK]);
  assert.deepEqual(at, { left: 390, top: 430 });
  assert.ok(at && !covers(at, ASK));
});

test('a hidden pill (no size) keeps nothing out', () => {
  const at = placeBar(box(20, 70, 120, 40), BAR, VIEW, [box(12, 12, 0, 0)]);
  assert.deepEqual(at, { left: EDGE, top: 30 });
});

test('what shows of a box: an empty element inside counts, one cut flat at the edge does not', () => {
  const view = box(0, 0, 100, 100);
  assert.deepEqual(clipBox(box(10, 10, 0, 20), view), box(10, 10, 0, 20));
  assert.deepEqual(clipBox(box(-10, 50, 30, 80), view), box(0, 50, 20, 50));
  assert.equal(clipBox(box(-30, 10, 30, 20), view), null);
  assert.equal(clipBox(box(200, 10, 30, 20), view), null);
});
