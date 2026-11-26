import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createImageStore } from '../../../../src/edit/adapters/image-files.ts';
import { shopDraft } from '../../../helpers/draft/drafts.ts';
import { call, studioOver, writeFakeBuild } from '../../../helpers/studio/studio.ts';

type Listed = { version: number; files: string[] };

const PNG = Buffer.concat([
  Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
  Buffer.from('a tiny image'),
]);

async function listStudio(withStore = true) {
  const { store } = shopDraft();
  writeFakeBuild(store);
  const images = createImageStore(store);
  const { studio, errors } = await studioOver(store, {}, withStore ? { imageStore: images } : {});
  const list = (headers: Record<string, string>, slug = 'shop') =>
    call(studio.port, { method: 'GET', path: `/api/v1/drafts/${slug}/images`, headers });
  const auth = { authorization: `Bearer ${studio.token}` };
  return { studio, errors, images, list, auth };
}

test('the images of the latest version are listed by name, with the version', async () => {
  const { studio, errors, images, list, auth } = await listStudio();
  try {
    const empty = await list(auth);
    assert.equal(empty.status, 200, empty.text);
    assert.deepEqual(JSON.parse(empty.text) as Listed, { version: 1, files: [] });
    images.write('shop', 1, 'b-photo.png', PNG);
    images.write('shop', 1, 'a-hero.png', PNG);
    const full = await list(auth);
    assert.deepEqual(JSON.parse(full.text) as Listed, {
      version: 1,
      files: ['a-hero.png', 'b-photo.png'],
    });
  } finally {
    await studio.close();
  }
  assert.deepEqual(errors, []);
});

test('listing the images needs the token and a draft that exists', async () => {
  const { studio, errors, list, auth } = await listStudio();
  try {
    assert.equal((await list({})).status, 401);
    const missing = await list(auth, 'nope');
    assert.equal(missing.status, 404);
  } finally {
    await studio.close();
  }
  assert.deepEqual(errors, []);
});

test('without an image store the list answers 500', async () => {
  const { studio, list, auth } = await listStudio(false);
  try {
    assert.equal((await list(auth)).status, 500);
  } finally {
    await studio.close();
  }
});
