import assert from 'node:assert/strict';
import { afterEach, test } from 'node:test';
import { call, draftPath } from '../../../../client/studio/api/request.ts';

type Sent = { path: string; init: RequestInit | undefined };

const real = globalThis.fetch;
afterEach(() => {
  globalThis.fetch = real;
});

/** Answers every request with `response`, and keeps what was sent. */
function fake(response: Response | Error): Sent[] {
  const sent: Sent[] = [];
  globalThis.fetch = (async (input: unknown, init?: RequestInit) => {
    sent.push({ path: String(input), init });
    if (response instanceof Error) throw response;
    return response;
  }) as typeof fetch;
  return sent;
}

const json = (body: unknown, status = 200): Response =>
  new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });

test('the draft path encodes the slug', () => {
  assert.equal(draftPath('pricing'), '/api/v1/drafts/pricing');
  assert.equal(draftPath('a b/c'), '/api/v1/drafts/a%20b%2Fc');
});

test('a call without a body sends none, with the page cookie', async () => {
  const sent = fake(json({ n: 1 }));
  const answer = await call<{ n: number }>('GET', '/x');
  assert.deepEqual(answer, { ok: true, status: 200, body: { n: 1 } });
  assert.equal(sent[0]?.init?.method, 'GET');
  assert.equal(sent[0]?.init?.credentials, 'same-origin');
  assert.deepEqual(sent[0]?.init?.headers, {});
  assert.equal(sent[0]?.init?.body, undefined);
});

test('a body goes as JSON, an empty object too', async () => {
  const sent = fake(json({}));
  await call('POST', '/x', { a: 1 });
  assert.deepEqual(sent[0]?.init?.headers, { 'content-type': 'application/json' });
  assert.equal(sent[0]?.init?.body, '{"a":1}');
  await call('DELETE', '/x', {});
  assert.equal(sent[1]?.init?.method, 'DELETE');
  assert.equal(sent[1]?.init?.body, '{}');
});

test('a refusal answers with its status and the problem details code', async () => {
  fake(json({ code: 'DRAFT_LOCKED' }, 423));
  assert.deepEqual(await call('POST', '/x', {}), { ok: false, status: 423, code: 'DRAFT_LOCKED' });
  fake(json({ title: 'no code' }, 400));
  assert.deepEqual(await call('GET', '/x'), { ok: false, status: 400, code: null });
  fake(new Response('not json', { status: 500 }));
  assert.deepEqual(await call('GET', '/x'), { ok: false, status: 500, code: null });
});

test('an answer that is not JSON still counts as ok, with no body', async () => {
  fake(new Response('', { status: 200 }));
  assert.deepEqual(await call('GET', '/x'), { ok: true, status: 200, body: undefined });
});

test('a network error answers as status 0', async () => {
  fake(new Error('down'));
  assert.deepEqual(await call('GET', '/x'), { ok: false, status: 0, code: null });
});
