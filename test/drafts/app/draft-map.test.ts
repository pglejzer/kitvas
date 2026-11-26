import assert from 'node:assert/strict';
import { test } from 'node:test';
import { addVersion, draftMap, draftsMap, type MapSources } from '../../../src/drafts/index.ts';
import { GOOD_LAYOUT, NOW, shopDraft } from '../../helpers/draft/drafts.ts';

const ELEMENT = {
  id: 'Hero/Button.0',
  file: 'src/tsx/Hero.tsx',
  line: 4,
  column: 7,
  tag: 'Button',
};
const sources: MapSources = {
  checked: () => ({ fix: 1, review: 2 }),
  elements: (raw) => (raw === undefined ? [] : [ELEMENT]),
};

test('the map of a draft that is not built has sections and no elements', () => {
  const { store } = shopDraft();
  store.writeText('shop', 'v1/md/layout.md', GOOD_LAYOUT);
  store.writeText('shop', 'v1/src/tsx/sections/Hero.tsx', 'x');
  store.writeText('shop', 'v1/src/scss/sections/hero.scss', 'x');
  store.writeText('shop', 'v1/src/tsx/sections/OrderSummary.tsx', 'x');
  assert.deepEqual(draftMap(store, sources, 'shop'), {
    slug: 'shop',
    version: 1,
    built: false,
    sections: [
      { id: 'hero', files: ['v1/src/tsx/sections/Hero.tsx', 'v1/src/scss/sections/hero.scss'] },
      { id: 'order-summary', files: ['v1/src/tsx/sections/OrderSummary.tsx'] },
    ],
    elements: [],
    checked: null,
  });
});

test('a built draft lists its elements and the counts of its check', () => {
  const { store } = shopDraft();
  store.writeText('shop', 'v1/build/html/index.html', '<html></html>');
  store.writeText('shop', 'v1/build/json/ids.json', '{"ids":{}}');
  const map = draftMap(store, sources, 'shop');
  assert.equal(map.built, true);
  assert.deepEqual(map.sections, []);
  assert.deepEqual(map.elements, [ELEMENT]);
  assert.deepEqual(map.checked, { fix: 1, review: 2 });
});

test('a broken id file leaves the elements out instead of failing the map', () => {
  const { store } = shopDraft();
  store.writeText('shop', 'v1/build/html/index.html', '<html></html>');
  store.writeText('shop', 'v1/build/json/ids.json', '{"ids":');
  const map = draftMap(store, sources, 'shop');
  assert.equal(map.built, true);
  assert.deepEqual(map.elements, []);
  assert.deepEqual(map.checked, { fix: 1, review: 2 });
});

test('the map follows the latest version', () => {
  const { store } = shopDraft();
  store.writeText('shop', 'v1/md/layout.md', GOOD_LAYOUT);
  addVersion(store, 'shop', NOW);
  const map = draftMap(store, sources, 'shop');
  assert.equal(map.version, 2);
  assert.equal(map.built, false);
});

test('the map of the workspace has one row per draft', () => {
  const { store } = shopDraft();
  assert.deepEqual(draftsMap(store, sources).drafts, [
    { slug: 'shop', title: 'Shop', version: 1, built: false, checked: null },
  ]);
  store.writeText('shop', 'v1/build/html/index.html', '<html></html>');
  assert.deepEqual(draftsMap(store, sources).drafts[0]?.checked, { fix: 1, review: 2 });
});
