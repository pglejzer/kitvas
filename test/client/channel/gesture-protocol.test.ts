import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  GESTURE_ENDS,
  MAX_GESTURE_AT,
  MAX_GESTURE_STEPS,
  parseGestureLog,
} from '../../../client/channel/gesture-protocol.ts';

const log = (steps: unknown, more: Record<string, unknown> = {}): unknown => ({
  kitvas: 1,
  channel: 'c1',
  type: 'gesture-log',
  tool: 'drag',
  steps,
  ...more,
});

test('a log of the frame is read with its steps', () => {
  const steps = [
    { at: 10, state: 'pressed', why: null },
    { at: 40, state: 'drag', why: null },
    { at: 90, state: 'idle', why: 'blur' },
  ];
  assert.deepEqual(parseGestureLog(log(steps), 'c1'), {
    kitvas: 1,
    channel: 'c1',
    type: 'gesture-log',
    tool: 'drag',
    steps,
  });
});

test('every reason the frame knows is read', () => {
  for (const why of GESTURE_ENDS) {
    const read = parseGestureLog(log([{ at: 0, state: 'idle', why }]), 'c1');
    assert.equal(read?.steps[0]?.why, why, why);
  }
});

test('another channel, another type and another tool are not a log', () => {
  const steps = [{ at: 0, state: 'idle', why: 'escape' }];
  assert.equal(parseGestureLog(log(steps), 'c2'), undefined);
  assert.equal(parseGestureLog(log(steps, { type: 'pick' }), 'c1'), undefined);
  assert.equal(parseGestureLog(log(steps, { tool: 'wheel' }), 'c1'), undefined);
  assert.equal(parseGestureLog(log(steps, { kitvas: 2 }), 'c1'), undefined);
  assert.equal(parseGestureLog('gesture-log', 'c1'), undefined);
});

test('a step with an unknown state, an unknown reason or a time out of range drops the log', () => {
  assert.equal(parseGestureLog(log([{ at: 0, state: 'flying', why: null }]), 'c1'), undefined);
  assert.equal(parseGestureLog(log([{ at: 0, state: 'idle', why: 'tired' }]), 'c1'), undefined);
  assert.equal(parseGestureLog(log([{ at: -1, state: 'idle', why: null }]), 'c1'), undefined);
  assert.equal(parseGestureLog(log([{ at: 1.5, state: 'idle', why: null }]), 'c1'), undefined);
  const late = [{ at: MAX_GESTURE_AT + 1, state: 'idle', why: null }];
  assert.equal(parseGestureLog(log(late), 'c1'), undefined);
  assert.equal(parseGestureLog(log([{ at: 0, state: 'idle' }]), 'c1'), undefined);
  assert.equal(parseGestureLog(log('steps'), 'c1'), undefined);
});

test('a log carries no more steps than the frame keeps', () => {
  const step = { at: 0, state: 'pressed', why: null };
  const full = Array.from({ length: MAX_GESTURE_STEPS }, () => step);
  assert.equal(parseGestureLog(log(full), 'c1')?.steps.length, MAX_GESTURE_STEPS);
  assert.equal(parseGestureLog(log([...full, step]), 'c1'), undefined);
});
