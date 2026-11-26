// The log of the pointer gestures (ADR 0066): what it keeps, and when it posts.

import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  createGestureLog,
  GESTURE_ENDS,
  GESTURE_STATES,
  type GestureLog,
  type GestureLogMessage,
  type GestureTool,
  MAX_GESTURE_AT,
  MAX_GESTURE_STEPS,
} from '../../../../client/frame/drag/gesture/gesture-log.ts';

type Bench = { log: GestureLog; posted: GestureLogMessage[]; clock: { now: number } };

function bench(tool: GestureTool = 'drag'): Bench {
  const posted: GestureLogMessage[] = [];
  const clock = { now: 0 };
  const log = createGestureLog({
    tool,
    channel: 'c1',
    now: () => clock.now,
    post: (message) => {
      posted.push(message);
    },
  });
  return { log, posted, clock };
}

test('a gesture that ends with its drop is kept in memory and not posted', () => {
  const b = bench();
  b.clock.now = 100.4;
  b.log.step('pressed');
  b.clock.now = 180.6;
  b.log.step('drag');
  b.clock.now = 400;
  b.log.end('released', true);
  assert.deepEqual(b.posted, []);
  assert.deepEqual(b.log.steps(), [
    { at: 100, state: 'pressed', why: null },
    { at: 181, state: 'drag', why: null },
    { at: 400, state: 'idle', why: 'released' },
  ]);
});

test('a gesture that ends without its drop is posted once, with the steps before it', () => {
  const b = bench();
  b.log.step('pressed');
  b.log.step('drag');
  b.log.end('released', true);
  b.clock.now = 900;
  b.log.step('pressed');
  b.clock.now = 950;
  b.log.end('blur', false);
  assert.deepEqual(b.posted, [
    {
      kitvas: 1,
      channel: 'c1',
      type: 'gesture-log',
      tool: 'drag',
      steps: [
        { at: 0, state: 'pressed', why: null },
        { at: 0, state: 'drag', why: null },
        { at: 0, state: 'idle', why: 'released' },
        { at: 900, state: 'pressed', why: null },
        { at: 950, state: 'idle', why: 'blur' },
      ],
    },
  ]);
  // A kept gesture after it posts nothing more, and leaves the posted steps as they were.
  b.log.step('pressed');
  b.log.end('released', true);
  assert.equal(b.posted.length, 1);
  assert.equal(b.posted[0]?.steps.length, 5);
});

test('what goes wrong on the way is a step with its reason: the gesture goes on', () => {
  const b = bench('handle');
  b.log.step('held');
  b.log.step('held', 'no-buttons');
  b.log.step('moving');
  assert.equal(b.posted.length, 0);
  assert.deepEqual(
    b.log.steps().map((step) => step.why),
    [null, 'no-buttons', null],
  );
  b.log.end('unloaded', false);
  assert.equal(b.posted[0]?.tool, 'handle');
  assert.deepEqual(b.posted[0]?.steps.at(-1), { at: 0, state: 'idle', why: 'unloaded' });
});

test('the log keeps the last twenty steps, and a message carries no more', () => {
  const b = bench();
  for (let n = 0; n < 30; n += 1) {
    b.clock.now = n;
    b.log.step('pressed');
  }
  assert.equal(MAX_GESTURE_STEPS, 20);
  assert.equal(b.log.steps().length, 20);
  assert.equal(b.log.steps()[0]?.at, 10);
  b.clock.now = 30;
  b.log.end('cancelled', false);
  assert.equal(b.posted[0]?.steps.length, 20);
  assert.equal(b.posted[0]?.steps[0]?.at, 11);
  assert.deepEqual(b.posted[0]?.steps.at(-1), { at: 30, state: 'idle', why: 'cancelled' });
});

test('the time of a step is a whole number a message can carry', () => {
  const b = bench();
  for (const now of [-5, Number.NaN, Number.POSITIVE_INFINITY, 2e9, 12.5]) {
    b.clock.now = now;
    b.log.step('pressed');
  }
  assert.deepEqual(
    b.log.steps().map((step) => step.at),
    [0, 0, 0, MAX_GESTURE_AT, 13],
  );
});

test('the steps handed out are a copy: nobody changes the log from outside', () => {
  const b = bench();
  b.log.step('pressed');
  b.log.steps().length = 0;
  assert.equal(b.log.steps().length, 1);
});

test('every state and every reason has one name', () => {
  assert.equal(new Set<string>(GESTURE_STATES).size, GESTURE_STATES.length);
  assert.equal(new Set<string>(GESTURE_ENDS).size, GESTURE_ENDS.length);
  // The states of the session and of a handle.
  for (const state of ['idle', 'pressed', 'drag', 'item', 'rect', 'held', 'moving']) {
    assert.ok((GESTURE_STATES as readonly string[]).includes(state), state);
  }
  // A build taken under a gesture, a page that was left, a press beside a handle.
  for (const why of ['swapped', 'unloaded', 'no-spot']) {
    assert.ok((GESTURE_ENDS as readonly string[]).includes(why), why);
  }
});
