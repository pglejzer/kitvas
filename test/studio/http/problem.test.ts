import assert from 'node:assert/strict';
import { test } from 'node:test';
import { KitvasError, z } from '../../../src/shared/index.ts';
import {
  issueEntries,
  jsonPointer,
  problemOf,
  problemReply,
  RequestError,
} from '../../../src/studio/http/problem.ts';
import { t } from '../../helpers/translate.ts';

test('JSON pointers escape ~ and / inside keys', () => {
  assert.equal(jsonPointer([]), '');
  assert.equal(jsonPointer(['a', 0, 'b/c', 'd~e']), '/a/0/b~1c/d~0e');
});

test('zod issues become entries; an unknown field points at itself', () => {
  const schema = z.strictObject({ title: z.string(), tags: z.array(z.string()) });
  const wrong = schema.safeParse({ title: 3, tags: ['a', 4] });
  assert.equal(wrong.success, false);
  const wrongEntries = wrong.success ? [] : issueEntries(wrong.error.issues);
  assert.deepEqual(wrongEntries.map((entry) => entry.pointer).sort(), ['/tags/1', '/title']);
  const extra = schema.safeParse({ title: 'a', tags: [], extra: true, more: 1 });
  assert.equal(extra.success, false);
  const extraEntries = extra.success ? [] : issueEntries(extra.error.issues);
  assert.deepEqual(extraEntries.map((entry) => entry.pointer).sort(), ['/extra', '/more']);
});

test('a problem names the code, the status and the message', () => {
  const problem = problemOf(new KitvasError('DRAFT_NOT_FOUND', { slug: 'shop' }), t);
  assert.deepEqual(problem, {
    type: 'urn:kitvas:error:DRAFT_NOT_FOUND',
    title: 'Not Found',
    status: 404,
    detail: t('error.DRAFT_NOT_FOUND', { slug: 'shop' }),
    code: 'DRAFT_NOT_FOUND',
  });
});

test('a request error carries its entries and headers', () => {
  const invalid = new RequestError(
    'BODY_INVALID',
    {},
    { errors: [{ pointer: '/x', detail: 'Unknown.' }] },
  );
  assert.deepEqual(problemOf(invalid, t).errors, [{ pointer: '/x', detail: 'Unknown.' }]);
  const reply = problemReply(
    new RequestError(
      'METHOD_NOT_ALLOWED',
      { method: 'PUT', path: '/' },
      { headers: { allow: 'GET' } },
    ),
    t,
  );
  assert.equal(reply.status, 405);
  assert.equal(reply.type, 'application/problem+json; charset=utf-8');
  assert.deepEqual(reply.headers, { allow: 'GET' });
});

test('an error kitvas did not raise is a plain 500 and goes to onError', () => {
  const seen: unknown[] = [];
  const cause = new Error('boom at C:/private/path');
  const reply = problemReply(cause, t, (error) => seen.push(error));
  assert.equal(reply.status, 500);
  assert.deepEqual(seen, [cause]);
  const text = String(reply.body);
  assert.ok(!text.includes('boom'));
  assert.ok(!text.includes('private'));
  assert.equal((JSON.parse(text) as { code: string }).code, 'INTERNAL');
});
