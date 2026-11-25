import assert from 'node:assert/strict';
import { createServer, type IncomingHttpHeaders } from 'node:http';
import type { AddressInfo } from 'node:net';
import { test } from 'node:test';
import { callStudio } from '../../../src/studio/run/studio-client.ts';

type Heard = { method: string; headers: IncomingHttpHeaders; body: string };

/** A plain server on 127.0.0.1 that keeps what it heard and answers `{"ok":true}`. */
async function listen(): Promise<{ port: number; heard: Heard[]; close(): Promise<void> }> {
  const heard: Heard[] = [];
  const server = createServer((req, res) => {
    const chunks: Buffer[] = [];
    req.on('data', (chunk: Buffer) => chunks.push(chunk));
    req.on('end', () => {
      heard.push({
        method: req.method ?? '',
        headers: req.headers,
        body: Buffer.concat(chunks).toString('utf8'),
      });
      res.writeHead(200, { 'content-type': 'application/json' });
      res.end('{"ok":true}');
    });
  });
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  const { port } = server.address() as AddressInfo;
  return {
    port,
    heard,
    close: () => new Promise<void>((resolve) => server.close(() => resolve())),
  };
}

const TOKEN = 'k'.repeat(43);

test('a DELETE carries its body whole: the server reads it as one request', async () => {
  const server = await listen();
  try {
    // Node sends no length and no chunks for a DELETE by itself, and the server then reads the
    // body as the start of a second, broken request.
    const answer = await callStudio(
      { port: server.port, token: TOKEN },
      { method: 'DELETE', path: '/api/v1/drafts/shop', body: {}, timeoutMs: 2_000 },
    );
    assert.equal(answer.status, 200);
    assert.deepEqual(answer.body, { ok: true });
    assert.equal(server.heard.length, 1);
    assert.equal(server.heard[0]?.method, 'DELETE');
    assert.equal(server.heard[0]?.body, '{}');
    assert.equal(server.heard[0]?.headers['content-length'], '2');
    assert.equal(server.heard[0]?.headers['content-type'], 'application/json');
  } finally {
    await server.close();
  }
});

test('a POST says how long its body is, in bytes', async () => {
  const server = await listen();
  try {
    await callStudio(
      { port: server.port, token: TOKEN },
      { method: 'POST', path: '/api/v1/links', body: { path: '/ż' }, timeoutMs: 2_000 },
    );
    assert.equal(server.heard[0]?.body, '{"path":"/ż"}');
    assert.equal(server.heard[0]?.headers['content-length'], '14');
    assert.equal(server.heard[0]?.headers.origin, `http://127.0.0.1:${server.port}`);
  } finally {
    await server.close();
  }
});

test('a GET has no body, no length and no origin', async () => {
  const server = await listen();
  try {
    await callStudio(
      { port: server.port, token: TOKEN },
      { method: 'GET', path: '/api/v1/status', timeoutMs: 2_000 },
    );
    assert.equal(server.heard[0]?.body, '');
    assert.equal(server.heard[0]?.headers['content-length'], undefined);
    assert.equal(server.heard[0]?.headers.origin, undefined);
    assert.equal(server.heard[0]?.headers.authorization, `Bearer ${TOKEN}`);
  } finally {
    await server.close();
  }
});
