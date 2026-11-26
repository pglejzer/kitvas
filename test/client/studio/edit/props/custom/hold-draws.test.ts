import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createGestureHold } from '../../../../../../client/studio/edit/props/custom/hold-draws.ts';
import { createDrawScheduler } from '../../../../../../client/studio/edit/props/panel/draw.ts';

function setup() {
  const frames: (() => void)[] = [];
  let draws = 0;
  const scheduler = createDrawScheduler({
    frame: (run) => void frames.push(run),
    draw: () => {
      draws += 1;
    },
  });
  const listeners = new Map<string, Set<() => void>>();
  const view = {
    addEventListener(type: string, listener: () => void) {
      const set = listeners.get(type) ?? new Set();
      set.add(listener);
      listeners.set(type, set);
    },
    removeEventListener(type: string, listener: () => void) {
      listeners.get(type)?.delete(listener);
    },
  };
  const fire = (type: string): void => {
    for (const listener of [...(listeners.get(type) ?? [])]) listener();
  };
  const frame = (): void => {
    for (const run of frames.splice(0)) run();
  };
  const hold = createGestureHold(scheduler, view);
  return { scheduler, hold, fire, frame, draws: () => draws, listeners };
}

test('a draw asked for during a drag waits for the release, then draws once', () => {
  const { scheduler, hold, fire, frame, draws } = setup();
  hold.pointerDown();
  // The live checks answer while the pointer is down.
  scheduler.request();
  scheduler.request();
  frame();
  assert.equal(draws(), 0);
  fire('pointerup');
  frame();
  assert.equal(draws(), 1);
  assert.equal(scheduler.held(), false);
});

test('a second press while one is down holds once, and a cancel ends the hold', () => {
  const { scheduler, hold, fire, listeners } = setup();
  hold.pointerDown();
  hold.pointerDown();
  fire('pointercancel');
  assert.equal(scheduler.held(), false);
  assert.equal(listeners.get('pointerup')?.size, 0);
  assert.equal(listeners.get('pointercancel')?.size, 0);
});

test('an arrow key holds until it comes up or the window loses focus; other keys do not hold', () => {
  const { scheduler, hold, fire } = setup();
  hold.keyDown('a');
  assert.equal(scheduler.held(), false);
  hold.keyDown('ArrowRight');
  hold.keyDown('ArrowRight');
  assert.equal(scheduler.held(), true);
  fire('keyup');
  assert.equal(scheduler.held(), false);
  hold.keyDown('ArrowUp');
  fire('blur');
  assert.equal(scheduler.held(), false);
});

test('a pointer and a key held together need both releases', () => {
  const { scheduler, hold, fire } = setup();
  hold.pointerDown();
  hold.keyDown('ArrowLeft');
  fire('pointerup');
  assert.equal(scheduler.held(), true);
  fire('keyup');
  assert.equal(scheduler.held(), false);
});
