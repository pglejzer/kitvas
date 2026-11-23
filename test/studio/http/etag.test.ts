import assert from 'node:assert/strict';
import { test } from 'node:test';
import { etagOf, ifMatchPasses, requireIfMatch } from '../../../src/studio/http/etag.ts';
import { RequestError } from '../../../src/studio/http/problem.ts';

const isCode = (code: string) => (error: unknown) =>
  error instanceof RequestError && error.code === code;

test('an ETag is strong, quoted and follows the text', () => {
  const tag = etagOf('{"a":1}');
  assert.match(tag, /^"[A-Za-z0-9_-]{27}"$/);
  assert.equal(etagOf('{"a":1}'), tag);
  assert.notEqual(etagOf('{"a":2}'), tag);
});

test('If-Match passes for the same tag, a list holding it, or *', () => {
  const tag = etagOf('x');
  assert.equal(ifMatchPasses(tag, tag), true);
  assert.equal(ifMatchPasses(`"other", ${tag}`, tag), true);
  assert.equal(ifMatchPasses('*', tag), true);
  assert.equal(ifMatchPasses(`W/${tag}`, tag), false);
  assert.equal(ifMatchPasses('"other"', tag), false);
});

test('a change without If-Match is 428, with a stale one 412', () => {
  const tag = etagOf('x');
  assert.throws(() => requireIfMatch(undefined, tag, '/p'), isCode('PRECONDITION_REQUIRED'));
  assert.throws(() => requireIfMatch('"old"', tag, '/p'), isCode('PRECONDITION_FAILED'));
  assert.doesNotThrow(() => requireIfMatch([tag], tag, '/p'));
});
