import assert from 'node:assert/strict';
import { existsSync, readdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { test } from 'node:test';
import {
  createFsDraftStore,
  REPLACE_SUFFIX,
  type ReplaceIo,
} from '../../../src/drafts/adapters/fs-draft-store.ts';
import {
  addVersion,
  createDraft,
  type DraftStore,
  listDrafts,
  loadDraft,
} from '../../../src/drafts/index.ts';
import { KitvasError } from '../../../src/shared/index.ts';
import { NOW, shopDraft, TINY, tempDrafts } from '../../helpers/draft/drafts.ts';

const hasCode = (code: string) => (error: unknown) =>
  error instanceof KitvasError && error.code === code;

const HERO = 'v1/src/tsx/sections/Hero.tsx';
const SCSS = 'v1/src/scss/sections/hero.scss';
const NEW = 'v1/src/tsx/sections/New.tsx';

/** The temporary files `replaceAll` left anywhere in a draft. */
const leftovers = (root: string): string[] =>
  readdirSync(join(root, 'shop'), { recursive: true, encoding: 'utf8' }).filter((name) =>
    name.endsWith(REPLACE_SUFFIX),
  );

/** A `shop` draft whose store makes some of its `replaceAll` calls through `io`. */
function shopWith(io: Partial<ReplaceIo>): { store: DraftStore; root: string } {
  const { root } = tempDrafts();
  const store = createFsDraftStore(root, io);
  createDraft(store, { slug: 'shop', title: 'Shop', kit: TINY, now: NOW });
  store.writeText('shop', HERO, 'hero 1\n');
  store.writeText('shop', SCSS, '.hero {}\n');
  return { store, root };
}

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

test('replaceAll writes every file, a new one too, and leaves no temporary file', () => {
  const { store, root } = shopWith({});
  store.replaceAll('shop', [
    { relPath: HERO, text: 'hero 2\n' },
    { relPath: NEW, text: 'new\n' },
    { relPath: SCSS, text: '.hero { gap: 0; }\n' },
  ]);
  assert.equal(store.readText('shop', HERO), 'hero 2\n');
  assert.equal(store.readText('shop', NEW), 'new\n');
  assert.equal(store.readText('shop', SCSS), '.hero { gap: 0; }\n');
  assert.deepEqual(leftovers(root), []);
});

test('when a move fails, replaceAll puts back every file it already replaced', () => {
  let moves = 0;
  const { store, root } = shopWith({
    rename(from, to) {
      moves += 1;
      if (moves === 3) throw new Error('disk gone');
      renameSync(from, to);
    },
  });
  const files = [
    { relPath: HERO, text: 'hero 2\n' },
    { relPath: NEW, text: 'new\n' },
    { relPath: SCSS, text: '.hero { gap: 0; }\n' },
  ];
  assert.throws(() => store.replaceAll('shop', files), /disk gone/);
  assert.equal(store.readText('shop', HERO), 'hero 1\n');
  assert.equal(store.exists('shop', NEW), false);
  assert.equal(store.readText('shop', SCSS), '.hero {}\n');
  assert.deepEqual(leftovers(root), []);
});

test('when a temporary file cannot be written, replaceAll changes no file', () => {
  const { store, root } = shopWith({
    write(file, text) {
      if (file.endsWith(`hero.scss${REPLACE_SUFFIX}`)) throw new Error('no space');
      writeFileSync(file, text);
    },
  });
  const files = [
    { relPath: HERO, text: 'hero 2\n' },
    { relPath: SCSS, text: '.hero { gap: 0; }\n' },
  ];
  assert.throws(() => store.replaceAll('shop', files), /no space/);
  assert.equal(store.readText('shop', HERO), 'hero 1\n');
  assert.equal(store.readText('shop', SCSS), '.hero {}\n');
  assert.deepEqual(leftovers(root), []);
});

test('replaceAll refuses a path outside the draft, or one given twice, before writing', () => {
  const { store } = shopWith({});
  const outside = [
    { relPath: HERO, text: 'hero 2\n' },
    { relPath: '../outside.tsx', text: 'x' },
  ];
  assert.throws(() => store.replaceAll('shop', outside), hasCode('DRAFT_INVALID'));
  const twice = [
    { relPath: HERO, text: 'hero 2\n' },
    { relPath: HERO, text: 'hero 3\n' },
  ];
  assert.throws(() => store.replaceAll('shop', twice), hasCode('DRAFT_INVALID'));
  assert.equal(store.readText('shop', HERO), 'hero 1\n');
});
