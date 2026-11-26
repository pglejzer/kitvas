import assert from 'node:assert/strict';
import { test } from 'node:test';
import { addVersion, DEFAULT_STATES, versionInfo } from '../../../src/drafts/index.ts';
import { KitvasError } from '../../../src/shared/index.ts';
import { NOW, shopDraft } from '../../helpers/draft/drafts.ts';

test('a version: its date, whether it is built, its states', () => {
  const { store } = shopDraft();
  const first = versionInfo(store, 'shop', 1);
  assert.equal(first.slug, 'shop');
  assert.equal(first.number, 1);
  assert.equal(first.createdAt, NOW.toISOString());
  assert.equal(first.built, false);
  assert.deepEqual(first.states, DEFAULT_STATES);
  store.writeText('shop', 'v1/build/html/index.html', '<!doctype html>');
  assert.equal(versionInfo(store, 'shop', 1).built, true);
});

test('states fall back to the default when states.json is not valid', () => {
  const { store } = shopDraft();
  store.writeText('shop', 'v1/src/json/states.json', '{"schemaVersion": 2}');
  assert.deepEqual(versionInfo(store, 'shop', 1).states, DEFAULT_STATES);
});

test('a version the draft does not have is an error', () => {
  const { store } = shopDraft();
  addVersion(store, 'shop', NOW);
  assert.equal(versionInfo(store, 'shop', 2).number, 2);
  assert.throws(
    () => versionInfo(store, 'shop', 3),
    (error: unknown) => error instanceof KitvasError && error.code === 'VERSION_NOT_FOUND',
  );
});
