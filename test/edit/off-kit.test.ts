import assert from 'node:assert/strict';
import { test } from 'node:test';
import { offKitValues } from '../../src/edit/app/off-kit.ts';
import { createFolderKitStore } from '../../src/kit/adapters/folder-store.ts';
import { GOOD_LAYOUT, shopDraft } from '../helpers/drafts.ts';
import { FIXTURE_KITS } from '../helpers/kits.ts';

const kits = createFolderKitStore(FIXTURE_KITS);

const HERO = [
  '.hero {',
  '  padding: 13px; /* off-kit */',
  '  gap: var(--kit-space-sm);',
  '  outline-offset: 1px; /* off-kit */',
  '}',
  '',
].join('\n');

const SUMMARY = [
  '.summary {',
  '  background-color: #1e2125; /* off-kit */',
  '}',
  '',
  '.total {',
  '  margin: 30px; /* off-kit */',
  '}',
  '',
].join('\n');

function draftWithStyles() {
  const { store } = shopDraft();
  store.writeText('shop', 'v1/md/layout.md', GOOD_LAYOUT);
  store.writeText('shop', 'v1/src/scss/sections/hero.scss', HERO);
  store.writeText('shop', 'v1/src/scss/sections/_order-summary.scss', SUMMARY);
  return store;
}

test('lists every raw value of the section files, with the nearest token', () => {
  const result = offKitValues({ drafts: draftWithStyles(), kits }, 'shop');
  assert.equal(result.version, 1);
  const padding = result.items.find((item) => item.property === 'padding');
  assert.equal(padding?.file, 'src/scss/sections/hero.scss');
  assert.equal(padding?.className, 'hero');
  assert.equal(padding?.value, '13px');
  assert.equal(padding?.nearest?.path, 'space.sm');
  assert.equal(padding?.nearest?.var, '--kit-space-sm');
  assert.equal(padding?.nearest?.css, '8px');
});

test('a value that is already a token is not listed', () => {
  const result = offKitValues({ drafts: draftWithStyles(), kits }, 'shop');
  assert.equal(
    result.items.some((item) => item.property === 'gap'),
    false,
  );
});

test('a property outside the editor list has no nearest token', () => {
  const result = offKitValues({ drafts: draftWithStyles(), kits }, 'shop');
  const offset = result.items.find((item) => item.property === 'outline-offset');
  assert.equal(offset?.value, '1px');
  assert.equal(offset?.nearest, null);
});

test('reads a partial file and lists the rules of every class in it', () => {
  const result = offKitValues({ drafts: draftWithStyles(), kits }, 'shop');
  const summary = result.items.filter((item) => item.file.endsWith('_order-summary.scss'));
  assert.deepEqual(summary.map((item) => item.className).sort(), ['summary', 'total']);
  const colour = summary.find((item) => item.property === 'background-color');
  assert.ok(['color.ink', 'color.accent'].includes(colour?.nearest?.path ?? ''));
});

test('a draft without section styles has an empty list', () => {
  const { store } = shopDraft();
  store.writeText('shop', 'v1/md/layout.md', GOOD_LAYOUT);
  assert.deepEqual(offKitValues({ drafts: store, kits }, 'shop').items, []);
});

test('a draft without a layout has an empty list', () => {
  const { store } = shopDraft();
  assert.deepEqual(offKitValues({ drafts: store, kits }, 'shop').items, []);
});

test('a missing draft throws DRAFT_NOT_FOUND', () => {
  const { store } = shopDraft();
  assert.throws(
    () => offKitValues({ drafts: store, kits }, 'nope'),
    (error) => error instanceof Error && 'code' in error && error.code === 'DRAFT_NOT_FOUND',
  );
});
