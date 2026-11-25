import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  columnsOf,
  cutIndexes,
  FOLD_KEY,
  type FoldStorage,
  readFold,
  saveFold,
} from '../../../../client/studio/start/fold.ts';
import { foldState } from '../../../../src/studio/pages/start/fold.ts';

const range = (from: number, to: number): number[] =>
  Array.from({ length: to - from }, (_, index) => from + index);

test('two rows of cards stay and the rest is cut: 5 columns and 14 cards cut the last 4', () => {
  assert.deepEqual(cutIndexes(5, 14), range(10, 14));
});

test('a list of two rows or fewer cuts nothing', () => {
  assert.deepEqual(cutIndexes(5, 10), []);
  assert.deepEqual(cutIndexes(5, 3), []);
  assert.deepEqual(cutIndexes(3, 0), []);
});

test('one column keeps two cards: 3 cards cut 1', () => {
  assert.deepEqual(cutIndexes(1, 3), [2]);
  assert.deepEqual(cutIndexes(0, 3), [2], 'no column count reads as one');
});

test('the columns are the cards that share the first top', () => {
  assert.equal(columnsOf([10, 10, 10, 10, 10, 300, 300]), 5);
  assert.equal(columnsOf([10, 10.4, 10, 250]), 3);
  assert.equal(columnsOf([10, 250, 490]), 1);
  assert.equal(columnsOf([]), 1);
});

/** A storage that keeps what it is given. */
function memory(saved?: string): FoldStorage & { kept: Map<string, string> } {
  const kept = new Map<string, string>();
  if (saved !== undefined) kept.set(FOLD_KEY, saved);
  return {
    kept,
    getItem: (key) => kept.get(key) ?? null,
    setItem: (key, value) => void kept.set(key, value),
  };
}

test('the list is shut until the tab opened it, and the choice is kept', () => {
  assert.equal(readFold(memory()), 'shut');
  assert.equal(readFold(memory('open')), 'open');
  assert.equal(readFold(memory('anything else')), 'shut');
  const storage = memory();
  saveFold(storage, 'open');
  assert.equal(readFold(storage), 'open');
});

test('a storage that throws leaves the list shut and does not throw', () => {
  const broken: FoldStorage = {
    getItem: () => {
      throw new Error('blocked');
    },
    setItem: () => {
      throw new Error('full');
    },
  };
  assert.equal(readFold(broken), 'shut');
  assert.doesNotThrow(() => saveFold(broken, 'open'));
  assert.equal(readFold(undefined), 'shut');
  assert.doesNotThrow(() => saveFold(undefined, 'shut'));
});

test('the page script and this script use the same storage key, and the script is on the nonce', () => {
  const script = foldState('N0nce').text;
  assert.ok(script.includes(`sessionStorage.getItem('${FOLD_KEY}')==='open'`));
  assert.ok(script.startsWith('<script nonce="N0nce">'));
  assert.ok(script.includes("setAttribute('data-fold',v)"));
  assert.ok(script.includes('catch(e){}'), 'a storage that throws counts as shut');
});
