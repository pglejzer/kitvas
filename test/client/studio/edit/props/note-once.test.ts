import assert from 'node:assert/strict';
import { test } from 'node:test';
import { noteOnce } from '../../../../../client/studio/edit/props/context.ts';

test('a note shows once for one build of the panel, and again for the next build', () => {
  const first = {};
  assert.equal(noteOnce(first, 'covered'), true);
  assert.equal(noteOnce(first, 'covered'), false);
  assert.equal(noteOnce(first, 'covered'), false);
  const second = {};
  assert.equal(noteOnce(second, 'covered'), true);
});

test('each note has its own turn within one build', () => {
  const env = {};
  assert.equal(noteOnce(env, 'covered'), true);
  assert.equal(noteOnce(env, 'propOnce'), true);
  assert.equal(noteOnce(env, 'propOnce'), false);
});
