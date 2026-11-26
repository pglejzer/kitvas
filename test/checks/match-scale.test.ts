import assert from 'node:assert/strict';
import { test } from 'node:test';
import { matchScale, pngSize } from '../../src/checks/domain/kit/match-scale.ts';
import { PIXELS_MAX } from '../../src/checks/index.ts';
import { encodePng } from './adapters/png.ts';

const area = ([width, height]: [number, number], scale: number): number =>
  Math.round(width * scale) * Math.round(height * scale);

/** The first 33 bytes of a PNG that says it is `width` x `height`: enough for `pngSize`. */
function header(width: number, height: number): Buffer {
  const bytes = Buffer.alloc(33);
  Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]).copy(bytes);
  bytes.writeUInt32BE(13, 8);
  bytes.write('IHDR', 12, 'ascii');
  bytes.writeUInt32BE(width, 16);
  bytes.writeUInt32BE(height, 20);
  return bytes;
}

test('a page of 1280 x 9,000 and a reference of 1280 x 3,000 are scaled by one factor', () => {
  const sizes: [number, number][] = [
    [1280, 9000],
    [1280, 3000],
  ];
  const scale = matchScale(sizes, PIXELS_MAX);
  assert.ok(scale < 1);
  // The taller image decides: sqrt(4,000,000 / 11,520,000) = 0.589.
  assert.ok(scale > 0.58 && scale <= 0.5893, String(scale));
  for (const size of sizes) assert.ok(area(size, scale) <= PIXELS_MAX, size.join(' x '));
  assert.equal(matchScale(sizes, PIXELS_MAX), scale);
});

test('images that already fit are not scaled', () => {
  assert.equal(matchScale([[1280, 3000]], PIXELS_MAX), 1);
  assert.equal(matchScale([[1280, 3125]], PIXELS_MAX), 1);
  const phone: [number, number][] = [
    [390, 844],
    [390, 900],
  ];
  assert.equal(matchScale(phone, PIXELS_MAX), 1);
});

test('the factor leaves each image with no more pixels than the limit, whatever its size', () => {
  const sizes: [number, number][] = [
    [1280, 4000],
    [1281, 3126],
    [1919, 2085],
    [390, 20_000],
    [3, 3_000_000],
    [10_000, 10_000],
  ];
  for (const size of sizes) {
    const scale = matchScale([size], PIXELS_MAX);
    const rounded = Math.ceil(size[0] * scale) * Math.ceil(size[1] * scale);
    assert.ok(scale > 0 && scale <= 1, `${size.join(' x ')}: ${scale}`);
    assert.ok(rounded <= PIXELS_MAX, size.join(' x '));
  }
  // A smaller limit is a smaller factor.
  assert.ok(matchScale([[1280, 900]], 100_000) < matchScale([[1280, 900]], 500_000));
});

test('sizes and limits that cannot be used leave the images as they are', () => {
  assert.equal(matchScale([], PIXELS_MAX), 1);
  assert.equal(matchScale([[0, 100]], PIXELS_MAX), 1);
  assert.equal(matchScale([[1280, 9000]], 0), 1);
  assert.equal(matchScale([[1280, 9000]], Number.NaN), 1);
});

test('the size of a PNG is read from its header, and nothing else is a PNG', () => {
  assert.deepEqual(pngSize(encodePng(7, 5, () => [0, 0, 0, 255])), [7, 5]);
  assert.deepEqual(pngSize(header(1280, 9000)), [1280, 9000]);
  assert.equal(pngSize(new Uint8Array(10)), undefined);
  assert.equal(pngSize(new Uint8Array(40)), undefined);
  assert.equal(pngSize(Buffer.from('GIF89a'.padEnd(40, ' '))), undefined);
  // A header that says a width or a height of 0 is no image.
  assert.equal(pngSize(header(0, 10)), undefined);
  assert.equal(pngSize(header(10, 0)), undefined);
});
