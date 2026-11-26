import assert from 'node:assert/strict';
import { test } from 'node:test';
import { clamp } from '../../../src/shared/values/numbers.ts';

test('clamp holds a value between low and high', () => {
  assert.equal(clamp(5, 0, 10), 5);
  assert.equal(clamp(-5, 0, 10), 0);
  assert.equal(clamp(15, 0, 10), 10);
  assert.equal(clamp(0, 0, 10), 0);
  assert.equal(clamp(10, 0, 10), 10);
});
