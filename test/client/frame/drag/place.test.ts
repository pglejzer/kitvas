import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  DOT,
  type Point,
  placeDots,
  placeRing,
  type Rect,
} from '../../../../client/frame/drag/place.ts';

const rect = (left: number, top: number, width: number, height: number): Rect => ({
  left,
  top,
  width,
  height,
});
const ORIGIN = { left: 0, top: 0 };
const HOST = { left: 8, top: 8 };
const PAGE = 1280;

const dots = (element: Rect, widths: number[], host: Point = ORIGIN): Point[] =>
  placeDots({ element, widths, host, pageWidth: PAGE });

test('a dot is 22 px and sits centred on the top-right corner of its element', () => {
  assert.equal(DOT, 22);
  const [point] = dots(rect(100, 50, 80, 30), [DOT]);
  assert.deepEqual(point, { left: 169, top: 39 });
  assert.equal((point?.left ?? 0) + DOT / 2, 180);
  assert.equal((point?.top ?? 0) + DOT / 2, 50);
});

test('positions are inside the overlay: its own corner is taken off', () => {
  assert.deepEqual(dots(rect(100, 50, 80, 30), [DOT], HOST), [{ left: 161, top: 31 }]);
});

test('more dots on one element read left to right and end at the corner', () => {
  assert.deepEqual(dots(rect(100, 50, 80, 30), [22, 30]), [
    { left: 137, top: 39 },
    { left: 161, top: 39 },
  ]);
});

test('dots stay inside the page width and below its top', () => {
  assert.deepEqual(dots(rect(1200, 0, 80, 40), [DOT]), [{ left: 1258, top: 0 }]);
  const lefts = dots(rect(0, 100, 10, 10), [22, 22, 22]).map((point) => point.left);
  assert.deepEqual(lefts, [0, 24, 48]);
  assert.deepEqual(dots(rect(0, 0, 1, 1), []), []);
});

test('an outline box is the element box inside the overlay', () => {
  assert.deepEqual(placeRing(rect(100, 50, 80, 30), ORIGIN, PAGE), rect(100, 50, 80, 30));
  assert.deepEqual(placeRing(rect(100, 50, 80, 30), HOST, PAGE), rect(92, 42, 80, 30));
});

test('an outline box is cut to the page and left out when nothing of it is there', () => {
  assert.deepEqual(placeRing(rect(1200, 50, 200, 30), ORIGIN, PAGE), rect(1200, 50, 80, 30));
  assert.deepEqual(placeRing(rect(-20, -10, 100, 50), ORIGIN, PAGE), rect(0, 0, 80, 40));
  assert.equal(placeRing(rect(1300, 0, 50, 50), ORIGIN, PAGE), undefined);
  assert.equal(placeRing(rect(100, 50, 80, 0), ORIGIN, PAGE), undefined);
});
