import assert from 'node:assert/strict';
import { test } from 'node:test';
import { isUse, startIdleStop } from '../../../src/studio/server/idle-stop.ts';
import { fakeClock } from '../../helpers/fake-clock.ts';

const MINUTE = 60_000;

/** An idle stop over a fake clock; `jobs` says whether a job runs, `stops` counts the stops. */
function watch(minutes: number) {
  const clock = fakeClock(1_000_000);
  const state = { jobs: false, stops: 0 };
  const idle = startIdleStop({
    minutes,
    busy: () => state.jobs,
    stop: () => {
      state.stops += 1;
    },
    clock,
  });
  return { clock, state, idle };
}

test('the studio stops once the minutes without use are over, not a moment before', () => {
  const { clock, state } = watch(240);
  clock.advance(240 * MINUTE - 1);
  assert.equal(state.stops, 0);
  clock.advance(1);
  assert.equal(state.stops, 1);
  assert.equal(clock.pending(), 0);
  clock.advance(240 * MINUTE);
  assert.equal(state.stops, 1, 'it stops once');
});

test('use starts the wait again, without a timer per request', () => {
  const { clock, state, idle } = watch(10);
  clock.advance(9 * MINUTE);
  idle.touch();
  assert.equal(clock.pending(), 1);
  clock.advance(9 * MINUTE);
  assert.equal(state.stops, 0);
  idle.touch();
  idle.touch();
  assert.equal(clock.pending(), 1);
  clock.advance(10 * MINUTE - 1);
  assert.equal(state.stops, 0);
  clock.advance(1);
  assert.equal(state.stops, 1);
});

test('a request is use until its answer ends; the wait counts from its end', () => {
  const { clock, state, idle } = watch(1);
  const done = idle.hold();
  clock.advance(5 * MINUTE);
  assert.equal(state.stops, 0, 'an inbox take that waits holds the stop off');
  done();
  done();
  clock.advance(MINUTE - 1);
  assert.equal(state.stops, 0);
  clock.advance(1);
  assert.equal(state.stops, 1);
});

test('a running job holds the stop off; the wait counts from its end', () => {
  const { clock, state, idle } = watch(1);
  state.jobs = true;
  clock.advance(3 * MINUTE + 30_000);
  assert.equal(state.stops, 0);
  // The job ends half a minute after the last check; its end is published, which is use.
  state.jobs = false;
  idle.touch();
  clock.advance(MINUTE - 1);
  assert.equal(state.stops, 0);
  clock.advance(1);
  assert.equal(state.stops, 1);
});

test('0 minutes never stops and keeps no timer', () => {
  const { clock, state, idle } = watch(0);
  assert.equal(clock.pending(), 0);
  idle.touch();
  idle.hold()();
  clock.advance(7 * 24 * 60 * MINUTE);
  assert.equal(state.stops, 0);
  assert.equal(clock.pending(), 0);
});

test('close ends the watch: no stop comes after it', () => {
  const { clock, state, idle } = watch(1);
  idle.close();
  assert.equal(clock.pending(), 0);
  idle.touch();
  clock.advance(10 * MINUTE);
  assert.equal(state.stops, 0);
});

test('every request is use except the events stream', () => {
  const used = ['/', '/drafts/shop', '/api/v1/status', '/api/v1/inbox/take', '/assets/kit.js'];
  for (const url of used) assert.equal(isUse(url), true, url);
  for (const url of ['/api/v1/events', '/api/v1/events?x=1']) assert.equal(isUse(url), false, url);
  assert.equal(isUse('/api/v1/events/more'), true);
  assert.equal(isUse(undefined), true);
});
