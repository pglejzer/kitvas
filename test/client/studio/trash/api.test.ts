import assert from 'node:assert/strict';
import { test } from 'node:test';
import { failureOf } from '../../../../client/studio/trash/api.ts';
import { text } from '../../../../client/studio/trash/texts.ts';
import { localTime } from '../../../../client/studio/trash/time.ts';

test('a failed call is told by its problem code, whatever the status', () => {
  assert.equal(failureOf({ status: 409, code: 'DRAFT_LOCKED' }), 'locked');
  assert.equal(failureOf({ status: 409, code: 'DRAFT_EXISTS' }), 'exists');
  assert.equal(failureOf({ status: 404, code: 'DRAFT_NOT_FOUND' }), 'missing');
  assert.equal(failureOf({ status: 500, code: 'INTERNAL' }), 'failed');
  assert.equal(failureOf({ status: 0, code: null }), 'failed');
  assert.equal(failureOf({ status: 409, code: null }), 'failed');
});

test('a text the page did not send shows as its key', () => {
  assert.equal(text('delete.title', { title: 'Shop' }), 'delete.title');
});

test('a time the browser cannot read is left as the page wrote it', () => {
  assert.equal(localTime('not a date'), undefined);
  assert.equal(typeof localTime('2026-11-24T10:15:30.123Z'), 'string');
});
