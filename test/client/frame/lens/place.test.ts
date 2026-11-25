// Where a lens pin goes (plan 19, task 1): above the element's corner, stacked downward, inside the
// page's width, inside an element at the very top; and which pin a click hit.

import assert from 'node:assert/strict';
import { test } from 'node:test';
import type { Rect } from '../../../../client/frame/drag/place.ts';
import {
  CARD_WIDTH,
  PIN_GAP,
  PIN_HEIGHT,
  pinAt,
  placeLensPin,
} from '../../../../client/frame/lens/place.ts';

const PAGE = 1280;
const SIZE = { width: 90, height: PIN_HEIGHT };
const box = { left: 100, top: 80, width: 300, height: 40 };

/** Places pins one after another as the overlay does, each seeing the ones before it. */
function placeAll(element: Rect, sizes: { width: number; height: number }[]): Rect[] {
  const taken: Rect[] = [];
  for (const size of sizes) taken.push({ ...placeLensPin(element, size, PAGE, taken), ...size });
  return taken;
}

test('a pin sits just above its element, at the top-left corner', () => {
  assert.equal(PIN_HEIGHT, 22);
  assert.deepEqual(placeLensPin(box, SIZE, PAGE, []), {
    left: 100,
    top: 80 - PIN_HEIGHT - PIN_GAP,
  });
});

test('the pins of one element stack downward and never sit on each other', () => {
  const placed = placeAll(box, [SIZE, SIZE, { width: 40, height: PIN_HEIGHT }]);
  assert.deepEqual(
    placed.map((rect) => rect.top),
    [56, 56 + PIN_HEIGHT + PIN_GAP, 56 + 2 * (PIN_HEIGHT + PIN_GAP)],
  );
  for (const [index, rect] of placed.entries()) {
    for (const other of placed.slice(index + 1)) {
      assert.ok(other.top >= rect.top + rect.height, 'no overlap');
    }
  }
});

test('a card pin pushes the next one below its whole height', () => {
  const card = { width: CARD_WIDTH, height: 64 };
  const [first, second] = placeAll(box, [card, SIZE]);
  assert.equal(second?.top, (first?.top ?? 0) + 64 + PIN_GAP);
});

test('a pin in other columns is not in the way', () => {
  const far = { left: 600, top: 56, width: 90, height: PIN_HEIGHT };
  assert.deepEqual(placeLensPin(box, SIZE, PAGE, [far]), { left: 100, top: 56 });
});

test('a pin never leaves the page on the right, nor on the left', () => {
  const edge = { left: 1250, top: 300, width: 30, height: 20 };
  assert.equal(placeLensPin(edge, SIZE, PAGE, []).left, PAGE - SIZE.width);
  const wide = { width: 214, height: 60 };
  assert.equal(placeLensPin(edge, wide, PAGE, []).left, PAGE - 214);
  // A page narrower than the pin: it starts at the page's left edge.
  assert.equal(placeLensPin(edge, wide, 200, []).left, 0);
  const left = { left: -40, top: 300, width: 100, height: 20 };
  assert.equal(placeLensPin(left, SIZE, PAGE, []).left, 0);
});

test('an element at the very top gets its pin inside its corner', () => {
  const top = { left: 0, top: 0, width: 1280, height: 64 };
  assert.deepEqual(placeLensPin(top, SIZE, PAGE, []), { left: 0, top: PIN_GAP });
  const near = { left: 20, top: 10, width: 200, height: 40 };
  assert.deepEqual(placeLensPin(near, SIZE, PAGE, []), { left: 20, top: 10 + PIN_GAP });
  // Its second pin still stacks downward from there.
  const [, second] = placeAll(top, [SIZE, SIZE]);
  assert.equal(second?.top, PIN_GAP + PIN_HEIGHT + PIN_GAP);
});

test('a click hits the pin drawn last at its point, or none', () => {
  const boxes = [
    { left: 10, top: 10, width: 100, height: 22 },
    { left: 60, top: 20, width: 100, height: 22 },
  ];
  assert.equal(pinAt(boxes, 20, 15), 0);
  assert.equal(pinAt(boxes, 70, 25), 1, 'the later pin is drawn over the earlier one');
  assert.equal(pinAt(boxes, 159, 41), 1);
  assert.equal(pinAt(boxes, 160, 25), -1, 'the right edge is outside');
  assert.equal(pinAt(boxes, 5, 5), -1);
  assert.equal(pinAt([], 5, 5), -1);
});
