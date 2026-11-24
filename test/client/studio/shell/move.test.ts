import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  cssTime,
  MOVE_MARGIN_MS,
  MOVING,
  moveWait,
  SLOW_MS,
} from '../../../../client/studio/shell/move.ts';

test('the timer waits the slow motion and a margin, for a move whose end never comes', () => {
  assert.equal(moveWait('240ms', false), 240 + MOVE_MARGIN_MS);
  assert.equal(moveWait(' 0.3s ', false), 300 + MOVE_MARGIN_MS);
  // The token cannot be read: the studio's slow motion stands in.
  assert.equal(moveWait('', false), SLOW_MS + MOVE_MARGIN_MS);
  assert.equal(moveWait('slow', false), SLOW_MS + MOVE_MARGIN_MS);
});

test('under reduced motion nothing moves, so the canvas fits at once', () => {
  assert.equal(moveWait('240ms', true), 0);
  assert.equal(moveWait('', true), 0);
});

test('a CSS time is read in milliseconds or seconds, and nothing else is', () => {
  assert.equal(cssTime('240ms'), 240);
  assert.equal(cssTime('.24s'), 240);
  assert.equal(cssTime('1s'), 1000);
  for (const value of ['', '240', 'ms', '-1s', '1e2ms', 'var(--st-motion-slow)']) {
    assert.equal(cssTime(value), null, value);
  }
});

test('the mark of a move is one attribute on main', () => {
  assert.equal(MOVING, 'data-moving');
});
