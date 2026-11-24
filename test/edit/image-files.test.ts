import assert from 'node:assert/strict';
import { mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { test } from 'node:test';
import { createImageFiles } from '../../src/edit/adapters/image-files.ts';
import { shopDraft, writeVersionFiles } from '../helpers/drafts.ts';

test('lists the files of a version src/img folder, sorted, and no folders', () => {
  const { store } = shopDraft();
  writeVersionFiles(store, 'shop', 1, {
    'src/img/hero.png': 'png',
    'src/img/a-logo.svg': '<svg/>',
    'src/img/nested/deep.png': 'png',
  });
  const images = createImageFiles(store);
  assert.deepEqual(images('shop', 1), ['a-logo.svg', 'hero.png']);
});

test('a version without the folder, or a draft that is not there, lists nothing', () => {
  const { store } = shopDraft();
  const images = createImageFiles(store);
  assert.deepEqual(images('shop', 1), []);
  assert.deepEqual(images('shop', 7), []);
  assert.deepEqual(images('gone', 1), []);
  // An empty folder is no error either.
  mkdirSync(join(store.dir('shop'), 'v1', 'src', 'img'), { recursive: true });
  assert.deepEqual(images('shop', 1), []);
});
