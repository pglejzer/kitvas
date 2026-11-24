import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  clampZoom,
  fitZoom,
  MAX_ZOOM,
  MIN_ZOOM,
  scrollFor,
  stepZoom,
  wheelZoom,
} from '../../../client/studio/edit/zoom.ts';

test('the zoom stays between 25 % and 200 %', () => {
  assert.equal(clampZoom(0.1), MIN_ZOOM);
  assert.equal(clampZoom(5), MAX_ZOOM);
  assert.equal(clampZoom(Number.NaN), 1);
  assert.equal(clampZoom(1.234), 1.23);
});

test('the buttons move by quarters and stop at the ends', () => {
  assert.equal(stepZoom(1, 1), 1.25);
  assert.equal(stepZoom(1, -1), 0.75);
  assert.equal(stepZoom(1.1, 1), 1.25);
  assert.equal(stepZoom(1.1, -1), 1);
  assert.equal(stepZoom(MAX_ZOOM, 1), MAX_ZOOM);
  assert.equal(stepZoom(MIN_ZOOM, -1), MIN_ZOOM);
});

test('a pinch up zooms in and a pinch down zooms out, by small steps', () => {
  assert.ok(wheelZoom(1, -5) > 1);
  assert.ok(wheelZoom(1, 5) < 1);
  assert.ok(wheelZoom(1, -5) < 1.05);
  assert.equal(wheelZoom(MAX_ZOOM, -500), MAX_ZOOM);
});

test('fit shows the whole frame width and never overflows by rounding', () => {
  assert.equal(fitZoom(600, 1200), 0.5);
  assert.equal(fitZoom(1000, 3000), 0.33);
  assert.equal(fitZoom(1000, 100), MAX_ZOOM);
  assert.equal(fitZoom(100, 10_000), MIN_ZOOM);
  assert.equal(fitZoom(0, 1200), 1);
});

test('zooming around the pointer keeps the point under it still', () => {
  // The content point at 100 + 50 = 150 stays at the pointer when the zoom doubles.
  const next = scrollFor(100, 50, 1, 2);
  assert.equal(next, 250);
  assert.equal((next + 50) / 2, 150);
  assert.equal(scrollFor(0, 0, 1, 0.5), 0);
});
