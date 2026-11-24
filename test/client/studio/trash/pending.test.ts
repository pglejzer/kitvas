import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  leftOf,
  type PendingUndo,
  savePending,
  takePending,
  UNDO_MS,
} from '../../../../client/studio/trash/pending.ts';

/** A storage in memory, with the three calls the module uses. */
function memory(initial: Record<string, string> = {}) {
  const items = new Map(Object.entries(initial));
  return {
    items,
    getItem: (key: string) => items.get(key) ?? null,
    setItem: (key: string, value: string) => {
      items.set(key, value);
    },
    removeItem: (key: string) => {
      items.delete(key);
    },
  };
}

const NOTE: PendingUndo = { slug: 'shop', title: 'Shop', at: 10_000 };

test('a delete made on a draft page is handed to the gallery once', () => {
  const store = memory();
  savePending(NOTE, store);
  assert.deepEqual(takePending(10_500, store), NOTE);
  assert.equal(takePending(10_500, store), undefined, 'taken once');
  assert.equal(store.items.size, 0);
});

test('a note older than the Undo time is dropped, and is still removed', () => {
  const store = memory();
  savePending(NOTE, store);
  assert.equal(takePending(NOTE.at + UNDO_MS + 1, store), undefined);
  assert.equal(store.items.size, 0);
  savePending(NOTE, store);
  assert.deepEqual(takePending(NOTE.at + UNDO_MS, store), NOTE);
});

test('a broken note, and no storage at all, give nothing and throw nothing', () => {
  for (const raw of [
    'not json',
    'null',
    '[]',
    '{"slug":"shop"}',
    '{"slug":1,"title":"a","at":1}',
  ]) {
    const store = memory({ 'kitvas:trash-undo': raw });
    assert.equal(takePending(10_000, store), undefined, raw);
  }
  assert.equal(takePending(10_000, undefined), undefined);
  assert.doesNotThrow(() => savePending(NOTE, undefined));
  const full = {
    ...memory(),
    setItem: () => {
      throw new Error('quota');
    },
  };
  assert.doesNotThrow(() => savePending(NOTE, full));
});

test('the Undo time left is what the 8 seconds leave, never below none', () => {
  assert.equal(leftOf(NOTE, NOTE.at), UNDO_MS);
  assert.equal(leftOf(NOTE, NOTE.at + 3000), UNDO_MS - 3000);
  assert.equal(leftOf(NOTE, NOTE.at + UNDO_MS + 500), 0);
});
