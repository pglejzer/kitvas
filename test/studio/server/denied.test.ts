import assert from 'node:assert/strict';
import { request } from 'node:http';
import { test } from 'node:test';
import { call, shopStudio } from '../../helpers/studio.ts';

/** A GET to the prototype origin with its own Host; the answer's status only. */
function frameStatus(port: number, host: string): Promise<number> {
  return new Promise((resolve, reject) => {
    const req = request(
      { host: '127.0.0.1', port, path: '/', agent: false, headers: { host } },
      (res) => {
        res.resume();
        res.on('end', () => resolve(res.statusCode ?? 0));
      },
    );
    req.on('error', reject);
    req.end();
  });
}

test('refused requests of both origins go to the log without secrets', async () => {
  const lines: string[] = [];
  const { studio } = await shopStudio({}, { onDenied: (line) => lines.push(line) });
  try {
    const wrong = `Bearer ${'x'.repeat(43)}`;
    const port = String(studio.port);
    assert.equal(
      (await call(studio.port, { path: '/api/v1/drafts', headers: { authorization: wrong } }))
        .status,
      401,
    );
    assert.equal(
      (await call(studio.port, { path: '/api/v1/drafts', headers: { host: `evil.test:${port}` } }))
        .status,
      403,
    );
    const note = JSON.stringify({ kind: 'note', slug: null, element: null, text: 'Hi' });
    const noOrigin = {
      method: 'POST',
      path: '/api/v1/inbox',
      headers: { authorization: `Bearer ${studio.token}`, 'content-type': 'application/json' },
      body: note,
    };
    assert.equal((await call(studio.port, noOrigin)).status, 403);
    assert.equal((await call(studio.port, { path: '/' })).status, 401);
    assert.equal((await call(studio.port, { path: '/open?code=not-a-code&to=%2F' })).status, 401);
    assert.equal(await frameStatus(studio.framePort, 'evil.test'), 403);
    assert.equal((await call(studio.port, { path: '/missing' })).status, 404);
    const host = `host=127.0.0.1:${port}`;
    assert.deepEqual(lines, [
      `denied 401 TOKEN_INVALID GET /api/v1/drafts ${host}`,
      `denied 403 REQUEST_FORBIDDEN GET /api/v1/drafts host=evil.test:${port}`,
      `denied 403 REQUEST_FORBIDDEN POST /api/v1/inbox ${host}`,
      `denied 401 PAGE_LOCKED GET / ${host}`,
      `denied 401 PAGE_LOCKED GET /open ${host}`,
      'denied 403 REQUEST_FORBIDDEN GET / host=evil.test',
    ]);
    for (const line of lines) {
      assert.ok(!line.includes(studio.token));
      assert.ok(!line.includes('not-a-code'));
    }
  } finally {
    await studio.close();
  }
});
