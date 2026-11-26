import assert from 'node:assert/strict';
import { readdirSync, renameSync } from 'node:fs';
import { join } from 'node:path';
import { test } from 'node:test';
import {
  createFsDraftStore,
  REPLACE_SUFFIX,
  type ReplaceIo,
} from '../../../src/drafts/adapters/fs-draft-store.ts';
import { createDraft, type DraftStore } from '../../../src/drafts/index.ts';
import { NOW, TINY, tempDrafts } from '../../helpers/draft/drafts.ts';

const HERO = 'v1/src/tsx/sections/Hero.tsx';
const SCSS = 'v1/src/scss/sections/hero.scss';
/** A file that is not there. */
const GONE = 'v1/src/tsx/sections/Gone.tsx';

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

/** A removal first, so the failing rename comes after it. */
const FILES = [
  { relPath: SCSS, text: null },
  { relPath: HERO, text: 'hero 2\n' },
];

/** Renames on the disk, except the calls (counted from 1) that `fails` picks. */
function renamesFailing(fails: (call: number) => boolean): {
  io: Partial<ReplaceIo>;
  calls: () => number;
} {
  let calls = 0;
  const io: Partial<ReplaceIo> = {
    rename(source, target) {
      calls += 1;
      if (fails(calls)) throw new Error('disk gone');
      renameSync(source, target);
    },
  };
  return { io, calls: () => calls };
}

test('replaceAll with text null removes the file beside the ones it writes', () => {
  const { store, root } = shopWith({});
  // A file that is not there is already removed.
  store.replaceAll('shop', [...FILES, { relPath: GONE, text: null }]);
  assert.equal(store.readText('shop', HERO), 'hero 2\n');
  assert.equal(store.exists('shop', SCSS), false);
  assert.equal(store.exists('shop', GONE), false);
  assert.deepEqual(leftovers(root), []);
});

test('a failed rename after a removal puts the removed file back', () => {
  const renames = renamesFailing((call) => call === 2);
  const { store, root } = shopWith(renames.io);
  assert.throws(() => store.replaceAll('shop', FILES), /disk gone/);
  // The removed file was moved aside (1), and moved back (3) after the failure (2).
  assert.equal(renames.calls(), 3);
  assert.equal(store.readText('shop', SCSS), '.hero {}\n');
  assert.equal(store.readText('shop', HERO), 'hero 1\n');
  assert.deepEqual(leftovers(root), []);
});

test('when the rename back fails too, the removed file is written back from memory', () => {
  const renames = renamesFailing((call) => call >= 2);
  const { store, root } = shopWith(renames.io);
  assert.throws(() => store.replaceAll('shop', FILES), /disk gone/);
  assert.equal(renames.calls(), 3);
  assert.equal(store.readText('shop', SCSS), '.hero {}\n');
  assert.equal(store.readText('shop', HERO), 'hero 1\n');
  assert.deepEqual(leftovers(root), []);
});
