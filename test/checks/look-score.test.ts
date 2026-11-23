import assert from 'node:assert/strict';
import { test } from 'node:test';
import { LOOK_LINE, lookScore, type Pixels } from '../../src/checks/index.ts';
import { bar, solid } from './pixels.ts';

const WHITE = solid(40, 20, [255, 255, 255]);

test('an image is as close as it can be to itself', () => {
  assert.deepEqual(lookScore(bar(40, 20, 8), bar(40, 20, 8)), {
    score: 100,
    size: 100,
    colour: 100,
    structure: 100,
  });
  assert.deepEqual(lookScore(WHITE, WHITE), { score: 100, size: 100, colour: 100, structure: 100 });
});

test('twice as wide halves the size part and the score; the rest still agrees', () => {
  const result = lookScore(WHITE, solid(80, 20, [255, 255, 255]));
  assert.deepEqual(result, { score: 50, size: 50, colour: 100, structure: 100 });
});

test('size multiplies the width and the height ratios', () => {
  const result = lookScore(WHITE, solid(20, 40, [255, 255, 255]));
  assert.equal(result.size, 25);
  assert.equal(result.score, 25);
});

test('another fill colour is far on colour, and the size is the same', () => {
  const result = lookScore(solid(40, 20, [200, 50, 50]), solid(40, 20, [50, 50, 200]));
  assert.equal(result.size, 100);
  // (150 + 0 + 150) / 765 of the range differs.
  assert.ok(Math.abs(result.colour - 60.8) < 0.2, String(result.colour));
  // Two flat fills have no structure to compare: SSIM only weighs their grey means (94.85 against
  // 67.1), so structure stays high and colour is what catches them.
  assert.ok(Math.abs(result.structure - 94.3) < 0.2, String(result.structure));
  assert.ok(result.score < LOOK_LINE);
  assert.equal(result.score, result.colour);
});

test('a dark bar one pixel lower scores above a different fill', () => {
  const reference = bar(40, 20, 8);
  const shifted = lookScore(reference, bar(40, 20, 9));
  const other = lookScore(reference, solid(40, 20, [50, 50, 200]));
  assert.ok(shifted.score > other.score, `${shifted.score} against ${other.score}`);
  assert.equal(shifted.size, 100);
});

test('a transparent pixel counts as white and a smaller image is scaled to the reference', () => {
  const clear: Pixels = { width: 40, height: 20, data: new Uint8Array(40 * 20 * 4) };
  assert.deepEqual(lookScore(WHITE, clear), { score: 100, size: 100, colour: 100, structure: 100 });
  const half = lookScore(WHITE, solid(20, 10, [255, 255, 255]));
  assert.deepEqual(half, { score: 25, size: 25, colour: 100, structure: 100 });
});

test('an image under 8 px either way is judged by its colour alone', () => {
  const small = solid(6, 6, [255, 255, 255]);
  assert.deepEqual(lookScore(small, small), { score: 100, size: 100, colour: 100, structure: 100 });
  const result = lookScore(small, solid(6, 6, [0, 0, 0]));
  assert.equal(result.structure, result.colour);
  assert.equal(result.colour, 0);
});

test('an empty image scores zero', () => {
  const empty: Pixels = { width: 0, height: 0, data: new Uint8Array(0) };
  assert.deepEqual(lookScore(WHITE, empty), { score: 0, size: 0, colour: 0, structure: 0 });
});
