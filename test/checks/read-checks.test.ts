import assert from 'node:assert/strict';
import { test } from 'node:test';
import { readChecks } from '../../src/checks/index.ts';
import { type DraftStore, serializeJson } from '../../src/drafts/index.ts';
import { shopDraft } from '../helpers/draft/drafts.ts';
import { checksOf, finding } from '../helpers/studio/findings.ts';

const PATH = 'v1/build/json/checks.json';

test('the saved checks of a version are read back; unknown fields are dropped', () => {
  const { store } = shopDraft();
  assert.equal(readChecks(store, 'shop', 1), undefined);
  const file = checksOf([finding()]);
  store.writeText('shop', PATH, serializeJson({ ...file, extra: 'from a newer kitvas' }));
  assert.deepEqual(readChecks(store, 'shop', 1), file);
});

test('a broken file, another shape, or another draft or version is not used', () => {
  const { store } = shopDraft();
  const unused = [
    '{ not json',
    serializeJson({ schemaVersion: 2 }),
    serializeJson(checksOf([], { version: 2 })),
    serializeJson(checksOf([], { slug: 'other' })),
    serializeJson({ ...checksOf([]), findings: [{ ...finding(), severity: 'later' }] }),
  ];
  for (const text of unused) {
    store.writeText('shop', PATH, text);
    assert.equal(readChecks(store, 'shop', 1), undefined, text);
  }
});

test('an error kitvas did not raise is passed on', () => {
  const store = {
    readJson: () => {
      throw new Error('disk');
    },
  } as unknown as DraftStore;
  assert.throws(() => readChecks(store, 'shop', 1), /disk/);
});
