import assert from 'node:assert/strict';
import { test } from 'node:test';
import { PAUSE_AFTER_MS, watchPause } from '../../../../client/studio/live/paused.ts';
import {
  readEvents,
  type StreamEvent,
  type StreamHealth,
} from '../../../../client/studio/live/sse.ts';
import { fakeClock } from '../../../helpers/fake-clock.ts';

/** A watch over a fake timer; `done` lists what it did to the page, in order. */
function watch() {
  const clock = fakeClock();
  const done: string[] = [];
  const health = watchPause(
    { show: () => done.push('show'), reload: () => done.push('reload') },
    clock,
  );
  return { clock, done, health };
}

test('the paused view shows 15 s after the stream was lost, not before', () => {
  assert.equal(PAUSE_AFTER_MS, 15_000);
  const { clock, done, health } = watch();
  health.lost();
  clock.advance(14_999);
  assert.deepEqual(done, []);
  clock.advance(1);
  assert.deepEqual(done, ['show']);
});

test('failed reconnects after the loss do not start the 15 s again', () => {
  const { clock, done, health } = watch();
  health.lost();
  // The reconnects of the stream fail after 2 s, 4 and 8.
  for (const wait of [2_000, 4_000, 8_000]) {
    clock.advance(wait);
    health.lost();
  }
  assert.equal(clock.pending(), 1);
  clock.advance(1_000);
  assert.deepEqual(done, ['show']);
  clock.advance(60_000);
  health.lost();
  assert.deepEqual(done, ['show'], 'it shows once');
  assert.equal(clock.pending(), 0);
});

test('a stream that opens again within the 15 s changes nothing on the page', () => {
  const { clock, done, health } = watch();
  health.opened();
  health.lost();
  clock.advance(10_000);
  health.opened();
  clock.advance(60_000);
  assert.deepEqual(done, []);
  assert.equal(clock.pending(), 0);
  // A new loss counts its own 15 s.
  health.lost();
  clock.advance(15_000);
  assert.deepEqual(done, ['show']);
});

test('once the view shows, the stream opening again reloads the page, once', () => {
  const { clock, done, health } = watch();
  health.lost();
  clock.advance(15_000);
  clock.advance(30_000);
  health.lost();
  assert.deepEqual(done, ['show']);
  health.opened();
  assert.deepEqual(done, ['show', 'reload']);
  health.opened();
  assert.deepEqual(done, ['show', 'reload']);
});

type Heard = { health: string[]; events: StreamEvent[] };

/**
 * `readEvents` over a stand-in for `fetch` that answers with `answer`; the stream is closed once
 * `stopWhen` says so of the health heard, or after 300 ms (well before a reconnect, 2 s on).
 */
async function readWith(
  answer: () => Promise<Response>,
  stopWhen: (health: string[]) => boolean,
): Promise<Heard> {
  const heard: Heard = { health: [], events: [] };
  const stream = new AbortController();
  const stop = (): void => {
    if (stopWhen(heard.health)) queueMicrotask(() => stream.abort());
  };
  const health: StreamHealth = {
    opened: () => {
      heard.health.push('opened');
      stop();
    },
    lost: () => {
      heard.health.push('lost');
      stop();
    },
  };
  const saved = Object.getOwnPropertyDescriptor(globalThis, 'fetch');
  const fallback = setTimeout(() => stream.abort(), 300);
  Object.assign(globalThis, { fetch: answer });
  try {
    await readEvents('/api/v1/events', (event) => heard.events.push(event), stream.signal, health);
  } finally {
    if (saved) Object.defineProperty(globalThis, 'fetch', saved);
    clearTimeout(fallback);
  }
  return heard;
}

const SSE = { 'content-type': 'text/event-stream; charset=utf-8' };

test('the stream says when it opened and when it was lost', async () => {
  const ended = await readWith(
    async () => new Response('retry: 2000\n\nid: 1\nevent: job\ndata: {}\n\n', { headers: SSE }),
    (health) => health.includes('lost'),
  );
  assert.deepEqual(ended.health, ['opened', 'lost']);
  assert.deepEqual(ended.events, [{ event: 'job', data: '{}', id: '1' }]);
  const down = await readWith(
    () => Promise.reject(new TypeError('fetch failed')),
    (health) => health.includes('lost'),
  );
  assert.deepEqual(down.health, ['lost']);
});

test('a refused stream is no loss: the studio answered', async () => {
  const refused = await readWith(
    async () => new Response('{}', { status: 503, headers: { 'retry-after': '5' } }),
    () => true,
  );
  assert.deepEqual(refused.health, []);
});
