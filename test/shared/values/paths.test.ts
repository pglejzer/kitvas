import assert from 'node:assert/strict';
import { test } from 'node:test';
import { samePath } from '../../../src/shared/values/paths.ts';

test('two paths are the same when they hold the same indexes in order', () => {
  assert.equal(samePath([], []), true);
  assert.equal(samePath([0, 2, 1], [0, 2, 1]), true);
  assert.equal(samePath([0, 2], [0, 2, 1]), false);
  assert.equal(samePath([0, 1], [1, 0]), false);
});
