import assert from 'node:assert/strict';
import { test } from 'node:test';
import { KitvasError } from '../../../src/shared/index.ts';
import {
  createInbox,
  type InboxLimits,
  type NewNote,
  NewNoteSchema,
} from '../../../src/studio/inbox/inbox.ts';
import { NOW } from '../../helpers/drafts.ts';

const NOTE: NewNote = { kind: 'note', slug: 'shop', element: null, text: 'Bigger title' };

function setup(limits: Partial<InboxLimits> = {}) {
  const published: number[] = [];
  const inbox = createInbox({
    now: () => NOW,
    publish: (pending) => published.push(pending),
    limits,
  });
  return { inbox, published };
}

test('notes wait until they are taken, all at once', async () => {
  const { inbox, published } = setup();
  const first = inbox.add(NOTE);
  inbox.add({ ...NOTE, text: 'Second' });
  assert.equal(first.at, NOW.toISOString());
  assert.equal(inbox.pending(), 2);
  const taken = await inbox.wait(0).items;
  assert.deepEqual(
    taken.map((item) => item.text),
    ['Bigger title', 'Second'],
  );
  assert.equal(inbox.pending(), 0);
  assert.deepEqual(published, [1, 2, 0]);
  assert.deepEqual(await inbox.wait(0).items, []);
});

test('a waiter gets the next note as soon as it comes', async () => {
  const { inbox, published } = setup();
  const waiting = inbox.wait(5_000);
  inbox.add(NOTE);
  assert.deepEqual(
    (await waiting.items).map((item) => item.text),
    ['Bigger title'],
  );
  assert.equal(inbox.pending(), 0);
  assert.deepEqual(published, [0]);
});

test('a waiter that times out, leaves or is replaced gets nothing and loses nothing', async () => {
  const { inbox } = setup({ maxWaitMs: 50 });
  assert.deepEqual(await inbox.wait(10_000).items, []);
  const left = inbox.wait(10_000);
  left.cancel();
  left.cancel();
  assert.deepEqual(await left.items, []);
  const older = inbox.wait(10_000);
  const newer = inbox.wait(10_000);
  assert.deepEqual(await older.items, []);
  older.cancel();
  inbox.add(NOTE);
  assert.equal((await newer.items).length, 1);
  const last = inbox.wait(10_000);
  inbox.close();
  assert.deepEqual(await last.items, []);
  inbox.add(NOTE);
  assert.equal(inbox.pending(), 1);
});

test('a note may point at an element id with slashes and a dollar sign', () => {
  const id = 'sections/Pricing:section/Stack/Card.2$1';
  assert.equal(NewNoteSchema.safeParse({ ...NOTE, element: id }).success, true);
  assert.equal(NewNoteSchema.safeParse({ ...NOTE, element: 'a b' }).success, false);
});

test('a full inbox refuses more', () => {
  const { inbox } = setup({ items: 2 });
  inbox.add(NOTE);
  inbox.add(NOTE);
  assert.throws(
    () => inbox.add(NOTE),
    (error: unknown) => error instanceof KitvasError && error.code === 'INBOX_FULL',
  );
});
