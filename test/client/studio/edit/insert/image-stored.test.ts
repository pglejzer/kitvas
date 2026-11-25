// What the person is told after an upload, and what a delete does to the grid (pure parts).

import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  deleteResult,
  withoutImage,
} from '../../../../../client/studio/edit/insert/image-delete.ts';
import {
  duplicateMessage,
  type Stored,
  storedMessage,
  storedOf,
} from '../../../../../client/studio/edit/insert/image-stored.ts';

const added = (file: string): Stored => ({ file, duplicate: false });
const same = (file: string): Stored => ({ file, duplicate: true });

test('an answer with duplicate true is kept as a duplicate and one without is a new file', () => {
  assert.deepEqual(storedOf({ file: 'a.png', duplicate: true }), same('a.png'));
  assert.deepEqual(storedOf({ file: 'a.png' }), added('a.png'));
});

test('one image that was already in the draft says so by name', () => {
  assert.deepEqual(storedMessage([same('hero.png')]), duplicateMessage('hero.png'));
  assert.deepEqual(duplicateMessage('hero.png'), {
    key: 'upload.duplicate',
    params: { file: 'hero.png' },
  });
});

test('new images are told by name, or by count when there are several', () => {
  assert.deepEqual(storedMessage([added('a.png')]), {
    key: 'upload.stored',
    params: { file: 'a.png' },
  });
  assert.deepEqual(storedMessage([added('a.png'), added('b.png')]), {
    key: 'upload.storedMany',
    params: { count: 2 },
  });
});

test('several images that were already there are told by count', () => {
  assert.deepEqual(storedMessage([same('a.png'), same('b.png')]), {
    key: 'upload.duplicateMany',
    params: { count: 2 },
  });
});

test('a drop of new and old images says how many of each', () => {
  assert.deepEqual(storedMessage([added('a.png'), same('b.png'), null, same('c.png')]), {
    key: 'upload.mixed',
    params: { added: 1, skipped: 2 },
  });
});

test('refused uploads alone are told nothing more, they have said why', () => {
  assert.equal(storedMessage([null, null]), null);
  assert.equal(storedMessage([]), null);
});

test('a deleted image leaves the grid with a note that names it', () => {
  const result = deleteResult('a.png', {
    ok: true,
    status: 200,
    body: { file: 'a.png', deleted: true, uses: 0 },
  });
  assert.deepEqual(result, {
    remove: true,
    message: { key: 'images.deleted', params: { file: 'a.png' } },
  });
});

test('an image the draft uses stays in the grid and the note counts the places', () => {
  const result = deleteResult('a.png', {
    ok: true,
    status: 200,
    body: { file: 'a.png', deleted: false, uses: 3 },
  });
  assert.deepEqual(result, {
    remove: false,
    message: { key: 'images.inUse', params: { count: 3 } },
  });
});

test('a file the server no longer has leaves the grid, any other failure keeps it', () => {
  const gone = deleteResult('a.png', { ok: false, status: 404, code: 'IMAGE_NOT_FOUND' });
  assert.equal(gone.remove, true);
  const failed = deleteResult('a.png', { ok: false, status: 0, code: null });
  assert.deepEqual(failed, {
    remove: false,
    message: { key: 'images.deleteFailed', params: { file: 'a.png' } },
  });
  assert.equal(deleteResult('a.png', { ok: false, status: 403, code: null }).remove, false);
});

test('the grid after a delete lacks that file only, in the same order', () => {
  assert.deepEqual(withoutImage(['a.png', 'b.png', 'c.png'], 'b.png'), ['a.png', 'c.png']);
  assert.deepEqual(withoutImage(['a.png'], 'z.png'), ['a.png']);
  assert.deepEqual(withoutImage([], 'a.png'), []);
});
