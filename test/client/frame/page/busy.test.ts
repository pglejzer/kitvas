import assert from 'node:assert/strict';
import { test } from 'node:test';
import { hold, idle } from '../../../../client/frame/page/busy.ts';

/** Lets every promise that can settle now settle. */
const settled = (): Promise<void> => new Promise((resolve) => setImmediate(resolve));

/** Whether `promise` has resolved by now. */
async function resolved(promise: Promise<void>): Promise<boolean> {
  const seen = { done: false };
  void promise.then(() => {
    seen.done = true;
  });
  await settled();
  return seen.done;
}

// The count is the module's own, so every test ends the gestures it starts.

test('with no gesture the page is idle at once', async () => {
  assert.equal(await resolved(idle()), true);
});

test('a gesture holds the page until it ends', async () => {
  const end = hold();
  const free = idle();
  assert.equal(await resolved(free), false);
  end();
  assert.equal(await resolved(free), true);
  assert.equal(await resolved(idle()), true);
});

test('the page is idle only when every gesture has ended', async () => {
  const first = hold();
  const second = hold();
  const free = idle();
  first();
  assert.equal(await resolved(free), false);
  second();
  assert.equal(await resolved(free), true);
});

test('ending a gesture twice ends it once', async () => {
  const first = hold();
  const second = hold();
  first();
  first();
  const free = idle();
  assert.equal(await resolved(free), false, 'the other gesture still runs');
  second();
  assert.equal(await resolved(free), true);
});

test('everyone who waits is told, and a later gesture holds the page again', async () => {
  const end = hold();
  const waits = [idle(), idle()];
  end();
  for (const wait of waits) assert.equal(await resolved(wait), true);
  const again = hold();
  const free = idle();
  assert.equal(await resolved(free), false);
  again();
  assert.equal(await resolved(free), true);
});
