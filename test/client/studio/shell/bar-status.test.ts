// Claude's status in a bar (spec 6.3): what each state shows, how the bar stays current, and that
// a lost stream or a failed read never leaves it on "working".

import assert from 'node:assert/strict';
import { test } from 'node:test';
import type { StreamEvent } from '../../../../client/studio/live/sse.ts';
import {
  BAR_STATE_KEY,
  type BarState,
  type BarStorage,
  barStateOf,
  LISTEN_RECHECK_MS,
  listeningOf,
  readListening,
  recallBarState,
  rememberBarState,
  watchBar,
} from '../../../../client/studio/shell/bar-status.ts';
import type { Listening } from '../../../../src/studio/api/requests/request-schemas.ts';
import { fakeClock } from '../../../helpers/studio/fake-clock.ts';

const SINCE = '2026-11-25T10:00:00.000Z';
const LISTENING: Listening = { state: 'listening', since: SINCE };
const WORKING: Listening = { state: 'working', since: SINCE };
const OFF: Listening = { state: 'off', since: SINCE };

const told = (listening: unknown): StreamEvent => ({
  event: 'listening',
  data: JSON.stringify(listening),
});

/** Lets the answers of the reads that were asked for come in. */
const settle = (): Promise<void> => new Promise((resolve) => setImmediate(resolve));

/**
 * A watch over a fake timer. Each read waits for `answer`; `painted` lists the states shown, and
 * `reads` counts the reads still waiting for theirs.
 */
function setup() {
  const clock = fakeClock();
  const painted: BarState[] = [];
  const answers: ((listening: Listening | null) => void)[] = [];
  const watch = watchBar({
    paint: (listening) => painted.push(barStateOf(listening)),
    read: () =>
      new Promise((resolve) => {
        answers.push(resolve);
      }),
    timer: clock,
  });
  /** Answers the oldest read still waiting. */
  const answer = async (listening: Listening | null): Promise<void> => {
    answers.shift()?.(listening);
    await settle();
  };
  return { clock, painted, watch, answer, reads: () => answers.length };
}

test('the bar shows listening and working, and nothing when off or unknown', () => {
  assert.equal(barStateOf(LISTENING), 'listening');
  assert.equal(barStateOf(WORKING), 'working');
  assert.equal(barStateOf(OFF), null);
  assert.equal(barStateOf({ state: 'off', since: null }), null);
  assert.equal(barStateOf(null), null);
});

test('a state is read with care; another shape is no state', () => {
  assert.deepEqual(readListening({ state: 'working', since: SINCE }), WORKING);
  assert.deepEqual(readListening({ state: 'off', since: null }), { state: 'off', since: null });
  assert.equal(readListening({ state: 'sleeping', since: null }), null);
  assert.equal(readListening({ state: 'working', since: 5 }), null);
  assert.equal(readListening({ state: 'working' }), null);
  assert.equal(readListening('working'), null);
  assert.equal(readListening(null), null);
  assert.deepEqual(listeningOf(told(WORKING)), WORKING);
  assert.equal(listeningOf({ event: 'requests', data: '{"slug":"shop"}' }), undefined);
  assert.equal(listeningOf({ event: 'listening', data: 'not json' }), undefined);
  assert.equal(listeningOf(told({ state: 'busy' })), undefined);
});

test('an event paints its state at once; a read paints what it says', async () => {
  const { painted, watch, answer } = setup();
  watch.check();
  await answer(LISTENING);
  assert.deepEqual(painted, ['listening']);
  watch.heard(told(WORKING));
  assert.deepEqual(painted, ['listening', 'working']);
  watch.heard(told(OFF));
  assert.deepEqual(painted, ['listening', 'working', null]);
  // Other events change nothing.
  watch.heard({ event: 'job', data: '{}' });
  assert.equal(painted.length, 3);
});

test('a read answered after a newer event is not painted over it', async () => {
  const { painted, watch, answer } = setup();
  watch.check();
  watch.heard(told(WORKING));
  await answer(LISTENING);
  assert.deepEqual(painted, ['working']);
});

test('while a session is there the bar reads again every 20 s; off reads no more', async () => {
  const { clock, painted, watch, answer, reads } = setup();
  assert.equal(LISTEN_RECHECK_MS, 20_000);
  watch.heard(told(LISTENING));
  assert.equal(clock.pending(), 1);
  clock.advance(19_999);
  assert.equal(reads(), 0);
  clock.advance(1);
  assert.equal(reads(), 1);
  await answer(OFF);
  assert.deepEqual(painted, ['listening', null]);
  assert.equal(clock.pending(), 0);
  clock.advance(60_000);
  assert.equal(reads(), 0);
});

test('a lost stream paints nothing after "working", and a read answered then is not painted', async () => {
  const { clock, painted, watch, answer, reads } = setup();
  watch.heard(told(WORKING));
  watch.check();
  watch.lost();
  assert.deepEqual(painted, ['working', null]);
  assert.equal(clock.pending(), 0, 'no read again while the studio cannot be heard');
  await answer(WORKING);
  assert.deepEqual(painted, ['working', null]);
  // Failed reconnects say lost again; the bar stays empty.
  watch.lost();
  assert.deepEqual(painted, ['working', null, null]);
  // Back: the bar reads what it missed.
  watch.opened();
  assert.equal(reads(), 1);
  await answer(WORKING);
  assert.deepEqual(painted, ['working', null, null, 'working']);
});

test('a read that fails paints nothing, and lost events make the bar read again', async () => {
  const { clock, painted, watch, answer, reads } = setup();
  watch.heard(told(WORKING));
  clock.advance(LISTEN_RECHECK_MS);
  await answer(null);
  assert.deepEqual(painted, ['working', null]);
  assert.equal(clock.pending(), 0);
  watch.heard({ event: 'reset', data: '{}' });
  assert.equal(reads(), 1);
  await answer(LISTENING);
  assert.deepEqual(painted, ['working', null, 'listening']);
});

test('the tab remembers what it knew last; a storage that throws is ignored', () => {
  const kept = new Map<string, string>();
  const store: BarStorage = {
    getItem: (key) => kept.get(key) ?? null,
    setItem: (key, value) => {
      kept.set(key, value);
    },
    removeItem: (key) => {
      kept.delete(key);
    },
  };
  assert.equal(
    recallBarState(() => store),
    null,
  );
  rememberBarState(() => store, 'working');
  assert.equal(kept.get(BAR_STATE_KEY), 'working');
  assert.equal(
    recallBarState(() => store),
    'working',
  );
  rememberBarState(() => store, null);
  assert.equal(
    recallBarState(() => store),
    null,
  );
  kept.set(BAR_STATE_KEY, 'something else');
  assert.equal(
    recallBarState(() => store),
    null,
  );

  const refused = (): BarStorage => {
    throw new Error('The storage is blocked');
  };
  const failing: BarStorage = {
    getItem: () => {
      throw new Error('denied');
    },
    setItem: () => {
      throw new Error('full');
    },
    removeItem: () => {
      throw new Error('denied');
    },
  };
  for (const storage of [refused, () => failing]) {
    assert.doesNotThrow(() => rememberBarState(storage, 'working'));
    assert.doesNotThrow(() => rememberBarState(storage, null));
    assert.equal(recallBarState(storage), null);
  }
});
