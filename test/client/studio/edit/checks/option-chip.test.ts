// The option values a finding was seen with: the pairs the server writes on a card, the chip's
// words and the choice "Show on canvas" sets first.

import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  chipWords,
  choiceOf,
  parseFindingOptions,
} from '../../../../../client/studio/edit/checks/option-chip.ts';
import type { DraftOption } from '../../../../../src/shared/values/options.ts';

const OPTIONS: DraftOption[] = [
  {
    id: 'columns',
    label: 'Columns',
    default: '3',
    values: [
      { id: '2', label: '2' },
      { id: '3', label: '3' },
    ],
  },
  {
    id: 'theme',
    label: 'Theme',
    default: 'light',
    values: [
      { id: 'light', label: 'Light' },
      { id: 'dark', label: 'Dark' },
    ],
  },
];

const say = (_key: string, params: Record<string, string | number> = {}): string =>
  `${params.option}: ${params.value}`;

test('a card of the default combination has no pairs; the others are read in order', () => {
  assert.deepEqual(parseFindingOptions(undefined), []);
  assert.deepEqual(parseFindingOptions(''), []);
  assert.deepEqual(parseFindingOptions('columns=2 theme=dark'), [
    { id: 'columns', value: '2' },
    { id: 'theme', value: 'dark' },
  ]);
  assert.deepEqual(parseFindingOptions('columns= =2 plain'), []);
});

test('the chip says the option and the value by their labels', () => {
  assert.equal(chipWords(OPTIONS, [{ id: 'columns', value: '2' }], say), 'Columns: 2');
  assert.equal(
    chipWords(OPTIONS, parseFindingOptions('columns=2 theme=dark'), say),
    'Columns: 2, Theme: Dark',
  );
});

test('no chip for the default combination, or for values the version lacks', () => {
  assert.equal(chipWords(OPTIONS, [], say), '');
  assert.equal(chipWords(OPTIONS, [{ id: 'columns', value: '9' }], say), '');
  assert.equal(chipWords(OPTIONS, [{ id: 'ghost', value: '2' }], say), '');
  assert.equal(chipWords([], [{ id: 'columns', value: '2' }], say), '');
});

test('"Show on canvas" sets only the values the finding names', () => {
  assert.deepEqual(choiceOf(parseFindingOptions('columns=2')), { columns: '2' });
  assert.deepEqual(choiceOf([]), {});
});
