import assert from 'node:assert/strict';
import { test } from 'node:test';
import type { Box, Point } from '../../../../client/frame/drag/slots.ts';
import {
  contains,
  type RectItem,
  rectOf,
  takenBy,
  touches,
} from '../../../../client/frame/page/rect.ts';

const at = (x: number, y: number): Point => ({ x, y });
const box = (left: number, top: number, width: number, height: number): Box => ({
  left,
  top,
  width,
  height,
});

/** The ids a rectangle takes of `items`. */
const ids = (items: readonly RectItem[], rect: Box, limit = 200): string[] =>
  takenBy(items, rect, limit).ids;

test('the rectangle is the box between two corners, whichever way the pointer went', () => {
  assert.deepEqual(rectOf(at(10, 20), at(50, 80)), box(10, 20, 40, 60));
  assert.deepEqual(rectOf(at(50, 80), at(10, 20)), box(10, 20, 40, 60));
  assert.deepEqual(rectOf(at(50, 20), at(10, 80)), box(10, 20, 40, 60));
});

test('a box is inside only when all of it is; a box without a size never is', () => {
  const rect = box(0, 0, 100, 100);
  assert.equal(contains(rect, box(0, 0, 100, 100)), true);
  assert.equal(contains(rect, box(10, 10, 20, 20)), true);
  assert.equal(contains(rect, box(90, 10, 20, 20)), false);
  assert.equal(contains(rect, box(-1, 10, 20, 20)), false);
  assert.equal(contains(rect, box(10, 90, 20, 20)), false);
  assert.equal(contains(rect, box(10, 10, 0, 0)), false);
  // A line of text may have no width yet a height.
  assert.equal(contains(rect, box(10, 10, 0, 12)), true);
});

test('a rectangle touches a box it shares room with, not one whose edge it only meets', () => {
  const card = box(10, 60, 200, 200);
  assert.equal(touches(box(0, 0, 50, 100), card), true);
  assert.equal(touches(box(100, 100, 20, 20), card), true);
  assert.equal(touches(box(-50, -50, 500, 500), card), true);
  // To the right of it, and above it.
  assert.equal(touches(box(215, 60, 50, 50), card), false);
  assert.equal(touches(box(10, 0, 50, 40), card), false);
  // Edge on edge.
  assert.equal(touches(box(210, 60, 50, 50), card), false);
  assert.equal(touches(box(10, 10, 50, 50), card), false);
  // A rectangle drawn as a straight line across it still touches.
  assert.equal(touches(box(100, 0, 0, 400), card), true);
  // A hidden element has no size and is touched by nothing.
  assert.equal(touches(box(0, 0, 400, 400), box(50, 50, 0, 0)), false);
});

/** main > (h1, card > (heading, text), aside) */
const PAGE: RectItem[] = [
  { id: 'A:main', box: box(0, 0, 400, 400), parent: -1 },
  { id: 'A:main/h1', box: box(10, 10, 380, 40), parent: 0 },
  { id: 'A:main/Card', box: box(10, 60, 200, 200), parent: 0 },
  { id: 'A:main/Card/Heading', box: box(20, 70, 180, 30), parent: 2 },
  { id: 'A:main/Card/Text', box: box(20, 110, 180, 30), parent: 2 },
  { id: 'A:main/aside', box: box(220, 60, 170, 200), parent: 0 },
];

test('the rectangle takes the outermost elements it touches that do not hold it whole', () => {
  // Around the card: the card, not its heading and text, and not the page around it.
  assert.deepEqual(ids(PAGE, box(5, 55, 210, 210)), ['A:main/Card']);
  // Around the card and the aside: both, in document order.
  assert.deepEqual(ids(PAGE, box(5, 55, 390, 210)), ['A:main/Card', 'A:main/aside']);
  // Around everything: only the outermost one.
  assert.deepEqual(ids(PAGE, box(-5, -5, 500, 500)), ['A:main']);
});

test('a rectangle across two cards takes the two cards: touching is enough', () => {
  // From the middle of the card to the middle of the aside, over neither as a whole.
  assert.deepEqual(ids(PAGE, box(150, 100, 100, 50)), ['A:main/Card', 'A:main/aside']);
  // A corner of the card only.
  assert.deepEqual(ids(PAGE, box(190, 240, 25, 60)), ['A:main/Card']);
  // In the room between them it touches neither, and the page holds it whole.
  assert.deepEqual(ids(PAGE, box(211, 60, 8, 50)), []);
});

test('inside an element that holds the rectangle whole, its children are taken', () => {
  // Inside the card, across the heading and the text: the two rows, never the card.
  assert.deepEqual(ids(PAGE, box(30, 80, 100, 50)), ['A:main/Card/Heading', 'A:main/Card/Text']);
  // Half over the heading, from the card's padding: the heading.
  assert.deepEqual(ids(PAGE, box(15, 65, 100, 20)), ['A:main/Card/Heading']);
  // Inside the heading alone: it holds the rectangle whole, and nothing in it is touched.
  assert.deepEqual(ids(PAGE, box(30, 75, 50, 10)), []);
});

test('the outline gets the box of every element taken', () => {
  const taken = takenBy(PAGE, box(150, 100, 100, 50), 200);
  assert.deepEqual(taken.boxes, [box(10, 60, 200, 200), box(220, 60, 170, 200)]);
  assert.deepEqual(takenBy(PAGE, box(30, 75, 50, 10), 200), { ids: [], boxes: [] });
});

test('an id is taken once, an element without an id never, and never more than the limit', () => {
  const list: RectItem[] = [
    { id: 'A:ul', box: box(0, 0, 100, 400), parent: -1 },
    { id: 'A:ul/$/li', box: box(0, 0, 100, 20), parent: 0 },
    { id: 'A:ul/$/li', box: box(0, 20, 100, 20), parent: 0 },
    // An odd id, or a locked element: never taken, and what is inside it is looked at on its own.
    { id: null, box: box(0, 40, 100, 40), parent: 0 },
    { id: 'A:ul/b', box: box(0, 40, 50, 20), parent: 3 },
    { id: 'A:ul/c', box: box(0, 60, 50, 20), parent: 3 },
  ];
  const rect = box(0, 0, 100, 90);
  assert.deepEqual(ids(list, rect), ['A:ul/$/li', 'A:ul/b', 'A:ul/c']);
  // Both copies of the list item are outlined, though their id is taken once.
  assert.equal(takenBy(list, rect, 200).boxes.length, 4);
  assert.deepEqual(ids(list, rect, 2), ['A:ul/$/li', 'A:ul/b']);
  assert.equal(takenBy(list, rect, 2).boxes.length, 3);
});

test('a hidden element is not taken, and hides nothing of what the rectangle touches', () => {
  const page: RectItem[] = [
    { id: 'A:main', box: box(0, 0, 400, 400), parent: -1 },
    { id: 'A:main/gone', box: box(0, 0, 0, 0), parent: 0 },
    { id: 'A:main/p', box: box(10, 10, 100, 20), parent: 0 },
  ];
  assert.deepEqual(ids(page, box(5, 5, 50, 50)), ['A:main/p']);
});
