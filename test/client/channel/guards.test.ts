import assert from 'node:assert/strict';
import { test } from 'node:test';
import { isCount, isId, isText, itemUpTo } from '../../../client/channel/guards.ts';

test('an element id is 1 to 200 characters of the frame alphabet', () => {
  assert.equal(isId('src/sections/Hero.tsx:12:3'), true);
  assert.equal(isId('a$b-c_d.e'), true);
  assert.equal(isId(''), false);
  assert.equal(isId('a b'), false);
  assert.equal(isId('a'.repeat(201)), false);
  assert.equal(isId(3), false);
});

test('a text is a string up to its limit', () => {
  assert.equal(isText('', 5), true);
  assert.equal(isText('12345', 5), true);
  assert.equal(isText('123456', 5), false);
  assert.equal(isText(null, 5), false);
});

test('a count is a whole number from 0 to a billion', () => {
  assert.equal(isCount(0), true);
  assert.equal(isCount(1e9), true);
  assert.equal(isCount(1e9 + 1), false);
  assert.equal(isCount(-1), false);
  assert.equal(isCount(1.5), false);
  assert.equal(isCount('1'), false);
});

test('a list item guard takes a whole number up to the limit it was given', () => {
  const isItem = itemUpTo(10);
  assert.equal(isItem(0), true);
  assert.equal(isItem(10), true);
  assert.equal(isItem(11), false);
  assert.equal(isItem(-1), false);
  assert.equal(isItem(2.5), false);
  assert.deepEqual([1, 2, 3].every(isItem), true);
});
