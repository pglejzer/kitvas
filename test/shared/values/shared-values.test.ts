import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  defaultShared,
  keepShared,
  type SharedValue,
} from '../../../src/shared/values/shared-values.ts';

const RANGE: SharedValue = {
  id: 'range',
  label: 'Date range',
  default: '30d',
  values: [
    { id: '30d', label: 'Last 30 days' },
    { id: '90d', label: 'Last 90 days' },
  ],
};
const QUERY: SharedValue = { id: 'query', label: 'Search accounts', default: '', values: null };

test('every shared value starts at its default', () => {
  assert.deepEqual(defaultShared([RANGE, QUERY]), { range: '30d', query: '' });
  assert.deepEqual(defaultShared([]), {});
});

test('what was held is kept when the version still has it', () => {
  assert.deepEqual(keepShared([RANGE, QUERY], { range: '90d', query: 'acme' }), {
    range: '90d',
    query: 'acme',
  });
});

test('a held value the version no longer has falls back to the default', () => {
  assert.deepEqual(keepShared([RANGE, QUERY], { range: '12m', query: 7, gone: 'x' }), {
    range: '30d',
    query: '',
  });
});

test('nothing held, or not an object, gives the defaults', () => {
  for (const held of [undefined, null, 'range', 3]) {
    assert.deepEqual(keepShared([RANGE], held), { range: '30d' });
  }
});
