// The counts after the right tabs' labels (plan 18f, task 3).

import assert from 'node:assert/strict';
import { test } from 'node:test';
import { clockOf } from '../../../../../client/studio/edit/history/saved-at.ts';
import { countWords } from '../../../../../client/studio/edit/history/tab-counts.ts';

test('a tab shows its count, and nothing for none', () => {
  assert.equal(countWords(3), '3');
  assert.equal(countWords(12), '12');
  assert.equal(countWords(0), '');
});

test('the marker reads a saving time as a clock, and a text that is no date as none', () => {
  assert.match(clockOf('2026-11-25T11:40:00.000Z') ?? '', /\d{1,2}[:.]\d{2}/);
  assert.equal(clockOf('not a date'), null);
});
