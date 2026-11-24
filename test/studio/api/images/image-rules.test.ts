import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  decodeBase64,
  looksLikeMarkup,
  safeImageName,
  sniffImageType,
} from '../../../../src/studio/api/images/image-rules.ts';

const bytes = (...values: number[]): Uint8Array => new Uint8Array(values);
const text = (value: string): Uint8Array => new TextEncoder().encode(value);

test('each format is told by its first bytes', () => {
  assert.equal(
    sniffImageType(bytes(0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0)),
    'image/png',
  );
  assert.equal(sniffImageType(bytes(0xff, 0xd8, 0xff, 0xe0)), 'image/jpeg');
  assert.equal(sniffImageType(text('GIF89a....')), 'image/gif');
  assert.equal(sniffImageType(text('GIF87a....')), 'image/gif');
  assert.equal(sniffImageType(text('RIFF\0\0\0\0WEBPVP8 ')), 'image/webp');
  assert.equal(sniffImageType(text('\0\0\0\x1cftypavif\0\0\0\0')), 'image/avif');
  assert.equal(sniffImageType(text('\0\0\0\x1cftypavis\0\0\0\0')), 'image/avif');
});

test('bytes that are no image of the five are none, whatever they claim', () => {
  assert.equal(sniffImageType(text('hello world')), null);
  assert.equal(sniffImageType(text('\0\0\0\x1cftypmp42')), null);
  assert.equal(sniffImageType(text('RIFF\0\0\0\0WAVEfmt ')), null);
  assert.equal(sniffImageType(bytes()), null);
  // A PNG signature cut short is not a PNG.
  assert.equal(sniffImageType(bytes(0x89, 0x50, 0x4e)), null);
});

test('SVG and HTML are told as markup, with or without a byte order mark or spaces', () => {
  assert.equal(looksLikeMarkup(text('<svg xmlns="http://www.w3.org/2000/svg"/>')), true);
  assert.equal(looksLikeMarkup(text('  \n<?xml version="1.0"?><svg/>')), true);
  assert.equal(looksLikeMarkup(text('\uFEFF<svg/>')), true);
  assert.equal(looksLikeMarkup(text('<!doctype html><script>1</script>')), true);
  assert.equal(looksLikeMarkup(bytes(0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a)), false);
});

test('base64 is read only when it is base64', () => {
  assert.deepEqual([...(decodeBase64('aGk=') ?? [])], [104, 105]);
  assert.deepEqual([...(decodeBase64('') ?? [1])], []);
  assert.equal(decodeBase64('aGk'), null);
  assert.equal(decodeBase64('aGk!'), null);
  assert.equal(decodeBase64('a b='), null);
  assert.equal(decodeBase64('data:image/png;base64,aGk='), null);
});

test('a stored name is lower case, letters, digits and hyphens, with the type extension', () => {
  assert.equal(safeImageName('Hero Banner (2).PNG', 'image/png', []), 'hero-banner-2.png');
  assert.equal(safeImageName('photo.jpeg', 'image/jpeg', []), 'photo.jpg');
  assert.equal(safeImageName('a.b.c.webp', 'image/webp', []), 'a-b-c.webp');
  assert.equal(safeImageName('logo', 'image/avif', []), 'logo.avif');
  assert.equal(safeImageName('anim.gif', 'image/gif', []), 'anim.gif');
});

test('a name with a path, dots or nothing usable never leaves its folder', () => {
  assert.equal(safeImageName('../../etc/passwd.png', 'image/png', []), 'passwd.png');
  assert.equal(safeImageName('C:\\Users\\me\\..\\secret.png', 'image/png', []), 'secret.png');
  assert.equal(safeImageName('....png', 'image/png', []), 'image.png');
  assert.equal(safeImageName('   .png', 'image/png', []), 'image.png');
  assert.equal(safeImageName('日本語.png', 'image/png', []), 'image.png');
  for (const name of ['../x.png', '/abs.png', 'a/b/c.png', '..\\x.png', '.hidden.png']) {
    const stored = safeImageName(name, 'image/png', []);
    assert.match(stored, /^[a-z0-9][a-z0-9-]*\.png$/, stored);
  }
});

test('a name that is taken gets -2, -3 and on, compared without case', () => {
  assert.equal(safeImageName('hero.png', 'image/png', ['hero.png']), 'hero-2.png');
  assert.equal(safeImageName('hero.png', 'image/png', ['hero.png', 'hero-2.png']), 'hero-3.png');
  assert.equal(safeImageName('hero.png', 'image/png', ['HERO.PNG']), 'hero-2.png');
  assert.equal(safeImageName('hero.png', 'image/png', ['hero.jpg']), 'hero.png');
});

test('a long name is cut so the stored one stays short', () => {
  const stored = safeImageName(`${'a'.repeat(300)}.png`, 'image/png', []);
  assert.equal(stored, `${'a'.repeat(60)}.png`);
  assert.ok(stored.length <= 100);
});
