import assert from 'node:assert/strict';
import { test } from 'node:test';
import { parseSharedValues, sharedValuesIssues } from '../../../src/drafts/domain/shared-values.ts';

const range = {
  id: 'range',
  label: 'Range',
  default: '30d',
  values: [
    { id: '30d', label: '30 days' },
    { id: '90d', label: '90 days' },
  ],
};
const file = (values: unknown[]) => ({ schemaVersion: 1, values });

test('a list and a text value parse; a text value has no values and an empty default', () => {
  assert.deepEqual(parseSharedValues(file([range, { id: 'query', label: 'Search' }])), [
    range,
    { id: 'query', label: 'Search', default: '', values: null },
  ]);
  assert.deepEqual(parseSharedValues(file([{ id: 'query', label: 'Search', default: 'abc' }])), [
    { id: 'query', label: 'Search', default: 'abc', values: null },
  ]);
  assert.deepEqual(sharedValuesIssues(file([range])), []);
  assert.deepEqual(parseSharedValues(file([])), []);
});

test('a missing file has no problem and no values', () => {
  assert.deepEqual(sharedValuesIssues(undefined), []);
  assert.deepEqual(parseSharedValues(undefined), []);
});

test('a file that does not fit the schema is one problem and no values', () => {
  const cases: unknown[] = [
    null,
    'text',
    { schemaVersion: 2, values: [] },
    { schemaVersion: 1, values: [], extra: 1 },
    file([{ ...range, extra: 1 }]),
    file([{ ...range, id: 'Range' }]),
    file([{ id: 'range', label: 'Range', values: range.values }]),
    file([{ ...range, values: [range.values[0]] }]),
    file([{ ...range, values: [range.values[0], range.values[0]] }]),
    file([range, range]),
    file([{ id: 'query', label: 'Search', default: 'x'.repeat(81) }]),
    file(Array.from({ length: 13 }, (_, index) => ({ id: `v${index}`, label: 'V' }))),
  ];
  for (const raw of cases) {
    assert.deepEqual(sharedValuesIssues(raw), [
      { path: 'shared', key: 'draftIssue.sharedInvalid', params: {} },
    ]);
    assert.deepEqual(parseSharedValues(raw), []);
  }
});

test('a default that is not one of the values is a problem at its own path', () => {
  const raw = file([{ ...range, default: '7d' }]);
  assert.deepEqual(sharedValuesIssues(raw), [
    {
      path: 'shared.range.default',
      key: 'draftIssue.sharedDefault',
      params: { id: 'range', value: '7d' },
    },
  ]);
  assert.deepEqual(parseSharedValues(raw), []);
});
