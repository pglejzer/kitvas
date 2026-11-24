import assert from 'node:assert/strict';
import { test } from 'node:test';
import type { ScaleStep } from '../../../client/channel/structure-protocol.ts';
import {
  distances,
  gapSpots,
  labelOf,
  nearestStep,
  type Spot,
  showsGap,
  spotAt,
  spotsFor,
} from '../../../client/frame/guides.ts';
import {
  candidatesFor,
  propertyOf,
  pxAfter,
  resolve,
  type Scales,
  snapTo,
  tracksOf,
} from '../../../client/frame/handles.ts';

type Box = { left: number; top: number; width: number; height: number };

const step = (scale: string, name: string, px: number): ScaleStep => ({
  name,
  var: `--kit-${scale}-${name}`,
  px,
});

const SPACE = [
  step('space', 'xs', 4),
  step('space', 'sm', 8),
  step('space', 'md', 16),
  step('space', 'lg', 24),
];
const SIZE = [step('size', 'sm', 320), step('size', 'md', 480), step('size', 'lg', 640)];
const SCALES: Scales = { space: SPACE, size: SIZE };

const box = (left: number, top: number, width: number, height: number): Box => ({
  left,
  top,
  width,
  height,
});
const even = { top: 16, right: 16, bottom: 16, left: 16 };
/** The handles of a block element without children. */
const plain = (of: Box, padding = even): Spot[] =>
  spotsFor({ box: of, padding, display: 'block', children: [] });
const kinds = (spots: readonly Spot[]): string[] => spots.map((spot) => spot.kind);
const labels = (property: string, extras = {}): string[] =>
  candidatesFor(property, SCALES, extras).map((candidate) => candidate.label);

test('a handle snaps to the nearest step, the earlier of two equally near', () => {
  const candidates = candidatesFor('gap', SCALES);
  assert.equal(snapTo(11, candidates)?.label, 'sm');
  assert.equal(snapTo(13, candidates)?.label, 'md');
  assert.equal(snapTo(12, candidates)?.label, 'sm');
  assert.equal(snapTo(500, candidates)?.label, 'lg');
  assert.equal(snapTo(12, []), undefined);
});

test('a snapped value is the step token, previewed as its variable', () => {
  assert.deepEqual(resolve(15, false, candidatesFor('padding-top', SCALES)), {
    value: { token: '--kit-space-md' },
    css: 'var(--kit-space-md)',
    label: 'md · 16px',
  });
});

test('Shift releases the snap: the value is the raw rounded pixels', () => {
  const candidates = candidatesFor('gap', SCALES);
  assert.deepEqual(resolve(15.4, true, candidates), {
    value: { raw: '15px' },
    css: '15px',
    label: '15px',
  });
  assert.deepEqual(resolve(-5, true, candidates).value, { raw: '0px' });
});

test('a kit without a scale gives raw pixels', () => {
  assert.deepEqual(resolve(10, false, []).value, { raw: '10px' });
});

test('100% and auto are offered for a width only', () => {
  const extras = { auto: 200, full: 900 };
  assert.deepEqual(labels('width', extras), ['sm', 'md', 'lg', 'auto', '100%']);
  assert.deepEqual(labels('height', extras), ['sm', 'md', 'lg']);
  assert.deepEqual(labels('padding-left', extras), ['xs', 'sm', 'md', 'lg']);
  assert.deepEqual(labels('gap', extras), ['xs', 'sm', 'md', 'lg']);
  // Not measured: not offered.
  assert.deepEqual(labels('width'), ['sm', 'md', 'lg']);
});

test('a width snaps to 100% and to auto where they are the nearest', () => {
  const candidates = candidatesFor('width', SCALES, { auto: 200, full: 900 });
  assert.deepEqual(resolve(880, false, candidates), {
    value: { raw: '100%' },
    css: '100%',
    label: '100%',
  });
  assert.deepEqual(resolve(210, false, candidates).value, { raw: 'auto' });
  assert.deepEqual(resolve(330, false, candidates).value, { token: '--kit-size-sm' });
  assert.deepEqual(resolve(880, true, candidates).value, { raw: '880px' });
});

test('sizes snap to the size scale, padding and gap to the space scale', () => {
  const tokens = (property: string): string[] =>
    candidatesFor(property, SCALES).map((candidate) =>
      'token' in candidate.value ? candidate.value.token : candidate.value.raw,
    );
  assert.equal(tokens('width')[0], '--kit-size-sm');
  assert.equal(tokens('height')[0], '--kit-size-sm');
  assert.equal(tokens('padding-block')[0], '--kit-space-xs');
  assert.equal(tokens('gap')[0], '--kit-space-xs');
});

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

test('a gap handle sits between two neighbours of a row', () => {
  assert.deepEqual(gapSpots([box(0, 0, 50, 30), box(66, 0, 50, 30)]), [
    { kind: 'gap', box: box(55, 3, 6, 24), axis: 'x', sign: 1 },
  ]);
});

test('a gap handle sits between two neighbours of a column', () => {
  assert.deepEqual(gapSpots([box(0, 0, 50, 30), box(0, 40, 50, 30)]), [
    { kind: 'gap', box: box(13, 32, 24, 6), axis: 'y', sign: 1 },
  ]);
});

test('a reversed row turns the direction that makes the gap larger', () => {
  const [spot] = gapSpots([box(66, 0, 50, 30), box(0, 0, 50, 30)]);
  assert.equal(spot?.axis, 'x');
  assert.equal(spot?.sign, -1);
  assert.equal(spot?.box.left, 55);
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
  assert.deepEqual(spots[0]?.box, box(195, 95, 10, 10));
  assert.deepEqual(spots[1]?.box, box(197, 38, 6, 24));
  assert.deepEqual(spots[2]?.box, box(88, 97, 24, 6));
});

test('a padding handle sits in the middle of its padding, never on the edge', () => {
  const wide = { top: 40, right: 0, bottom: 0, left: 0 };
  const spots = plain(box(0, 0, 200, 100), wide);
  const of = (kind: string): Spot | undefined => spots.find((spot) => spot.kind === kind);
  assert.deepEqual(of('padding-top')?.box, box(92, 17, 16, 6));
  assert.deepEqual(of('padding-bottom')?.box, box(92, 88, 16, 6));
  assert.equal(of('padding-bottom')?.sign, -1);
  assert.equal(of('padding-right')?.sign, -1);
  assert.equal(of('padding-left')?.sign, 1);
});

test('a small element keeps its size handles and gets no padding handles', () => {
  const spots = plain(box(0, 0, 40, 20));
  assert.deepEqual(kinds(spots), ['size', 'width', 'height']);
});

test('the handle under the pointer is found, the corner first', () => {
  const spots = plain(box(0, 0, 200, 100));
  assert.equal(spotAt({ x: 200, y: 100 }, spots)?.kind, 'size');
  assert.equal(spotAt({ x: 200, y: 50 }, spots)?.kind, 'width');
  assert.equal(spotAt({ x: 100, y: 100 }, spots)?.kind, 'height');
  assert.equal(spotAt({ x: 100, y: 9 }, spots)?.kind, 'padding-top');
  assert.equal(spotAt({ x: 100, y: 50 }, spots), undefined);
});

test('the corner changes width and height, every other handle one property', () => {
  const corner: Spot = { kind: 'size', box: box(0, 0, 10, 10), axis: 'both', sign: 1 };
  assert.deepEqual(tracksOf(corner), [
    { property: 'width', axis: 'x', sign: 1 },
    { property: 'height', axis: 'y', sign: 1 },
  ]);
  const low: Spot = { kind: 'padding-bottom', box: box(0, 0, 16, 6), axis: 'y', sign: -1 };
  assert.deepEqual(tracksOf(low), [{ property: 'padding-bottom', axis: 'y', sign: -1 }]);
});

test('Alt moves both sides of a padding together', () => {
  assert.equal(propertyOf('padding-top', true), 'padding-block');
  assert.equal(propertyOf('padding-bottom', true), 'padding-block');
  assert.equal(propertyOf('padding-left', true), 'padding-inline');
  assert.equal(propertyOf('padding-right', true), 'padding-inline');
  assert.equal(propertyOf('padding-top', false), 'padding-top');
  assert.equal(propertyOf('gap', true), 'gap');
  assert.equal(propertyOf('width', true), 'width');
});

test('a drag changes the value along its axis and never under zero', () => {
  const width = { property: 'width', axis: 'x', sign: 1 } as const;
  assert.equal(pxAfter(300, width, { x: 10, y: 0 }, { x: 50, y: 80 }), 340);
  const low = { property: 'padding-bottom', axis: 'y', sign: -1 } as const;
  assert.equal(pxAfter(16, low, { x: 0, y: 100 }, { x: 0, y: 90 }), 26);
  assert.equal(pxAfter(16, low, { x: 0, y: 100 }, { x: 0, y: 130 }), 0);
});

test('the nearest space step names a distance', () => {
  assert.equal(nearestStep(20, SPACE)?.name, 'md');
  assert.equal(nearestStep(21, SPACE)?.name, 'lg');
  assert.equal(nearestStep(21, []), undefined);
  assert.equal(labelOf(30, SPACE), '30px · lg');
  assert.equal(labelOf(7.6, []), '8px');
});

test('the distance to a box on the right and on the left', () => {
  const from = box(0, 0, 100, 50);
  assert.deepEqual(distances(from, box(130, 10, 40, 20)), [
    { axis: 'x', px: 30, from: { x: 100, y: 20 }, to: { x: 130, y: 20 } },
  ]);
  assert.deepEqual(distances(from, box(-60, 0, 40, 50)), [
    { axis: 'x', px: 20, from: { x: -20, y: 25 }, to: { x: 0, y: 25 } },
  ]);
});

test('the distance to a box above and below', () => {
  const from = box(0, 0, 100, 50);
  assert.deepEqual(distances(from, box(0, -40, 100, 30)), [
    { axis: 'y', px: 10, from: { x: 50, y: -10 }, to: { x: 50, y: 0 } },
  ]);
  assert.deepEqual(distances(from, box(20, 80, 50, 10)), [
    { axis: 'y', px: 30, from: { x: 45, y: 50 }, to: { x: 45, y: 80 } },
  ]);
});

test('a box on a diagonal gives both distances, drawn from the middle of the selected box', () => {
  assert.deepEqual(distances(box(0, 0, 100, 50), box(120, 70, 10, 10)), [
    { axis: 'x', px: 20, from: { x: 100, y: 25 }, to: { x: 120, y: 25 } },
    { axis: 'y', px: 20, from: { x: 50, y: 50 }, to: { x: 50, y: 70 } },
  ]);
});

test('a box inside another gives its inset on every side', () => {
  const parent = box(0, 0, 200, 100);
  assert.deepEqual(distances(box(20, 10, 60, 30), parent), [
    { axis: 'x', px: 20, from: { x: 0, y: 25 }, to: { x: 20, y: 25 } },
    { axis: 'x', px: 120, from: { x: 80, y: 25 }, to: { x: 200, y: 25 } },
    { axis: 'y', px: 10, from: { x: 50, y: 0 }, to: { x: 50, y: 10 } },
    { axis: 'y', px: 60, from: { x: 50, y: 40 }, to: { x: 50, y: 100 } },
  ]);
  // The same from the parent to its child.
  assert.deepEqual(
    distances(parent, box(20, 10, 60, 30)).map((measure) => measure.px),
    [20, 120, 10, 60],
  );
  // An edge on the parent's edge has no inset to show.
  assert.deepEqual(
    distances(box(0, 10, 60, 30), parent).map((measure) => measure.px),
    [140, 10, 60],
  );
});

test('boxes that cross are measured between their edges on each side', () => {
  assert.deepEqual(distances(box(0, 0, 100, 100), box(50, 50, 100, 100)), [
    { axis: 'x', px: 50, from: { x: 0, y: 75 }, to: { x: 50, y: 75 } },
    { axis: 'x', px: 50, from: { x: 100, y: 75 }, to: { x: 150, y: 75 } },
    { axis: 'y', px: 50, from: { x: 75, y: 0 }, to: { x: 75, y: 50 } },
    { axis: 'y', px: 50, from: { x: 75, y: 100 }, to: { x: 75, y: 150 } },
  ]);
});

test('touching boxes and the same box give no distance', () => {
  assert.deepEqual(distances(box(0, 0, 100, 50), box(100, 0, 50, 50)), []);
  assert.deepEqual(distances(box(0, 0, 100, 50), box(0, 0, 100, 50)), []);
});
