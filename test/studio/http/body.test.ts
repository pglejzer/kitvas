import assert from 'node:assert/strict';
import type { IncomingMessage } from 'node:http';
import { PassThrough } from 'node:stream';
import { test } from 'node:test';
import { readJsonBody } from '../../../src/studio/http/body.ts';
import { RequestError } from '../../../src/studio/http/problem.ts';
import { t } from '../../helpers/translate.ts';

function request(headers: Record<string, string>, ...chunks: string[]): IncomingMessage {
  const stream = new PassThrough();
  for (const chunk of chunks) stream.write(chunk);
  stream.end();
  return Object.assign(stream, { headers }) as unknown as IncomingMessage;
}

async function codeOf(promise: Promise<unknown>): Promise<string> {
  try {
    await promise;
    return 'ok';
  } catch (error) {
    return error instanceof RequestError ? error.code : 'other';
  }
}

const JSON_HEADERS = { 'content-type': 'application/json' };

test('a JSON body is parsed; a charset parameter is fine', async () => {
  const req = request({ 'content-type': 'application/json; charset=utf-8' }, '{"a":', '1}');
  assert.deepEqual(await readJsonBody(req, 100, t), { a: 1 });
});

test('another media type is 415, a body that is not JSON 400', async () => {
  const plain = request({ 'content-type': 'text/plain' }, '{}');
  assert.equal(await codeOf(readJsonBody(plain, 100, t)), 'MEDIA_TYPE_UNSUPPORTED');
  assert.equal(await codeOf(readJsonBody(request({}, '{}'), 100, t)), 'MEDIA_TYPE_UNSUPPORTED');
  assert.equal(await codeOf(readJsonBody(request(JSON_HEADERS, '{a'), 100, t)), 'REQUEST_INVALID');
  assert.equal(await codeOf(readJsonBody(request(JSON_HEADERS), 100, t)), 'REQUEST_INVALID');
});

test('a body over the limit is 413, declared or streamed, and closes the connection', async () => {
  const declared = request({ ...JSON_HEADERS, 'content-length': '101' }, '{}');
  assert.equal(await codeOf(readJsonBody(declared, 100, t)), 'BODY_TOO_LARGE');
  const streamed = request(JSON_HEADERS, `"${'x'.repeat(60)}`, `${'x'.repeat(60)}"`);
  await assert.rejects(
    readJsonBody(streamed, 100, t),
    (error: unknown) =>
      error instanceof RequestError &&
      error.code === 'BODY_TOO_LARGE' &&
      error.headers.connection === 'close',
  );
});
