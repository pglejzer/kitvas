import assert from 'node:assert/strict';
import { test } from 'node:test';
import { holdShared } from '../../../../client/frame/page/shared-values.ts';
import { SHARED_HOLD, type SharedValue } from '../../../../src/shared/values/shared-values.ts';

const RANGE: SharedValue = {
  id: 'range',
  label: 'Range',
  default: '30d',
  values: [
    { id: '30d', label: '30 days' },
    { id: '90d', label: '90 days' },
  ],
};
const VALUES: SharedValue[] = [RANGE, { id: 'query', label: 'Search', default: '', values: null }];

test('it starts at the defaults and keeps them on the scope', () => {
  const scope: Record<string, unknown> = {};
  const held = holdShared(VALUES, scope);
  assert.deepEqual(held.get(), { range: '30d', query: '' });
  assert.deepEqual(scope[SHARED_HOLD], { range: '30d', query: '' });
});

test('set merges, stores the result on the scope and returns it', () => {
  const scope: Record<string, unknown> = {};
  const held = holdShared(VALUES, scope);
  assert.deepEqual(held.set({ range: '90d' }), { range: '90d', query: '' });
  assert.deepEqual(held.set({ query: 'acme' }), { range: '90d', query: 'acme' });
  assert.deepEqual(held.get(), { range: '90d', query: 'acme' });
  assert.deepEqual(scope[SHARED_HOLD], { range: '90d', query: 'acme' });
});

test('set drops an undeclared key and a value that is not one of the list', () => {
  const held = holdShared(VALUES, {});
  held.set({ range: '90d' });
  assert.deepEqual(held.set({ range: '7d', ghost: 'x' }), { range: '90d', query: '' });
});

test('the next build starts from what the last one held, minus what it no longer declares', () => {
  const scope: Record<string, unknown> = {};
  holdShared(VALUES, scope).set({ range: '90d', query: 'acme' });
  assert.deepEqual(holdShared(VALUES, scope).get(), { range: '90d', query: 'acme' });
  const later = holdShared(
    [
      {
        ...RANGE,
        values: [
          { id: '30d', label: '30 days' },
          { id: '7d', label: '7 days' },
        ],
      },
    ],
    scope,
  );
  assert.deepEqual(later.get(), { range: '30d' });
});
