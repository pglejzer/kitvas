// The page's side of the image rules (spec 4c, goal 10): the same ones the server holds, checked
// first so a refusal needs no round trip.

import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  firstImage,
  IMAGE_TYPES,
  imageProblem,
  imageTypeOf,
  MAX_IMAGE_BYTES,
  toBase64,
  uploadRefusalKey,
} from '../../../../../client/studio/edit/insert/image-upload.ts';
import {
  MAX_IMAGE_BYTES as SERVER_MAX,
  IMAGE_TYPES as SERVER_TYPES,
} from '../../../../../src/studio/api/images/image-schemas.ts';

const file = (name: string, type: string, size = 1000) => ({ name, type, size });

test('the page and the server agree on the types and the size', () => {
  assert.deepEqual([...IMAGE_TYPES].sort(), Object.keys(SERVER_TYPES).sort());
  assert.equal(MAX_IMAGE_BYTES, SERVER_MAX);
});

test('the five image types are taken by their own type', () => {
  for (const type of IMAGE_TYPES) assert.equal(imageTypeOf(file('x', type)), type);
  assert.equal(imageTypeOf(file('x.png', 'IMAGE/PNG')), 'image/png');
});

test('a browser that leaves the type empty is read by the extension', () => {
  assert.equal(imageTypeOf(file('a.AVIF', '')), 'image/avif');
  assert.equal(imageTypeOf(file('a.jpeg', '')), 'image/jpeg');
  assert.equal(imageTypeOf(file('a.jpg', '')), 'image/jpeg');
  assert.equal(imageTypeOf(file('a.webp', '')), 'image/webp');
  assert.equal(imageTypeOf(file('noextension', '')), null);
});

test('SVG is refused, by its type and by its name, and a type is never overruled by a name', () => {
  assert.equal(imageProblem(file('logo.svg', 'image/svg+xml')), 'type');
  assert.equal(imageProblem(file('logo.svg', '')), 'type');
  assert.equal(imageProblem(file('logo.png', 'image/svg+xml')), 'type');
  assert.equal(imageProblem(file('page.html', 'text/html')), 'type');
  assert.equal(imageProblem(file('doc.pdf', 'application/pdf')), 'type');
});

test('a file over 5 MB or with no bytes is refused; one of exactly 5 MB is taken', () => {
  assert.equal(imageProblem(file('a.png', 'image/png', MAX_IMAGE_BYTES + 1)), 'size');
  assert.equal(imageProblem(file('a.png', 'image/png', 0)), 'empty');
  assert.equal(imageProblem(file('a.png', 'image/png', MAX_IMAGE_BYTES)), null);
  assert.equal(imageProblem(file('a.png', 'image/png', 1)), null);
});

test('of a dropped group the first image is taken', () => {
  assert.equal(firstImage([]), -1);
  assert.equal(firstImage([file('a.svg', 'image/svg+xml'), file('b.txt', 'text/plain')]), -1);
  assert.equal(firstImage([file('a.svg', 'image/svg+xml'), file('b.png', 'image/png')]), 1);
});

test('base64 of a large file is made in pieces and is the same as the whole', () => {
  const bytes = new Uint8Array(100_000).map((_, index) => index % 251);
  assert.equal(toBase64(bytes), Buffer.from(bytes).toString('base64'));
  assert.equal(toBase64(new Uint8Array()), '');
  assert.equal(toBase64(new Uint8Array([104, 105])), 'aGk=');
});

test('each refusal of the server has its own words, and any other is a plain failure', () => {
  assert.equal(uploadRefusalKey({ code: 'IMAGE_TOO_LARGE' }), 'upload.err.size');
  assert.equal(uploadRefusalKey({ code: 'BODY_TOO_LARGE' }), 'upload.err.size');
  assert.equal(uploadRefusalKey({ code: 'IMAGE_TYPE_UNSUPPORTED' }), 'upload.err.type');
  assert.equal(uploadRefusalKey({ code: 'IMAGE_CONTENT_MISMATCH' }), 'upload.err.mismatch');
  assert.equal(uploadRefusalKey({ code: 'BODY_INVALID' }), 'upload.err.failed');
  assert.equal(uploadRefusalKey({ code: null }), 'upload.err.failed');
});
