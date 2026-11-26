import assert from 'node:assert/strict';
import { test } from 'node:test';
import { isRecord } from '../../../src/shared/values/guards.ts';

test('a record is a plain object: not null, not an array, not a primitive', () => {
  assert.equal(isRecord({}), true);
  assert.equal(isRecord({ a: 1 }), true);
  assert.equal(isRecord(null), false);
  assert.equal(isRecord([]), false);
  assert.equal(isRecord('text'), false);
  assert.equal(isRecord(3), false);
  assert.equal(isRecord(undefined), false);
});
