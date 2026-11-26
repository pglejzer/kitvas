import assert from 'node:assert/strict';
import { test } from 'node:test';
import type { Box, Point } from '../../../../client/frame/drag/slots.ts';
import {
  boxOf,
  contains,
  pageRect,
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

/** The places in `items` a rectangle takes. */
const places = (items: readonly RectItem[], rect: Box, limit = 200): number[] =>
  takenBy(items, rect, limit).taken;
/** The ids of what a rectangle takes of `items`, one for each element taken. */
const ids = (items: readonly RectItem[], rect: Box, limit = 200): (string | null)[] =>
  places(items, rect, limit).map((index) => items[index]?.id ?? null);

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

test('an element that lies fully inside the rectangle is taken whole, nothing inside it', () => {
  // Around the card: the card, not its heading and text, and not the page around it.
  assert.deepEqual(ids(PAGE, box(5, 55, 210, 210)), ['A:main/Card']);
  // Around the card and the aside: both, in document order.
  assert.deepEqual(ids(PAGE, box(5, 55, 390, 210)), ['A:main/Card', 'A:main/aside']);
  // Around everything: only the outermost one.
  assert.deepEqual(ids(PAGE, box(-5, -5, 500, 500)), ['A:main']);
});

test('an element covered only in part is not taken: the rectangle goes into it', () => {
  // Across the heading and the text, inside the card: the two, never the card.
  assert.deepEqual(ids(PAGE, box(30, 80, 100, 50)), ['A:main/Card/Heading', 'A:main/Card/Text']);
  // From the card's padding half over the heading: the heading.
  assert.deepEqual(ids(PAGE, box(15, 65, 100, 20)), ['A:main/Card/Heading']);
  // From the middle of the card to the middle of the aside: what it reaches in the card, and the
  // aside, which has nothing inside to go into.
  assert.deepEqual(ids(PAGE, box(150, 100, 100, 50)), ['A:main/Card/Text', 'A:main/aside']);
  // A corner of the card where none of its children is: nothing.
  assert.deepEqual(ids(PAGE, box(190, 240, 25, 60)), []);
  // In the room between the card and the aside: nothing either.
  assert.deepEqual(ids(PAGE, box(211, 60, 8, 50)), []);
});

test('an element with no children is taken by a rectangle that only touches it', () => {
  // Inside the heading alone, which holds the whole rectangle.
  assert.deepEqual(ids(PAGE, box(30, 75, 50, 10)), ['A:main/Card/Heading']);
  // Over an end of the page title.
  assert.deepEqual(ids(PAGE, box(380, 0, 30, 30)), ['A:main/h1']);
});

test('a container that holds the whole rectangle is never taken for it', () => {
  // From the page's own margin, left of the card, to the middle of the text: the page holds the
  // whole rectangle, yet only the text is taken.
  assert.deepEqual(ids(PAGE, box(0, 115, 100, 20)), ['A:main/Card/Text']);
  // The same from far outside the page.
  assert.deepEqual(ids(PAGE, box(-300, 115, 400, 20)), ['A:main/Card/Text']);
  // In the page's margin alone: nothing, not the page.
  assert.deepEqual(ids(PAGE, box(0, 300, 100, 50)), []);
});

/** The first card and its four rows, then the second card and its two: copies of two ids. */
const CARD = 'A:grid/Card';
const ROW = 'A:grid/Card/Row';
const GRID: RectItem[] = [
  { id: 'A:grid', box: box(0, 0, 600, 400), parent: -1 },
  { id: CARD, box: box(10, 10, 280, 300), parent: 0 },
  { id: ROW, box: box(20, 60, 260, 30), parent: 1 },
  { id: ROW, box: box(20, 100, 260, 30), parent: 1 },
  { id: ROW, box: box(20, 140, 260, 30), parent: 1 },
  { id: ROW, box: box(20, 180, 260, 30), parent: 1 },
  { id: CARD, box: box(310, 10, 280, 300), parent: 0 },
  { id: ROW, box: box(320, 60, 260, 30), parent: 6 },
  { id: ROW, box: box(320, 100, 260, 30), parent: 6 },
];

test('every rendered copy is an element of its own: a rectangle takes the copies it covers', () => {
  // Around the two cards: the two cards.
  assert.deepEqual(places(GRID, box(5, 5, 590, 310)), [1, 6]);
  // Across three rows of the first card: those three rows, of the six that carry the id.
  assert.deepEqual(places(GRID, box(100, 70, 100, 100)), [2, 3, 4]);
  assert.deepEqual(ids(GRID, box(100, 70, 100, 100)), [ROW, ROW, ROW]);
  // From one card over into the other: the row it reaches in each.
  assert.deepEqual(places(GRID, box(250, 105, 100, 20)), [3, 8]);
  // Around the first card and over a part of the second: the card, and the rows it reaches.
  assert.deepEqual(places(GRID, box(5, 5, 400, 310)), [1, 7, 8]);
});

test('the outline gets the box of every element taken', () => {
  const taken = takenBy(PAGE, box(150, 100, 100, 50), 200);
  assert.deepEqual(taken.boxes, [box(20, 110, 180, 30), box(220, 60, 170, 200)]);
  assert.deepEqual(takenBy(GRID, box(100, 70, 100, 100), 200).boxes, [
    box(20, 60, 260, 30),
    box(20, 100, 260, 30),
    box(20, 140, 260, 30),
  ]);
  assert.deepEqual(takenBy(PAGE, box(211, 60, 8, 50), 200), { taken: [], boxes: [] });
});

test('an element without an id is never taken, and never more than the limit', () => {
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
  assert.deepEqual(places(list, rect), [1, 2, 4, 5]);
  assert.equal(takenBy(list, rect, 200).boxes.length, 4);
  // The first ones in document order, and as many boxes.
  assert.deepEqual(takenBy(list, rect, 2), {
    taken: [1, 2],
    boxes: [box(0, 0, 100, 20), box(0, 20, 100, 20)],
  });
});

test('a hidden element is not taken, and hides nothing of what the rectangle touches', () => {
  const page: RectItem[] = [
    { id: 'A:main', box: box(0, 0, 400, 400), parent: -1 },
    { id: 'A:main/gone', box: box(0, 0, 0, 0), parent: 0 },
    { id: 'A:main/p', box: box(10, 10, 100, 20), parent: 0 },
  ];
  assert.deepEqual(ids(page, box(5, 5, 50, 50)), ['A:main/p']);
  // A container whose only children are hidden has nothing to go into: it is taken as a leaf.
  const empty: RectItem[] = [
    { id: 'A:main', box: box(0, 0, 400, 400), parent: -1 },
    { id: 'A:main/Stack', box: box(10, 10, 200, 100), parent: 0 },
    { id: 'A:main/Stack/gone', box: box(0, 0, 0, 0), parent: 1 },
  ];
  assert.deepEqual(ids(empty, box(50, 50, 20, 20)), ['A:main/Stack']);
});

/** An element that answers only what the readers ask of it. */
const elementAt = (left: number, top: number, width: number, height: number): Element =>
  ({
    getBoundingClientRect: () => ({ left, top, width, height, right: 0, bottom: 0, x: 0, y: 0 }),
  }) as unknown as Element;

test('boxOf reads the viewport box, pageRect adds the scroll to the corner only', () => {
  const element = elementAt(10, 20, 30, 40);
  assert.deepEqual(boxOf(element), box(10, 20, 30, 40));
  const had = { x: Object.getOwnPropertyDescriptor(globalThis, 'scrollX') };
  const hadY = Object.getOwnPropertyDescriptor(globalThis, 'scrollY');
  Object.defineProperty(globalThis, 'scrollX', { value: 5, configurable: true });
  Object.defineProperty(globalThis, 'scrollY', { value: 100, configurable: true });
  try {
    assert.deepEqual(pageRect(element), box(15, 120, 30, 40));
    assert.deepEqual(boxOf(element), box(10, 20, 30, 40));
  } finally {
    if (had.x) Object.defineProperty(globalThis, 'scrollX', had.x);
    else Reflect.deleteProperty(globalThis, 'scrollX');
    if (hadY) Object.defineProperty(globalThis, 'scrollY', hadY);
    else Reflect.deleteProperty(globalThis, 'scrollY');
  }
});
