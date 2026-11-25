import assert from 'node:assert/strict';
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { test } from 'node:test';
import { createImageStore } from '../../src/edit/adapters/image-files.ts';
import { MAX_IMAGE_BYTES } from '../../src/studio/api/images/image-schemas.ts';
import { shopDraft } from '../helpers/drafts.ts';
import { call, studioOver, writeFakeBuild } from '../helpers/studio.ts';

type Problem = { code: string };
type Stored = { version: number; file: string; duplicate?: boolean };

const json = <T>(text: string): T => JSON.parse(text) as T;

const PNG = Buffer.concat([
  Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
  Buffer.from('a tiny image'),
]);
const JPEG = Buffer.from([0xff, 0xd8, 0xff, 0xe0, 1, 2, 3]);
const SVG = Buffer.from('<svg xmlns="http://www.w3.org/2000/svg"><script>1</script></svg>');

async function imageStudio(withStore = true) {
  const { store, root } = shopDraft();
  writeFakeBuild(store);
  const { studio, errors } = await studioOver(
    store,
    {},
    withStore ? { imageStore: createImageStore(store) } : {},
  );
  const auth = { authorization: `Bearer ${studio.token}` };
  const write = { ...auth, origin: studio.url, 'content-type': 'application/json' };
  const upload = (body: unknown, headers: Record<string, string> = write, slug = 'shop') =>
    call(studio.port, {
      method: 'POST',
      path: `/api/v1/drafts/${slug}/images`,
      headers,
      body: JSON.stringify(body),
    });
  const folder = join(root, 'shop', 'v1', 'src', 'img');
  return { studio, errors, upload, folder };
}

const request = (bytes: Buffer, type: string, name = 'Hero Shot.PNG') => ({
  name,
  type,
  data: bytes.toString('base64'),
});

test('an image is stored in the latest version with a safe name, the bytes as sent', async () => {
  const { studio, errors, upload, folder } = await imageStudio();
  try {
    const answer = await upload(request(PNG, 'image/png'));
    assert.equal(answer.status, 201, answer.text);
    assert.deepEqual(json<Stored>(answer.text), { version: 1, file: 'hero-shot.png' });
    assert.deepEqual(readFileSync(join(folder, 'hero-shot.png')), PNG);
    // Other bytes under the same name are a new file, never over the first.
    const other = Buffer.concat([PNG, Buffer.from([0])]);
    const second = await upload(request(other, 'image/png'));
    assert.equal(json<Stored>(second.text).file, 'hero-shot-2.png');
    // The same bytes again are the file already there, and nothing is written.
    const again = await upload(request(PNG, 'image/png'));
    assert.equal(again.status, 200, again.text);
    assert.deepEqual(json<Stored>(again.text), {
      version: 1,
      file: 'hero-shot.png',
      duplicate: true,
    });
    assert.deepEqual(readdirSync(folder).sort(), ['hero-shot-2.png', 'hero-shot.png']);
  } finally {
    await studio.close();
  }
  assert.deepEqual(errors, []);
});

test('a name with a path stays inside the version folder', async () => {
  const { studio, errors, upload, folder } = await imageStudio();
  try {
    const answer = await upload(request(JPEG, 'image/jpeg', '../../../../escape.jpeg'));
    assert.equal(answer.status, 201, answer.text);
    assert.equal(json<Stored>(answer.text).file, 'escape.jpg');
    assert.deepEqual(readdirSync(folder), ['escape.jpg']);
    assert.equal(existsSync(join(folder, '..', '..', '..', '..', 'escape.jpg')), false);
  } finally {
    await studio.close();
  }
  assert.deepEqual(errors, []);
});

test('bytes that are not the type they claim are refused and nothing is written', async () => {
  const { studio, errors, upload, folder } = await imageStudio();
  try {
    const answer = await upload(request(JPEG, 'image/png'));
    assert.equal(answer.status, 422);
    assert.equal(json<Problem>(answer.text).code, 'IMAGE_CONTENT_MISMATCH');
    const notBase64 = await upload({ name: 'a.png', type: 'image/png', data: 'not base64!' });
    assert.equal(json<Problem>(notBase64.text).code, 'IMAGE_CONTENT_MISMATCH');
    assert.deepEqual(readdirSync(folder), []);
  } finally {
    await studio.close();
  }
  assert.deepEqual(errors, []);
});

test('an SVG is refused: as a type, and as bytes under another type', async () => {
  const { studio, errors, upload, folder } = await imageStudio();
  try {
    const asType = await upload(request(SVG, 'image/svg+xml', 'logo.svg'));
    assert.equal(asType.status, 422);
    assert.equal(json<Problem>(asType.text).code, 'BODY_INVALID');
    const disguised = await upload(request(SVG, 'image/png', 'logo.png'));
    assert.equal(disguised.status, 415);
    assert.equal(json<Problem>(disguised.text).code, 'IMAGE_TYPE_UNSUPPORTED');
    assert.deepEqual(readdirSync(folder), []);
  } finally {
    await studio.close();
  }
  assert.deepEqual(errors, []);
});

test('a file over 5 MB is refused; one of exactly 5 MB is taken', async () => {
  const { studio, errors, upload, folder } = await imageStudio();
  try {
    const head = PNG.subarray(0, 8);
    const justOver = Buffer.concat([head, Buffer.alloc(MAX_IMAGE_BYTES + 1 - head.length)]);
    const over = await upload(request(justOver, 'image/png', 'big.png'));
    assert.equal(over.status, 413);
    assert.equal(json<Problem>(over.text).code, 'IMAGE_TOO_LARGE');
    assert.deepEqual(readdirSync(folder), []);
    const exact = Buffer.concat([head, Buffer.alloc(MAX_IMAGE_BYTES - head.length)]);
    const fits = await upload(request(exact, 'image/png', 'fits.png'));
    assert.equal(fits.status, 201, fits.text.slice(0, 200));
    assert.deepEqual(readdirSync(folder), ['fits.png']);
  } finally {
    await studio.close();
  }
  assert.deepEqual(errors, []);
});

test('an upload needs the write checks, a draft that exists and a store', async () => {
  const { studio, errors, upload } = await imageStudio();
  try {
    const noOrigin = {
      authorization: `Bearer ${studio.token}`,
      'content-type': 'application/json',
    };
    assert.equal((await upload(request(PNG, 'image/png'), noOrigin)).status, 403);
    const noToken = { origin: studio.url, 'content-type': 'application/json' };
    assert.equal((await upload(request(PNG, 'image/png'), noToken)).status, 401);
    const missing = await upload(request(PNG, 'image/png'), undefined, 'nope');
    assert.equal(missing.status, 404);
    assert.equal(json<Problem>(missing.text).code, 'DRAFT_NOT_FOUND');
    const unknownField = await upload({ ...request(PNG, 'image/png'), path: '../x' });
    assert.equal(unknownField.status, 422);
  } finally {
    await studio.close();
  }
  assert.deepEqual(errors, []);
});

test('without an image store the upload answers 500 and writes nothing', async () => {
  const { studio, upload, folder } = await imageStudio(false);
  try {
    const answer = await upload(request(PNG, 'image/png'));
    assert.equal(answer.status, 500);
    assert.deepEqual(readdirSync(folder), []);
  } finally {
    await studio.close();
  }
});

test('the image store writes a plain name only, and never over a file', () => {
  const { store, root } = shopDraft();
  const images = createImageStore(store);
  images.write('shop', 1, 'a.png', PNG);
  assert.deepEqual(images.list('shop', 1), ['a.png']);
  assert.throws(() => images.write('shop', 1, 'a.png', JPEG), { code: 'EEXIST' });
  for (const name of ['../a.png', 'A.png', 'a/b.png', 'a.svg', '.png', 'a b.png', '..\\a.png']) {
    assert.throws(() => images.write('shop', 1, name, PNG), { code: 'USAGE' }, name);
  }
  assert.throws(() => images.write('shop', 9, 'b.png', PNG), { code: 'VERSION_NOT_FOUND' });
  assert.deepEqual(readFileSync(join(root, 'shop', 'v1', 'src', 'img', 'a.png')), PNG);
  assert.equal(existsSync(join(root, 'shop', 'v9')), false);
});
