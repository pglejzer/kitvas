import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  LISTEN_GRACE_MS,
  type Listening,
} from '../../../src/studio/api/requests/request-schemas.ts';
import {
  createListening,
  graceLeft,
  listeningState,
  type Timers,
} from '../../../src/studio/requests/listening.ts';
import { fakeClock } from '../../helpers/fake-clock.ts';

const START = Date.parse('2026-11-24T10:00:00.000Z');

test('a waiting take is listening, a taken request is working, else off after the grace', () => {
  const now = new Date(START);
  const seen = new Date(START - 1_000);
  assert.equal(listeningState({ waiting: true, taken: true, seen: null }, now), 'listening');
  assert.equal(listeningState({ waiting: false, taken: true, seen }, now), 'working');
  assert.equal(listeningState({ waiting: false, taken: false, seen }, now), 'listening');
  const long = new Date(START - LISTEN_GRACE_MS);
  assert.equal(listeningState({ waiting: false, taken: false, seen: long }, now), 'off');
  assert.equal(listeningState({ waiting: false, taken: false, seen: null }, now), 'off');
  assert.equal(graceLeft({ waiting: false, taken: false, seen }, now), LISTEN_GRACE_MS - 1_000);
  assert.equal(graceLeft({ waiting: true, taken: false, seen }, now), null);
  assert.equal(graceLeft({ waiting: false, taken: false, seen: long }, now), null);
});

function tracker(start: { waiting: boolean; taken: boolean }) {
  const clock = fakeClock(START);
  const timers: Timers = { set: (run, ms) => clock.after(ms, run) };
  const facts = { ...start };
  const heard: Listening[] = [];
  const listening = createListening({
    now: () => new Date(clock.now()),
    facts: () => facts,
    onChange: (state) => heard.push(state),
    timers,
  });
  return { clock, facts, heard, listening };
}

test('the first state has no start time; each change is told once with its time', () => {
  const { clock, facts, heard, listening } = tracker({ waiting: false, taken: true });
  assert.deepEqual(listening.current(), { state: 'working', since: null });
  assert.equal(listening.refresh(), false);
  clock.advance(1_000);
  facts.taken = false;
  facts.waiting = true;
  assert.equal(listening.refresh(), true);
  const since = new Date(START + 1_000).toISOString();
  assert.deepEqual(listening.current(), { state: 'listening', since });
  assert.deepEqual(heard, [{ state: 'listening', since }]);
  assert.equal(listening.refresh(), false, 'the same state is not told again');
  assert.equal(heard.length, 1);
});

test('a take that ended stays listening for the grace, then a timer tells off', () => {
  const { clock, facts, heard, listening } = tracker({ waiting: true, taken: false });
  facts.waiting = false;
  assert.equal(listening.seen(), false, 'within the grace it is still listening');
  assert.equal(clock.pending(), 1);
  clock.advance(LISTEN_GRACE_MS - 1);
  assert.deepEqual(heard, []);
  clock.advance(2);
  const since = new Date(START + LISTEN_GRACE_MS + 1).toISOString();
  assert.deepEqual(heard, [{ state: 'off', since }]);
  assert.equal(clock.pending(), 0);
});

test('a new take within the grace keeps listening, and the grace timer is put away', () => {
  const { clock, facts, heard, listening } = tracker({ waiting: true, taken: false });
  facts.waiting = false;
  listening.seen();
  clock.advance(3_000);
  facts.waiting = true;
  listening.refresh();
  assert.equal(clock.pending(), 0);
  clock.advance(LISTEN_GRACE_MS);
  assert.deepEqual(heard, []);
  assert.equal(listening.current().state, 'listening');
});

test('a closed tracker tells nothing more', () => {
  const { clock, facts, heard, listening } = tracker({ waiting: true, taken: false });
  facts.waiting = false;
  listening.seen();
  listening.close();
  clock.advance(LISTEN_GRACE_MS * 2);
  facts.taken = true;
  assert.equal(listening.refresh(), false);
  assert.deepEqual(heard, []);
});

test('a store that cannot be read while the studio starts counts as off, and is read again later', () => {
  const clock = fakeClock(START);
  let broken = true;
  const heard: Listening[] = [];
  const listening = createListening({
    now: () => new Date(clock.now()),
    facts: () => {
      if (broken) throw new Error('unreadable');
      return { waiting: true, taken: false };
    },
    onChange: (state) => heard.push(state),
    timers: { set: (run, ms) => clock.after(ms, run) },
  });
  broken = false;
  assert.equal(listening.refresh(), true);
  assert.deepEqual(heard, [{ state: 'listening', since: new Date(START).toISOString() }]);
});
