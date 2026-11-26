import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  allowedSpots,
  gapSpots,
  hitOf,
  SMALL,
  type Spot,
  showsGap,
  spotAt,
  spotsFor,
} from '../../../../client/frame/drag/handles/spots.ts';
import type { Box } from '../../../../client/frame/drag/slots/slots.ts';

const box = (left: number, top: number, width: number, height: number): Box => ({
  left,
  top,
  width,
  height,
});
const even = { top: 16, right: 16, bottom: 16, left: 16 };
/** The handles of a block element without children, at a canvas scale. */
const plain = (of: Box, padding = even, scale = 1): Spot[] =>
  spotsFor({ box: of, padding, display: 'block', children: [], scale });
const kinds = (spots: readonly Spot[]): string[] => spots.map((spot) => spot.kind);
const named = (spots: readonly Spot[], kind: string): Spot | undefined =>
  spots.find((spot) => spot.kind === kind);

test('gap handles only for a flex or grid container with two or more children', () => {
  assert.equal(showsGap('flex', 2), true);
  assert.equal(showsGap('inline-grid', 3), true);
  assert.equal(showsGap('grid', 2), true);
  assert.equal(showsGap('block', 3), false);
  assert.equal(showsGap('flex', 1), false);
  assert.equal(showsGap('inline', 2), false);

  const children = [box(16, 16, 50, 30), box(82, 16, 50, 30)];
  const input = { box: box(0, 0, 200, 100), padding: even, children };
  assert.equal(kinds(spotsFor({ ...input, display: 'flex' })).includes('gap'), true);
  assert.equal(kinds(spotsFor({ ...input, display: 'block' })).includes('gap'), false);
  const one = { ...input, display: 'flex', children: children.slice(0, 1) };
  assert.equal(kinds(spotsFor(one)).includes('gap'), false);
});

test('the zone that takes the pointer is larger than the bar, and at least 12 px across', () => {
  // A 4 px bar would be 10 px with the margin: it gets the 12 px a pointer needs.
  assert.deepEqual(hitOf(box(198, 41, 4, 18)), box(194, 38, 12, 24));
  assert.deepEqual(hitOf(box(196, 96, 8, 8)), box(193, 93, 14, 14));
  // On a canvas at 50 % the same zone is twice as large in the frame's pixels.
  assert.deepEqual(hitOf(box(196, 32, 8, 36), 2), box(188, 26, 24, 48));
});

test('a gap handle sits between two neighbours of a row', () => {
  assert.deepEqual(gapSpots([box(0, 0, 50, 30), box(66, 0, 50, 30)]), [
    { kind: 'gap', box: box(56, 6, 4, 18), hit: box(52, 3, 12, 24), axis: 'x', sign: 1 },
  ]);
});

test('a gap handle sits between two neighbours of a column', () => {
  assert.deepEqual(gapSpots([box(0, 0, 50, 30), box(0, 40, 50, 30)]), [
    { kind: 'gap', box: box(16, 33, 18, 4), hit: box(13, 29, 24, 12), axis: 'y', sign: 1 },
  ]);
});

test('a reversed row turns the direction that makes the gap larger', () => {
  const [spot] = gapSpots([box(66, 0, 50, 30), box(0, 0, 50, 30)]);
  assert.equal(spot?.axis, 'x');
  assert.equal(spot?.sign, -1);
  assert.equal(spot?.box.left, 56);
});

test('no gap handle between the end of one line and the start of the next', () => {
  assert.deepEqual(gapSpots([box(100, 0, 50, 30), box(0, 40, 50, 30)]), []);
  const wrapped = [box(0, 0, 50, 30), box(60, 0, 50, 30), box(0, 40, 50, 30)];
  assert.equal(gapSpots(wrapped).length, 1);
});

test('an element gets size handles on its right edge, bottom edge and corner', () => {
  const spots = plain(box(0, 0, 200, 100));
  assert.deepEqual(kinds(spots), [
    'size',
    'width',
    'height',
    'padding-top',
    'padding-bottom',
    'padding-left',
    'padding-right',
  ]);
  // The bars that are drawn: about 4 by 18 px on an edge, a small square on the corner.
  assert.deepEqual(spots[0]?.box, box(196, 96, 8, 8));
  assert.deepEqual(spots[1]?.box, box(198, 41, 4, 18));
  assert.deepEqual(spots[2]?.box, box(91, 98, 18, 4));
  // The zones around them.
  assert.deepEqual(spots[0]?.hit, box(193, 93, 14, 14));
  assert.deepEqual(spots[1]?.hit, box(194, 38, 12, 24));
  assert.deepEqual(spots[2]?.hit, box(88, 94, 24, 12));
});

test('a padding handle sits in the middle of its padding, never on the edge', () => {
  const wide = { top: 40, right: 0, bottom: 0, left: 0 };
  const spots = plain(box(0, 0, 200, 100), wide);
  assert.deepEqual(named(spots, 'padding-top')?.box, box(94, 18, 12, 4));
  // No padding: it stays far enough inside for its zone to clear the size handle's.
  assert.deepEqual(named(spots, 'padding-bottom')?.box, box(94, 84, 12, 4));
  assert.deepEqual(named(spots, 'padding-bottom')?.hit, box(91, 80, 18, 12));
  assert.deepEqual(named(spots, 'padding-right')?.box, box(184, 44, 4, 12));
  assert.equal(named(spots, 'padding-bottom')?.sign, -1);
  assert.equal(named(spots, 'padding-right')?.sign, -1);
  assert.equal(named(spots, 'padding-left')?.sign, 1);
});

test('a small element keeps its size handles and gets no padding handles', () => {
  const spots = plain(box(0, 0, 40, 20));
  assert.deepEqual(kinds(spots), ['size', 'width', 'height']);
});

// A small element (ADR 0066).

test('under 40 px high the height handle and the corner stand below the element', () => {
  assert.equal(SMALL, 40);
  // A badge, 120 by 24.
  const spots = plain(box(100, 100, 120, 24));
  // Wide enough: the width handle stays on the right edge.
  assert.deepEqual(named(spots, 'width')?.box, box(218, 103, 4, 18));
  // The zone of the height handle begins at the bottom edge, with the bar in its middle.
  assert.deepEqual(named(spots, 'height')?.box, box(151, 128, 18, 4));
  assert.deepEqual(named(spots, 'height')?.hit, box(148, 124, 24, 12));
  assert.deepEqual(named(spots, 'size')?.box, box(216, 127, 8, 8));
  assert.deepEqual(named(spots, 'size')?.hit, box(213, 124, 14, 14));
  // A press on the lower part of the element is a press on the element.
  assert.equal(spotAt({ x: 160, y: 120 }, spots), undefined);
  assert.equal(spotAt({ x: 160, y: 130 }, spots)?.kind, 'height');
});

test('under 40 px wide the width handle and the corner stand right of the element', () => {
  const spots = plain(box(100, 100, 24, 120));
  assert.deepEqual(named(spots, 'width')?.box, box(128, 151, 4, 18));
  assert.deepEqual(named(spots, 'width')?.hit, box(124, 148, 12, 24));
  // High enough: the height handle stays on the bottom edge.
  assert.deepEqual(named(spots, 'height')?.box, box(103, 218, 18, 4));
  assert.deepEqual(named(spots, 'size')?.box, box(127, 216, 8, 8));
  // At 40 px each way the handles are on the edges.
  const enough = plain(box(100, 100, 40, 40));
  assert.deepEqual(named(enough, 'width')?.box, box(138, 111, 4, 18));
  assert.deepEqual(named(enough, 'height')?.box, box(111, 138, 18, 4));
  assert.deepEqual(named(enough, 'size')?.box, box(136, 136, 8, 8));
});

test('an element small both ways keeps its whole box free of size handles', () => {
  // An icon, 16 by 16.
  const spots = plain(box(100, 100, 16, 16));
  assert.deepEqual(kinds(spots), ['size', 'width', 'height']);
  assert.deepEqual(named(spots, 'width')?.hit, box(116, 97, 12, 22));
  assert.deepEqual(named(spots, 'height')?.hit, box(97, 116, 22, 12));
  assert.deepEqual(named(spots, 'size')?.hit, box(116, 116, 14, 14));
  for (let x = 101; x < 116; x += 2) {
    for (let y = 101; y < 116; y += 2) {
      assert.equal(spotAt({ x, y }, spots), undefined, `${x}, ${y}`);
    }
  }
  // Each handle is there to take right outside its edge.
  assert.equal(spotAt({ x: 122, y: 108 }, spots)?.kind, 'width');
  assert.equal(spotAt({ x: 108, y: 122 }, spots)?.kind, 'height');
  assert.equal(spotAt({ x: 123, y: 123 }, spots)?.kind, 'size');
});

test('small is measured on the screen: the canvas zoom moves the limit with it', () => {
  // 60 frame pixels are 30 on the screen at 50 %: the handles go out, twice as far in the frame.
  const half = plain(box(0, 0, 60, 60), even, 2);
  assert.deepEqual(named(half, 'width')?.box, box(68, 12, 8, 36));
  assert.equal(named(half, 'width')?.hit.left, 60);
  assert.equal(named(half, 'height')?.hit.top, 60);
  // At 200 % the same element is 120 px on the screen: its handles are on its edges.
  const twice = plain(box(0, 0, 60, 60), even, 0.5);
  assert.deepEqual(named(twice, 'width')?.box, box(59, 25.5, 2, 9));
});

test('a handle keeps its size on the screen at any canvas zoom', () => {
  const of = box(0, 0, 200, 100);
  // The canvas at 50 %: two frame pixels to one on the screen.
  const half = plain(of, even, 2);
  assert.deepEqual(named(half, 'size')?.box, box(192, 92, 16, 16));
  assert.deepEqual(named(half, 'width')?.box, box(196, 32, 8, 36));
  assert.deepEqual(named(half, 'width')?.hit, box(188, 26, 24, 48));
  for (const scale of [0.5, 1, 1 / 0.68, 2, 4]) {
    const edge = named(plain(box(0, 0, 2000, 1000), even, scale), 'width');
    assert.ok(edge, `scale ${scale}`);
    assert.ok(Math.abs(edge.box.width / scale - 4) < 1e-9, `bar width at ${scale}`);
    assert.ok(Math.abs(edge.box.height / scale - 18) < 1e-9, `bar length at ${scale}`);
    assert.ok(edge.hit.width / scale >= 12 - 1e-9, `zone across at ${scale}`);
  }
  // What is too small on the screen for padding handles is so at any zoom.
  assert.deepEqual(kinds(plain(box(0, 0, 200, 90), even, 2)), [
    'size',
    'width',
    'height',
    'padding-left',
    'padding-right',
  ]);
});

test('the handle under the pointer is found by its zone, the corner first', () => {
  const spots = plain(box(0, 0, 200, 100));
  assert.equal(spotAt({ x: 200, y: 100 }, spots)?.kind, 'size');
  assert.equal(spotAt({ x: 200, y: 50 }, spots)?.kind, 'width');
  assert.equal(spotAt({ x: 100, y: 100 }, spots)?.kind, 'height');
  assert.equal(spotAt({ x: 100, y: 9 }, spots)?.kind, 'padding-top');
  assert.equal(spotAt({ x: 100, y: 50 }, spots), undefined);
  // Beside the bar but inside its zone.
  assert.equal(spotAt({ x: 195, y: 50 }, spots)?.kind, 'width');
  assert.equal(spotAt({ x: 100, y: 105 }, spots)?.kind, 'height');
  assert.equal(spotAt({ x: 192, y: 50 }, spots)?.kind, 'padding-right');
  // On a small element the zones of the corner and the edge meet: the corner wins.
  const small = plain(box(0, 0, 40, 20));
  assert.equal(spotAt({ x: 40, y: 20 }, small)?.kind, 'size');
  assert.equal(spotAt({ x: 40, y: 5 }, small)?.kind, 'width');
});

test('no handle for a property the element cannot take', () => {
  const children = [box(16, 16, 50, 30), box(82, 16, 50, 30)];
  const spots = spotsFor({ box: box(0, 0, 200, 100), padding: even, display: 'flex', children });
  assert.equal(allowedSpots(spots, new Set()).length, spots.length);
  // The corner writes both sizes: it goes with either of them.
  assert.deepEqual(kinds(allowedSpots(spots, new Set(['width']))), [
    'height',
    'padding-top',
    'padding-bottom',
    'padding-left',
    'padding-right',
    'gap',
  ]);
  const some = new Set(['gap', 'padding-top', 'padding-left']);
  assert.deepEqual(kinds(allowedSpots(spots, some)), [
    'size',
    'width',
    'height',
    'padding-bottom',
    'padding-right',
  ]);
  assert.deepEqual(allowedSpots(spots, new Set(kinds(spots).concat('width', 'height'))), []);
});
