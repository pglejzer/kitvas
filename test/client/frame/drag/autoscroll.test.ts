// The scroll under a drag near the frame's top or bottom edge (ADR 0066).

import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  type AutoScroll,
  createAutoScroll,
  EDGE_ZONE,
  edgeScroll,
  MAX_SPEED,
  MIN_SPEED,
} from '../../../../client/frame/drag/autoscroll.ts';

test('the page scrolls only with the pointer within 48 px of the top or the bottom edge', () => {
  assert.equal(EDGE_ZONE, 48);
  assert.equal(edgeScroll(400, 800), 0);
  // Where a zone begins there is no scroll yet.
  assert.equal(edgeScroll(48, 800), 0);
  assert.equal(edgeScroll(752, 800), 0);
  assert.ok(edgeScroll(47, 800) < 0);
  assert.ok(edgeScroll(753, 800) > 0);
});

test('the nearer the edge the faster, from 60 to 900 px a second', () => {
  assert.equal(MIN_SPEED, 60);
  assert.equal(MAX_SPEED, 900);
  // Upwards at the top, a quarter, half and three quarters of the way in.
  assert.equal(edgeScroll(36, 800), -270);
  assert.equal(edgeScroll(24, 800), -480);
  assert.equal(edgeScroll(12, 800), -690);
  assert.equal(edgeScroll(0, 800), -900);
  // Downwards at the bottom.
  assert.equal(edgeScroll(776, 800), 480);
  assert.equal(edgeScroll(800, 800), 900);
  // Just inside a zone the page already moves at the least speed.
  const slow = edgeScroll(47.9, 800);
  assert.ok(slow <= -MIN_SPEED && slow > -MIN_SPEED - 5, String(slow));
});

test('a captured pointer past an edge scrolls at the full speed, never faster', () => {
  assert.equal(edgeScroll(-30, 800), -900);
  assert.equal(edgeScroll(1200, 800), 900);
});

test('the zone and the speed are the same on the screen at any canvas zoom', () => {
  // The canvas at 50 %: two frame pixels to one on the screen.
  assert.equal(edgeScroll(96, 800, 2), 0);
  assert.equal(edgeScroll(48, 800, 2), -960);
  assert.equal(edgeScroll(800, 800, 2), 1800);
  // At 200 % the zone is 24 frame pixels.
  assert.equal(edgeScroll(30, 800, 0.5), 0);
  assert.equal(edgeScroll(12, 800, 0.5), -240);
});

test('in a frame lower than two zones they meet in the middle', () => {
  assert.equal(edgeScroll(30, 60), 0);
  assert.equal(edgeScroll(15, 60), -480);
  assert.equal(edgeScroll(45, 60), 480);
});

test('a size or a place that is no number scrolls nothing', () => {
  assert.equal(edgeScroll(10, 0), 0);
  assert.equal(edgeScroll(10, Number.NaN), 0);
  assert.equal(edgeScroll(10, 800, 0), 0);
  assert.equal(edgeScroll(Number.NaN, 800), 0);
});

type Bench = {
  auto: AutoScroll;
  scrolled: number[];
  cancelled: number[];
  /** Runs the animation frame that waits, at `time`; `false` when none does. */
  tick(time: number): boolean;
  waiting(): boolean;
};

function bench(height = 800, scale = 1): Bench {
  const scrolled: number[] = [];
  const cancelled: number[] = [];
  let next: ((time: number) => void) | undefined;
  let handles = 0;
  const auto = createAutoScroll({
    height: () => height,
    scale: () => scale,
    scrollBy: (dy) => {
      scrolled.push(dy);
    },
    frame: (step) => {
      next = step;
      handles += 1;
      return handles;
    },
    cancel: (handle) => {
      cancelled.push(handle);
      next = undefined;
    },
  });
  return {
    auto,
    scrolled,
    cancelled,
    tick(time) {
      const step = next;
      next = undefined;
      if (!step) return false;
      step(time);
      return true;
    },
    waiting: () => next !== undefined,
  };
}

test('away from the edges no animation frame is asked for', () => {
  const b = bench();
  b.auto.at(400);
  assert.equal(b.waiting(), false);
  assert.deepEqual(b.scrolled, []);
});

test('near the bottom the page scrolls each frame by the speed times the time passed', () => {
  const b = bench();
  b.auto.at(776);
  assert.equal(b.waiting(), true);
  // The first frame only starts the clock.
  b.tick(1000);
  assert.deepEqual(b.scrolled, []);
  // 480 px a second for 16 ms, then for 10 ms.
  b.tick(1016);
  b.tick(1026);
  assert.deepEqual(b.scrolled, [7.68, 4.8]);
  assert.equal(b.waiting(), true);
});

test('near the top it scrolls up, and a frame that comes late counts 50 ms at most', () => {
  const b = bench();
  b.auto.at(24);
  b.tick(1000);
  b.tick(3000);
  assert.deepEqual(b.scrolled, [-24]);
});

test('the speed follows the pointer, and the scroll stops when it leaves the zone', () => {
  const b = bench();
  b.auto.at(776);
  b.tick(0);
  // Deeper into the zone before the next frame: one frame runs, at the new speed.
  b.auto.at(800);
  b.tick(10);
  assert.deepEqual(b.scrolled, [9]);
  b.auto.at(400);
  b.tick(20);
  assert.deepEqual(b.scrolled, [9]);
  assert.equal(b.waiting(), false);
  // Back in the zone the clock starts again: the time away is not scrolled.
  b.auto.at(776);
  b.tick(5000);
  assert.deepEqual(b.scrolled, [9]);
  b.tick(5010);
  assert.deepEqual(b.scrolled, [9, 4.8]);
});

test('the end of the drag cancels the frame that waits and scrolls no more', () => {
  const b = bench();
  b.auto.at(776);
  b.tick(0);
  b.auto.stop();
  assert.equal(b.cancelled.length, 1);
  assert.equal(b.tick(16), false);
  assert.deepEqual(b.scrolled, []);
  // With nothing waiting there is nothing to cancel.
  b.auto.stop();
  assert.equal(b.cancelled.length, 1);
});

test('the canvas zoom reaches the running scroll', () => {
  const b = bench(800, 2);
  b.auto.at(48);
  b.tick(0);
  b.tick(10);
  assert.deepEqual(b.scrolled, [-9.6]);
});
