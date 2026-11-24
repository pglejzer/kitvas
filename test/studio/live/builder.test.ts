import assert from 'node:assert/strict';
import { test } from 'node:test';
import { KitvasError } from '../../../src/shared/index.ts';
import type { BuildEvent } from '../../../src/studio/api/edit/edit-schemas.ts';
import { type BuiltDraft, createWarmBuilder } from '../../../src/studio/live/builder.ts';

/** Lets every promise that can settle now settle. */
const settled = (): Promise<void> => new Promise((resolve) => setImmediate(resolve));

type Call = { slug: string; done(built: BuiltDraft): void; fail(error: unknown): void };

/** A builder whose builds end only when a test ends them, over a clock the test moves. */
function setup() {
  let time = 0;
  const calls: Call[] = [];
  const events: BuildEvent[] = [];
  const errors: unknown[] = [];
  const builder = createWarmBuilder({
    build: (slug) =>
      new Promise<BuiltDraft>((resolve, reject) => {
        calls.push({ slug, done: resolve, fail: reject });
      }),
    publish: (event) => {
      events.push(event);
    },
    now: () => time,
    onError: (error) => {
      errors.push(error);
    },
  });
  const tick = (ms: number): void => {
    time += ms;
  };
  return { builder, calls, events, errors, tick };
}

test('a build starts at once, and its event says how it went and how long it took', async () => {
  const { builder, calls, events, tick } = setup();
  builder.request('shop', 2);
  assert.deepEqual(
    calls.map((call) => call.slug),
    ['shop'],
  );
  tick(340);
  calls[0]?.done({ ok: true, version: 2 });
  await settled();
  assert.deepEqual(events, [{ slug: 'shop', version: 2, state: 'succeeded', ms: 340 }]);
});

test('one build at a time per draft: requests meanwhile make one more run after it', async () => {
  const { builder, calls, events } = setup();
  builder.request('shop', 2);
  builder.request('shop', 2);
  builder.request('shop', 3);
  assert.equal(calls.length, 1);
  calls[0]?.done({ ok: true, version: 2 });
  await settled();
  assert.equal(calls.length, 2, 'the requests during the build make one more run');
  calls[1]?.done({ ok: true, version: 3 });
  await settled();
  assert.equal(calls.length, 2, 'and only one');
  assert.deepEqual(
    events.map((event) => event.version),
    [2, 3],
  );
  builder.request('shop', 3);
  assert.equal(calls.length, 3, 'a request after the last run starts a new one at once');
});

test('two drafts build side by side', () => {
  const { builder, calls } = setup();
  builder.request('shop', 1);
  builder.request('cart', 4);
  assert.deepEqual(
    calls.map((call) => call.slug),
    ['shop', 'cart'],
  );
});

test('a build that did not build is a failed build of its version', async () => {
  const { builder, calls, events, errors } = setup();
  builder.request('shop', 5);
  calls[0]?.done({ ok: false, version: 5 });
  await settled();
  assert.deepEqual(events, [{ slug: 'shop', version: 5, state: 'failed', ms: 0 }]);
  assert.deepEqual(errors, []);
});

test('a build that throws fails with the version asked for; only a bug is reported', async () => {
  const { builder, calls, events, errors } = setup();
  builder.request('shop', 4);
  calls[0]?.fail(new KitvasError('DRAFT_INVALID', { slug: 'shop', detail: 'layout' }));
  await settled();
  builder.request('shop', 4);
  calls[1]?.fail(new Error('esbuild stopped'));
  await settled();
  assert.deepEqual(events, [
    { slug: 'shop', version: 4, state: 'failed', ms: 0 },
    { slug: 'shop', version: 4, state: 'failed', ms: 0 },
  ]);
  assert.equal(errors.length, 1);
  assert.equal(errors[0] instanceof Error && errors[0].message, 'esbuild stopped');
});

test('close waits for the running build and starts no more', async () => {
  const { builder, calls, events } = setup();
  builder.request('shop', 1);
  builder.request('shop', 1);
  let closed = false;
  const closing = builder.close().then(() => {
    closed = true;
  });
  await settled();
  assert.equal(closed, false, 'a build still runs');
  calls[0]?.done({ ok: true, version: 1 });
  await closing;
  assert.equal(calls.length, 1, 'the run that was asked for meanwhile does not start');
  assert.equal(events.length, 1);
  builder.request('shop', 1);
  assert.equal(calls.length, 1);
});

test('settle drops the build waiting and resolves once the running one ended', async () => {
  const { builder, calls, events } = setup();
  builder.request('shop', 1);
  builder.request('shop', 2);
  let ended = false;
  const waiting = builder.settle('shop').then(() => {
    ended = true;
  });
  await settled();
  assert.equal(ended, false, 'a build still runs');
  calls[0]?.done({ ok: true, version: 1 });
  await waiting;
  assert.equal(calls.length, 1, 'the run that was asked for meanwhile does not start');
  assert.equal(events.length, 1);
  // A draft with no build running settles at once, and a later request builds again.
  await builder.settle('shop');
  await builder.settle('cart');
  builder.request('shop', 2);
  assert.equal(calls.length, 2);
});
