import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  checkSharedValues,
  readSharedValues,
  sharedValuesPath,
} from '../../../src/drafts/index.ts';
import { shopDraft } from '../../helpers/draft/drafts.ts';

const FILE = 'v1/src/json/shared.json';

test('the file sits in the version folder', () => {
  assert.equal(sharedValuesPath('v2'), 'v2/src/json/shared.json');
});

test('a missing file reads as none and is no problem; a file that is not JSON is one', () => {
  const { store } = shopDraft();
  assert.deepEqual(readSharedValues(store, 'shop', 'v1'), []);
  assert.deepEqual(checkSharedValues(store, 'shop', 'v1'), []);

  store.writeText('shop', FILE, '{ not json');
  assert.deepEqual(readSharedValues(store, 'shop', 'v1'), []);
  assert.deepEqual(
    checkSharedValues(store, 'shop', 'v1').map((issue) => issue.key),
    ['draftIssue.sharedInvalid'],
  );
});

test('a good file reads in the order of the file', () => {
  const { store } = shopDraft();
  store.writeText(
    'shop',
    FILE,
    JSON.stringify({
      schemaVersion: 1,
      values: [
        { id: 'query', label: 'Search', default: 'a' },
        {
          id: 'range',
          label: 'Range',
          default: '30d',
          values: [
            { id: '30d', label: '30 days' },
            { id: '90d', label: '90 days' },
          ],
        },
      ],
    }),
  );
  assert.deepEqual(
    readSharedValues(store, 'shop', 'v1').map((value) => [value.id, value.values === null]),
    [
      ['query', true],
      ['range', false],
    ],
  );
  assert.deepEqual(checkSharedValues(store, 'shop', 'v1'), []);
});
