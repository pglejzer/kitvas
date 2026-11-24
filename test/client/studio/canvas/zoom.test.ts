import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  anchorScroll,
  centreScroll,
  clampZoom,
  fitZoom,
  fromFramePoint,
  MAX_ZOOM,
  MIN_ZOOM,
  PAD,
  parsePercent,
  percentOf,
  placeWorld,
  selectionZoom,
  stepZoom,
  unionBox,
  wheelPixels,
  wheelZoom,
} from '../../../../client/studio/canvas/zoom.ts';

const NO_PAD = { x: 0, top: 0, bottom: 0 };

test('"Element at every width" zooms to the box around the element in every card', () => {
  assert.equal(unionBox([]), null);
  const one = { x: 10, y: 20, width: 30, height: 40 };
  assert.deepEqual(unionBox([one]), one);
  assert.deepEqual(unionBox([one, { x: 500, y: 0, width: 100, height: 10 }]), {
    x: 10,
    y: 0,
    width: 590,
    height: 60,
  });
});

test('the zoom stays between 10 % and 400 %', () => {
  assert.equal(MIN_ZOOM, 0.1);
  assert.equal(MAX_ZOOM, 4);
  assert.equal(clampZoom(0.01), MIN_ZOOM);
  assert.equal(clampZoom(9), MAX_ZOOM);
  assert.equal(clampZoom(Number.NaN), 1);
  assert.equal(clampZoom(Number.POSITIVE_INFINITY), 1);
  assert.equal(clampZoom(1.23456789), 1.2346);
});

test('the buttons move along the stops and stop at the ends', () => {
  assert.equal(stepZoom(1, 1), 1.25);
  assert.equal(stepZoom(1, -1), 0.75);
  assert.equal(stepZoom(1.1, 1), 1.25);
  assert.equal(stepZoom(1.1, -1), 1);
  assert.equal(stepZoom(2, 1), 3);
  assert.equal(stepZoom(3, 1), 4);
  assert.equal(stepZoom(0.25, -1), 0.1);
  assert.equal(stepZoom(0.58, 1), 0.75);
  assert.equal(stepZoom(MAX_ZOOM, 1), MAX_ZOOM);
  assert.equal(stepZoom(MIN_ZOOM, -1), MIN_ZOOM);
});

test('a pinch up zooms in and a pinch down zooms out, by small steps', () => {
  assert.ok(wheelZoom(1, -5) > 1);
  assert.ok(wheelZoom(1, 5) < 1);
  assert.ok(wheelZoom(1, -5) < 1.05);
  assert.equal(wheelZoom(MAX_ZOOM, -500), MAX_ZOOM);
  assert.equal(wheelZoom(MIN_ZOOM, 500), MIN_ZOOM);
  assert.equal(wheelZoom(1, Number.NaN), 1);
});

test('the smallest pinch step still moves the zoom at 10 %', () => {
  assert.ok(wheelZoom(MIN_ZOOM, -1) > MIN_ZOOM);
  let zoom = MIN_ZOOM;
  for (let step = 0; step < 100; step += 1) zoom = wheelZoom(zoom, -1);
  // A hundred of them add up to about a fifth more.
  assert.ok(zoom > 0.115 && zoom < 0.125, String(zoom));
});

test('a wheel that reports lines or pages zooms by pixels', () => {
  assert.equal(wheelPixels(3, 0), 3);
  assert.equal(wheelPixels(3, 1), 48);
  assert.equal(wheelPixels(-1, 2), -400);
});

test('the strip shows whole percents', () => {
  assert.equal(percentOf(1), '100%');
  assert.equal(percentOf(0.5849), '58%');
  assert.equal(percentOf(MIN_ZOOM), '10%');
});

test('a typed percent is read with or without the sign, and cut to the range', () => {
  assert.equal(parsePercent('150'), 1.5);
  assert.equal(parsePercent('150%'), 1.5);
  assert.equal(parsePercent(' 150 % '), 1.5);
  assert.equal(parsePercent('62.5'), 0.625);
  assert.equal(parsePercent('62,5'), 0.625);
  assert.equal(parsePercent('5'), MIN_ZOOM);
  assert.equal(parsePercent('9999'), MAX_ZOOM);
});

test('a typed value that is no percent is refused', () => {
  for (const typed of ['', ' ', 'fit', '-50', '1e2', '50%%', '%', '0', '12345', '1.2.3']) {
    assert.equal(parsePercent(typed), null, typed);
  }
});

test('fit shows the whole card, by the tighter of width and height', () => {
  // The width decides.
  assert.equal(fitZoom({ width: 640, height: 2000 }, { width: 1280, height: 800 }, NO_PAD), 0.5);
  // The height decides.
  assert.equal(fitZoom({ width: 2000, height: 422 }, { width: 390, height: 844 }, NO_PAD), 0.5);
});

test('fit keeps the room around the card free for the pills, deeper at the bottom', () => {
  const room = { width: 1280 / 2 + 2 * PAD.x, height: 800 / 2 + PAD.top + PAD.bottom };
  assert.equal(fitZoom(room, { width: 1280, height: 800 }), 0.5);
  assert.ok(PAD.bottom > PAD.top);
});

test('fit never overflows by rounding, never passes 100 % and never leaves the range', () => {
  assert.equal(fitZoom({ width: 1000, height: 9000 }, { width: 3000, height: 10 }, NO_PAD), 0.33);
  assert.equal(fitZoom({ width: 5000, height: 5000 }, { width: 390, height: 844 }, NO_PAD), 1);
  assert.equal(fitZoom({ width: 100, height: 100 }, { width: 10_000, height: 800 }, NO_PAD), 0.1);
  // A room smaller than the space kept free.
  assert.equal(fitZoom({ width: 40, height: 40 }, { width: 390, height: 844 }), MIN_ZOOM);
});

test('fit is 100 % while a size is not known yet', () => {
  assert.equal(fitZoom({ width: 0, height: 0 }, { width: 390, height: 844 }), 1);
  assert.equal(fitZoom({ width: 800, height: 600 }, { width: 0, height: 0 }), 1);
});

test('fit follows the room: a narrower room gives a smaller zoom, a wider one a larger', () => {
  const world = { width: 1282, height: 830 };
  const wide = fitZoom({ width: 1080, height: 852 }, world);
  const narrow = fitZoom({ width: 760, height: 852 }, world);
  assert.ok(narrow < wide, `${narrow} < ${wide}`);
  // And the fitted world really fits the room it was fitted to.
  for (const [zoom, width] of [
    [wide, 1080],
    [narrow, 760],
  ] as const) {
    const place = placeWorld({ width, height: 852 }, world, zoom);
    assert.ok(place.width <= width, `${place.width} <= ${width}`);
    assert.ok(place.height <= 852);
    assert.ok(place.centred);
  }
});

test('a world that fits sits in the middle, between the rooms kept for the pills', () => {
  const place = placeWorld({ width: 1000, height: 800 }, { width: 400, height: 400 }, 1);
  assert.equal(place.left, 300);
  assert.equal(place.centred, true);
  // 800 high, 400 of world, the pills' rooms above and below kept free: the rest is shared.
  assert.equal(place.top, PAD.top + (800 - 400 - PAD.top - PAD.bottom) / 2);
  assert.ok(place.width <= 1000 && place.height <= 800);
});

test('a world larger than the room starts after the padding and makes the canvas scroll', () => {
  const place = placeWorld({ width: 500, height: 400 }, { width: 400, height: 400 }, 2);
  assert.equal(place.width, 800 + 2 * PAD.x);
  assert.equal(place.height, 800 + PAD.top + PAD.bottom);
  assert.equal(place.left, PAD.x);
  assert.equal(place.top, PAD.top);
  assert.equal(place.centred, false);
});

test('zooming around the pointer keeps the point under it still', () => {
  // The world point at (100 + 50 - 0) / 1 = 150 stays under the pointer when the zoom doubles.
  const flat = { zoom: 1, offset: 0 };
  const next = anchorScroll(100, 50, flat, { zoom: 2, offset: 0 });
  assert.equal(next, 250);
  assert.equal((next + 50) / 2, 150);
  assert.equal(anchorScroll(0, 0, flat, { zoom: 0.5, offset: 0 }), 0);
});

test('the point stays still when the world also moves inside the content', () => {
  const from = { zoom: 0.5, offset: 300 };
  const to = { zoom: 2, offset: 32 };
  const pointer = 420;
  const scroll = 0;
  const point = (scroll + pointer - from.offset) / from.zoom;
  const next = anchorScroll(scroll, pointer, from, to);
  assert.equal((next + pointer - to.offset) / to.zoom, point);
});

test('the scroll is never negative: the browser has nothing before the start', () => {
  assert.equal(anchorScroll(0, 400, { zoom: 2, offset: 32 }, { zoom: 0.5, offset: 300 }), 0);
});

test('zoom to selection fills most of the room with the element, inside the range', () => {
  assert.equal(selectionZoom({ width: 1000, height: 800 }, { width: 400, height: 100 }), 2);
  assert.equal(selectionZoom({ width: 1000, height: 800 }, { width: 100, height: 400 }), 1.6);
  assert.equal(selectionZoom({ width: 1000, height: 800 }, { width: 2, height: 2 }), MAX_ZOOM);
  assert.equal(selectionZoom({ width: 100, height: 100 }, { width: 5000, height: 10 }), MIN_ZOOM);
});

test('an element without a size, or a room without one, gives no zoom', () => {
  assert.equal(selectionZoom({ width: 1000, height: 800 }, { width: 0, height: 0 }), null);
  assert.equal(selectionZoom({ width: 0, height: 0 }, { width: 10, height: 10 }), null);
  // A line still has one size to go by.
  assert.equal(selectionZoom({ width: 1000, height: 800 }, { width: 400, height: 0 }), 2);
});

test('the selection lands in the middle of the canvas', () => {
  // World x 500 at zoom 2 with the world starting at 32 is at 1032; half of the room is 400.
  assert.equal(centreScroll(500, { zoom: 2, offset: 32 }, 800), 632);
  assert.equal(centreScroll(10, { zoom: 1, offset: 0 }, 800), 0);
});

test('a point of a frame is on the page at the frame corner plus the point times the zoom', () => {
  const corner = { left: 100, top: 40 };
  assert.deepEqual(fromFramePoint({ x: 50, y: 50 }, corner, 1), { x: 150, y: 90 });
  assert.deepEqual(fromFramePoint({ x: 100, y: 100 }, corner, 0.5), { x: 150, y: 90 });
  assert.deepEqual(fromFramePoint({ x: 100, y: 50 }, corner, 2), { x: 300, y: 140 });
  // A zoom that is no number counts as 100 %.
  assert.deepEqual(fromFramePoint({ x: 1, y: 1 }, corner, 0), { x: 101, y: 41 });
});

test('a panel that opens moves the draft half its width, a little on every frame, with no jump', () => {
  // The canvas follows its room on each frame of the move (`canvas.ts`). The room starts 248 px
  // further right at the end and is 248 px narrower; the draft stays in its middle all the way.
  const world = { width: 390, height: 844 };
  const at = (panel: number): number =>
    panel + placeWorld({ width: 1076 - panel, height: 852 }, world, 0.81).left;
  const frames = [0, 31, 62, 124, 186, 217, 248].map(at);
  assert.equal(frames[0], 380);
  assert.equal(frames.at(-1), 504);
  for (let index = 1; index < frames.length; index += 1) {
    const step = (frames[index] ?? 0) - (frames[index - 1] ?? 0);
    // Never back, and never more than the panel itself moved in that frame.
    assert.ok(step >= 0 && step <= 62, `frame ${index} moved ${step}`);
  }
});
