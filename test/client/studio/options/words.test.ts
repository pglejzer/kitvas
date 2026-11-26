import assert from 'node:assert/strict';
import { test } from 'node:test';
import { captionWords, endParts, type Say } from '../../../../client/studio/options/words.ts';
import type { DraftOption } from '../../../../src/shared/index.ts';

const OPTIONS: DraftOption[] = [
  {
    id: 'theme',
    label: 'Theme',
    default: 'light',
    values: [
      { id: 'light', label: 'Light' },
      { id: 'dark', label: 'Dark' },
    ],
  },
  {
    id: 'columns',
    label: 'Columns',
    default: '3',
    values: [
      { id: '3', label: '3' },
      { id: '2', label: '2' },
    ],
  },
];

/** The words of `studio.edit.options.captionPair`, as the locale file writes them. */
const say: Say = (key, params = {}) =>
  key === 'options.captionPair' ? `${params.option}: ${params.value}` : key;

test('the caption adds nothing at the defaults', () => {
  assert.equal(captionWords(OPTIONS, { theme: 'light', columns: '3' }, say), '');
  assert.equal(captionWords(OPTIONS, {}, say), '');
});

test('the caption names the values that differ, in the options order', () => {
  assert.equal(
    captionWords(OPTIONS, { columns: '2', theme: 'dark' }, say),
    'Theme: Dark, Columns: 2',
  );
  assert.equal(captionWords(OPTIONS, { theme: 'light', columns: '2' }, say), 'Columns: 2');
});

test('a value or an option the version lacks adds no words', () => {
  assert.equal(captionWords(OPTIONS, { columns: '9', size: 'big' }, say), '');
  assert.equal(captionWords([], { columns: '2' }, say), '');
});

test('the row ends with a note at the defaults, else Reset, and Make default where it can be made', () => {
  assert.deepEqual(endParts(0, true), { note: true, reset: false, make: false });
  assert.deepEqual(endParts(1, false), { note: false, reset: true, make: false });
  assert.deepEqual(endParts(2, true), { note: false, reset: true, make: true });
});
