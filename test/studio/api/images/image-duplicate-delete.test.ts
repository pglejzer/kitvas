import assert from 'node:assert/strict';
import { existsSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { test } from 'node:test';
import { createImageStore } from '../../../../src/edit/adapters/image-files.ts';
import { countUses, findDuplicate } from '../../../../src/studio/api/images/image-rules.ts';
import { shopDraft, writeVersionFiles } from '../../../helpers/draft/drafts.ts';
import { call, studioOver, writeFakeBuild } from '../../../helpers/studio/studio.ts';

type Problem = { code: string };
type Stored = { version: number; file: string; duplicate?: true };
type Deleted = { version: number; file: string; deleted: boolean; uses: number };

const json = <T>(text: string): T => JSON.parse(text) as T;

const PNG = Buffer.concat([
  Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
  Buffer.from('a tiny image'),
]);
const OTHER = Buffer.concat([PNG.subarray(0, 8), Buffer.from('a different image')]);
// Same length as PNG, other bytes: the length alone never makes a duplicate.
const SAME_LENGTH = Buffer.concat([PNG.subarray(0, 8), Buffer.from('a tiny imagf')]);

async function imageStudio() {
  const { store, root } = shopDraft();
  writeFakeBuild(store);
  const images = createImageStore(store);
  const { studio, errors } = await studioOver(store, {}, { imageStore: images });
  const auth = { authorization: `Bearer ${studio.token}` };
  const write = { ...auth, origin: studio.url, 'content-type': 'application/json' };
  const upload = (bytes: Buffer, name: string) =>
    call(studio.port, {
      method: 'POST',
      path: '/api/v1/drafts/shop/images',
      headers: write,
      body: JSON.stringify({ name, type: 'image/png', data: bytes.toString('base64') }),
    });
  const remove = (
    file: string,
    headers: Record<string, string> = write,
    slug = 'shop',
  ): ReturnType<typeof call> =>
    call(studio.port, {
      method: 'DELETE',
      path: `/api/v1/drafts/${slug}/images/${file}`,
      headers,
      body: '{}',
    });
  const folder = join(root, 'shop', 'v1', 'src', 'img');
  return { studio, errors, store, images, upload, remove, folder, auth, write };
}

test('the same bytes under another name are not stored again and the existing file is named', async () => {
  const { studio, errors, upload, folder } = await imageStudio();
  try {
    const first = await upload(PNG, 'hero.png');
    assert.equal(first.status, 201, first.text);
    const again = await upload(PNG, 'a totally different name.png');
    assert.equal(again.status, 200, again.text);
    assert.deepEqual(json<Stored>(again.text), { version: 1, file: 'hero.png', duplicate: true });
    assert.deepEqual(readdirSync(folder), ['hero.png']);
  } finally {
    await studio.close();
  }
  assert.deepEqual(errors, []);
});

test('an image with other bytes is still stored, also when it has the length of a stored one', async () => {
  const { studio, errors, upload, folder } = await imageStudio();
  try {
    await upload(PNG, 'hero.png');
    const other = await upload(OTHER, 'other.png');
    assert.equal(other.status, 201, other.text);
    assert.equal(json<Stored>(other.text).duplicate, undefined);
    const sameLength = await upload(SAME_LENGTH, 'close.png');
    assert.equal(sameLength.status, 201, sameLength.text);
    assert.deepEqual(readdirSync(folder).sort(), ['close.png', 'hero.png', 'other.png']);
  } finally {
    await studio.close();
  }
  assert.deepEqual(errors, []);
});

test('an unused image is deleted from the latest version and leaves the list', async () => {
  const { studio, errors, upload, remove, folder, auth } = await imageStudio();
  try {
    await upload(PNG, 'hero.png');
    await upload(OTHER, 'other.png');
    const answer = await remove('hero.png');
    assert.equal(answer.status, 200, answer.text);
    assert.deepEqual(json<Deleted>(answer.text), {
      version: 1,
      file: 'hero.png',
      deleted: true,
      uses: 0,
    });
    assert.equal(existsSync(join(folder, 'hero.png')), false);
    const listed = await call(studio.port, {
      method: 'GET',
      path: '/api/v1/drafts/shop/images',
      headers: auth,
    });
    assert.deepEqual(json<{ files: string[] }>(listed.text).files, ['other.png']);
    // The bytes can now be uploaded again as a new file.
    assert.equal((await upload(PNG, 'hero.png')).status, 201);
  } finally {
    await studio.close();
  }
  assert.deepEqual(errors, []);
});

test('an image used in a TSX file is not deleted and the answer counts the uses', async () => {
  const { studio, errors, store, upload, remove, folder } = await imageStudio();
  try {
    await upload(PNG, 'hero.png');
    writeVersionFiles(store, 'shop', 1, {
      'src/tsx/Hero.tsx':
        'export const Hero = () => (<div><img src="../img/hero.png" /><img src="../img/hero.png" /></div>);',
    });
    const answer = await remove('hero.png');
    assert.equal(answer.status, 200, answer.text);
    assert.deepEqual(json<Deleted>(answer.text), {
      version: 1,
      file: 'hero.png',
      deleted: false,
      uses: 2,
    });
    assert.equal(existsSync(join(folder, 'hero.png')), true);
  } finally {
    await studio.close();
  }
  assert.deepEqual(errors, []);
});

test('an image used as a background in SCSS is not deleted either', async () => {
  const { studio, errors, store, upload, remove, folder } = await imageStudio();
  try {
    await upload(PNG, 'hero.png');
    writeVersionFiles(store, 'shop', 1, {
      'src/scss/Hero.scss': '.hero { background-image: url(../img/hero.png); }',
    });
    const answer = await remove('hero.png');
    assert.deepEqual(json<Deleted>(answer.text), {
      version: 1,
      file: 'hero.png',
      deleted: false,
      uses: 1,
    });
    assert.equal(existsSync(join(folder, 'hero.png')), true);
  } finally {
    await studio.close();
  }
  assert.deepEqual(errors, []);
});

test('a name that only starts like a used image does not hold it', async () => {
  const { studio, errors, store, upload, remove, folder } = await imageStudio();
  try {
    await upload(PNG, 'hero.png');
    writeVersionFiles(store, 'shop', 1, {
      'src/tsx/Hero.tsx': 'export const a = "../img/hero.png.bak" + "../img/hero-2.png";',
    });
    const answer = await remove('hero.png');
    assert.equal(json<Deleted>(answer.text).deleted, true);
    assert.equal(existsSync(join(folder, 'hero.png')), false);
  } finally {
    await studio.close();
  }
  assert.deepEqual(errors, []);
});

test('deleting a file that is not in the draft answers 404, and a bad name is not a route', async () => {
  const { studio, errors, upload, remove } = await imageStudio();
  try {
    await upload(PNG, 'hero.png');
    const missing = await remove('nope.png');
    assert.equal(missing.status, 404);
    assert.equal(json<Problem>(missing.text).code, 'IMAGE_NOT_FOUND');
    for (const name of ['..%2F..%2Fdraft.json', 'hero.txt', '.png', 'a%5Cb.png', 'a%2Fb.png']) {
      const refused = await remove(name);
      // A name the route's pattern or the target checks turn away: never a delete.
      assert.ok([400, 404].includes(refused.status), `${name}: ${refused.status}`);
    }
    assert.equal((await remove('hero.png', undefined, 'nope')).status, 404);
  } finally {
    await studio.close();
  }
  assert.deepEqual(errors, []);
});

test('a delete needs the token and the studio origin, as every write does', async () => {
  const { studio, errors, upload, remove, folder } = await imageStudio();
  try {
    await upload(PNG, 'hero.png');
    const noOrigin = {
      authorization: `Bearer ${studio.token}`,
      'content-type': 'application/json',
    };
    assert.equal((await remove('hero.png', noOrigin)).status, 403);
    const wrongOrigin = { ...noOrigin, origin: 'http://evil.example' };
    assert.equal((await remove('hero.png', wrongOrigin)).status, 403);
    const noToken = { origin: studio.url, 'content-type': 'application/json' };
    assert.equal((await remove('hero.png', noToken)).status, 401);
    assert.deepEqual(readdirSync(folder), ['hero.png']);
  } finally {
    await studio.close();
  }
  assert.deepEqual(errors, []);
});

test('the image store reads a stored file and refuses a name that leaves the folder', () => {
  const { store } = shopDraft();
  const images = createImageStore(store);
  images.write('shop', 1, 'a.png', PNG);
  assert.deepEqual(images.read('shop', 1, 'a.png'), new Uint8Array(PNG));
  assert.equal(images.read('shop', 1, 'missing.png'), undefined);
  assert.equal(images.read('shop', 1, '../a.png'), undefined);
  assert.throws(() => images.remove('shop', 1, '../a.png'), { code: 'USAGE' });
  images.remove('shop', 1, 'a.png');
  assert.deepEqual(images.list('shop', 1), []);
});

test('the duplicate search skips files that cannot be read', () => {
  const bytes = new Uint8Array([1, 2, 3]);
  const files: Record<string, Uint8Array | undefined> = {
    'a.png': undefined,
    'b.png': new Uint8Array([1, 2, 4]),
    'c.png': new Uint8Array([1, 2, 3]),
  };
  const read = (file: string) => files[file];
  assert.equal(findDuplicate(bytes, ['a.png', 'b.png', 'c.png'], read), 'c.png');
  assert.equal(findDuplicate(bytes, ['a.png', 'b.png'], read), null);
  assert.equal(findDuplicate(bytes, [], read), null);
});

test('uses of an image are counted by whole name in every source', () => {
  const sources = [
    '<img src="../img/a.png" /> <Image src="../img/a.png" />',
    '.x { background: url(../img/a.png) }',
    'url(../img/a.png.bak) "../img/ba.png" ../img/a-2.png',
  ];
  assert.equal(countUses(sources, 'a.png'), 3);
  assert.equal(countUses(sources, 'a-2.png'), 1);
  assert.equal(countUses([], 'a.png'), 0);
});
