import assert from 'node:assert/strict';
import { rmSync, utimesSync } from 'node:fs';
import { join } from 'node:path';
import { test } from 'node:test';
import { addVersion, createDraft, draftChangedAt } from '../../../src/drafts/index.ts';
import { TINY, tempDrafts } from '../../helpers/draft/drafts.ts';

/** Far ahead of any file written while the tests run, so a date given to a draft wins over it. */
const FUTURE = new Date('2098-01-01T00:00:00.000Z');
const LATER = new Date('2099-06-01T12:00:00.000Z');
const PAST = new Date('2020-01-01T00:00:00.000Z');

/** Sets the modification time of a file of a draft. */
function touch(root: string, relPath: string, time: Date): void {
  utimesSync(join(root, 'shop', relPath), time, time);
}

test('a draft is changed when its latest version was made, if nothing was saved after that', () => {
  const { store } = tempDrafts();
  createDraft(store, { slug: 'shop', title: 'Shop', kit: TINY, now: FUTURE });
  assert.equal(draftChangedAt(store, 'shop').getTime(), FUTURE.getTime());
  addVersion(store, 'shop', LATER);
  assert.equal(draftChangedAt(store, 'shop').getTime(), LATER.getTime());
});

test('a file under v2/src written later than the version wins', () => {
  const { store, root } = tempDrafts();
  createDraft(store, { slug: 'shop', title: 'Shop', kit: TINY, now: PAST });
  addVersion(store, 'shop', PAST);
  store.writeText('shop', 'v2/src/tsx/sections/Hero.tsx', 'hero\n');
  touch(root, 'v2/src/tsx/sections/Hero.tsx', FUTURE);
  const changed = draftChangedAt(store, 'shop');
  assert.ok(Math.abs(changed.getTime() - FUTURE.getTime()) < 5);
});

test('a file of an older version does not count', () => {
  const { store, root } = tempDrafts();
  createDraft(store, { slug: 'shop', title: 'Shop', kit: TINY, now: PAST });
  store.writeText('shop', 'v1/src/tsx/sections/Hero.tsx', 'hero\n');
  touch(root, 'v1/src/tsx/sections/Hero.tsx', FUTURE);
  addVersion(store, 'shop', PAST);
  touch(root, 'v2/src/tsx/sections/Hero.tsx', PAST);
  assert.ok(draftChangedAt(store, 'shop').getTime() < FUTURE.getTime());
});

test('a draft with no src folder falls back to the version time', () => {
  const { store, root } = tempDrafts();
  createDraft(store, { slug: 'shop', title: 'Shop', kit: TINY, now: FUTURE });
  rmSync(join(root, 'shop', 'v1', 'src'), { recursive: true, force: true });
  assert.equal(store.modifiedAt('shop', 'v1/src'), undefined);
  assert.equal(draftChangedAt(store, 'shop').getTime(), FUTURE.getTime());
});

test('the store reads the newest file at any depth, and nothing for a missing folder', () => {
  const { store, root } = tempDrafts();
  createDraft(store, { slug: 'shop', title: 'Shop', kit: TINY, now: PAST });
  store.writeText('shop', 'v1/src/a.txt', 'a');
  store.writeText('shop', 'v1/src/deep/er/b.txt', 'b');
  touch(root, 'v1/src/a.txt', PAST);
  touch(root, 'v1/src/deep/er/b.txt', FUTURE);
  const newest = store.modifiedAt('shop', 'v1/src');
  assert.ok(newest !== undefined && Math.abs(newest.getTime() - FUTURE.getTime()) < 5);
  assert.equal(store.modifiedAt('shop', 'v9/src'), undefined);
  assert.equal(store.modifiedAt('../outside', 'v1'), undefined);
});
