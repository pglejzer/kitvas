import assert from 'node:assert/strict';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { test } from 'node:test';
import { addVersion, createDraft, listDrafts, loadDraft } from '../../src/drafts/index.ts';
import { KitvasError } from '../../src/shared/index.ts';
import { NOW, shopDraft, TINY, tempDrafts } from '../helpers/drafts.ts';

const hasCode = (code: string) => (error: unknown) =>
  error instanceof KitvasError && error.code === code;

test('a new draft has draft.json, scaffolds, states and folders by file type', () => {
  const { store, root } = shopDraft();
  const dir = join(root, 'shop');
  assert.equal(store.dir('shop'), dir);
  assert.deepEqual(loadDraft(store, 'shop'), {
    schemaVersion: 1,
    slug: 'shop',
    title: 'Shop',
    kind: 'screen',
    kit: TINY,
    createdAt: '2026-11-22T10:00:00.000Z',
    versions: [{ number: 1, createdAt: '2026-11-22T10:00:00.000Z' }],
  });
  assert.match(readFileSync(join(dir, 'v1', 'md', 'brief.md'), 'utf8'), /^# Brief: Shop\n/);
  assert.match(readFileSync(join(dir, 'v1', 'md', 'layout.md'), 'utf8'), /^# Layout: Shop\n/);
  assert.equal(
    (
      JSON.parse(readFileSync(join(dir, 'v1', 'src', 'json', 'states.json'), 'utf8')) as {
        default: string;
      }
    ).default,
    'filled',
  );
  for (const folder of ['src/tsx/sections', 'src/scss/sections', 'src/img']) {
    assert.ok(existsSync(join(dir, 'v1', folder)), folder);
  }
});

test('a bad slug or an existing draft is refused', () => {
  const { store } = shopDraft();
  const input = { title: 'X', kit: TINY, now: NOW };
  assert.throws(() => createDraft(store, { ...input, slug: 'Bad Slug' }), hasCode('DRAFT_INVALID'));
  assert.throws(() => createDraft(store, { ...input, slug: '../x' }), hasCode('DRAFT_INVALID'));
  assert.throws(() => createDraft(store, { ...input, slug: 'shop' }), hasCode('DRAFT_EXISTS'));
});

test('loading: missing is DRAFT_NOT_FOUND, broken is DRAFT_INVALID', () => {
  const { store, root } = shopDraft();
  assert.throws(() => loadDraft(store, 'nope'), hasCode('DRAFT_NOT_FOUND'));
  assert.throws(() => loadDraft(store, '../shop'), hasCode('DRAFT_NOT_FOUND'));
  writeFileSync(join(root, 'shop', 'draft.json'), '{not json');
  assert.throws(() => loadDraft(store, 'shop'), hasCode('DRAFT_INVALID'));
  writeFileSync(join(root, 'shop', 'draft.json'), '{"schemaVersion":1}');
  assert.throws(() => loadDraft(store, 'shop'), hasCode('DRAFT_INVALID'));
});

test('a new version copies md and src, not build', () => {
  const { store, root } = shopDraft();
  const dir = join(root, 'shop');
  store.writeText('shop', 'v1/src/tsx/sections/Hero.tsx', 'export const Hero = () => null;\n');
  store.writeText('shop', 'v1/build/html/index.html', '<p>built</p>');
  const later = new Date('2026-11-23T09:00:00.000Z');
  assert.deepEqual(addVersion(store, 'shop', later), { slug: 'shop', version: 2 });
  assert.ok(existsSync(join(dir, 'v2', 'md', 'brief.md')));
  assert.ok(existsSync(join(dir, 'v2', 'src', 'tsx', 'sections', 'Hero.tsx')));
  assert.ok(existsSync(join(dir, 'v2', 'src', 'json', 'states.json')));
  assert.equal(existsSync(join(dir, 'v2', 'build')), false);
  assert.deepEqual(loadDraft(store, 'shop').versions, [
    { number: 1, createdAt: '2026-11-22T10:00:00.000Z' },
    { number: 2, createdAt: '2026-11-23T09:00:00.000Z' },
  ]);
  assert.equal(addVersion(store, 'shop', later).version, 3);
});

test('lists drafts, valid or not, and an empty workspace', () => {
  assert.deepEqual(listDrafts(tempDrafts().store), []);
  const { store, root } = shopDraft();
  createDraft(store, { slug: 'about', title: 'About', kit: TINY, now: NOW });
  writeFileSync(join(root, 'about', 'draft.json'), '{}');
  addVersion(store, 'shop', NOW);
  assert.deepEqual(listDrafts(store), [
    { slug: 'about', title: null, kit: null, version: 0, valid: false },
    { slug: 'shop', title: 'Shop', kit: 'tiny', version: 2, valid: true },
  ]);
});

test('the store never reads or writes outside a draft folder', () => {
  const { store } = shopDraft();
  assert.equal(store.exists('shop', '../about/draft.json'), false);
  assert.equal(store.readText('shop', '../../outside.txt'), undefined);
  assert.throws(() => store.writeText('shop', '../outside.txt', 'x'), hasCode('DRAFT_INVALID'));
  assert.throws(() => store.makeDir('shop', '../../outside'), hasCode('DRAFT_INVALID'));
});
