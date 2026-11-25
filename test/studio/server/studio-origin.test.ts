import assert from 'node:assert/strict';
import { test } from 'node:test';
import type { DraftStore } from '../../../src/drafts/index.ts';
import { etagOf } from '../../../src/studio/http/etag.ts';
import { call, pageCookie, raw, rawCall, shopStudio, studioOver } from '../../helpers/studio.ts';

const SECURITY = [
  'content-security-policy',
  'x-content-type-options',
  'referrer-policy',
  'cross-origin-opener-policy',
  'cross-origin-resource-policy',
  'permissions-policy',
  'vary',
  'cache-control',
];

function assertSecured(headers: Record<string, unknown>, label: string): void {
  for (const name of SECURITY) assert.ok(headers[name], `${label}: ${name}`);
}

type Problem = { code: string; status: number; errors?: { pointer: string }[] };
const problem = (text: string): Problem => JSON.parse(text) as Problem;
const nonceOf = (csp: unknown): string | undefined => /'nonce-([^']+)'/.exec(String(csp))?.[1];

test('a page: HTML with the security headers and its CSP nonce on its style', async () => {
  const { studio } = await shopStudio();
  try {
    const cookie = await pageCookie(studio);
    const page = await call(studio.port, { path: '/', headers: { cookie } });
    assert.equal(page.status, 200);
    assert.equal(page.headers['content-type'], 'text/html; charset=utf-8');
    assertSecured(page.headers, 'page');
    const nonce = nonceOf(page.headers['content-security-policy']);
    assert.ok(nonce);
    assert.ok(page.text.includes(`<style nonce="${nonce}">`));
    assert.ok(!page.text.includes(studio.token));
    const next = await call(studio.port, { path: '/', headers: { cookie } });
    assert.notEqual(nonceOf(next.headers['content-security-policy']), nonce);
  } finally {
    await studio.close();
  }
});

test('the API needs the token; errors are problem details with the same headers', async () => {
  const { studio } = await shopStudio();
  try {
    for (const authorization of [undefined, 'Bearer wrong', `Basic ${studio.token}`]) {
      const headers: Record<string, string> = authorization ? { authorization } : {};
      const answer = await call(studio.port, { path: '/api/v1/drafts', headers });
      assert.equal(answer.status, 401, String(authorization));
      assert.equal(answer.headers['www-authenticate'], 'Bearer');
      assert.equal(answer.headers['content-type'], 'application/problem+json; charset=utf-8');
      assertSecured(answer.headers, '401');
      assert.equal(problem(answer.text).code, 'TOKEN_INVALID');
      assert.ok(!answer.text.includes(studio.token));
    }
    const ok = await call(studio.port, {
      path: '/api/v1/drafts',
      headers: { authorization: `Bearer ${studio.token}` },
    });
    assert.equal(ok.status, 200);
    assert.equal(ok.headers['cache-control'], 'no-store');
    assert.deepEqual(JSON.parse(ok.text), {
      items: [{ slug: 'shop', title: 'Shop', kit: 'tiny', version: 1, valid: true }],
      nextCursor: null,
    });
  } finally {
    await studio.close();
  }
});

test('Host must name this server: a rebinding name or another port is refused', async () => {
  const { studio } = await shopStudio();
  try {
    const cookie = await pageCookie(studio);
    const hosts = [
      'evil.example',
      `evil.example:${studio.port}`,
      `127.0.0.1:${studio.port + 1}`,
      '127.0.0.1',
      'kitvas.localhost',
      `kitvas.localhost.evil.example:${studio.port}`,
      `other.localhost:${studio.port}`,
    ];
    for (const host of hosts) {
      const answer = await call(studio.port, { path: '/', headers: { host } });
      assert.equal(answer.status, 403, host);
      assert.equal(problem(answer.text).code, 'REQUEST_FORBIDDEN');
      assertSecured(answer.headers, host);
    }
    const names = ['localhost', 'kitvas.localhost', 'KITVAS.LOCALHOST'];
    for (const name of names) {
      const host = `${name}:${studio.port}`;
      const answer = await call(studio.port, { path: '/', headers: { host, cookie } });
      assert.equal(answer.status, 200, host);
    }
  } finally {
    await studio.close();
  }
});

test('Fetch Metadata: only the studio itself or a typed address, checked before the token', async () => {
  const { studio } = await shopStudio();
  try {
    const cookie = await pageCookie(studio);
    const sites = [
      ['cross-site', 403],
      ['same-site', 403],
      ['same-origin', 200],
      ['none', 200],
    ] as const;
    for (const [site, status] of sites) {
      const answer = await call(studio.port, {
        path: '/',
        headers: { 'sec-fetch-site': site, cookie },
      });
      assert.equal(answer.status, status, site);
    }
    const api = await call(studio.port, {
      path: '/api/v1/drafts',
      headers: { 'sec-fetch-site': 'cross-site', authorization: `Bearer ${studio.token}` },
    });
    assert.equal(api.status, 403);
  } finally {
    await studio.close();
  }
});

test('a change: same-origin Origin, the token, JSON, known fields, If-Match', async () => {
  const { studio, store } = await shopStudio();
  try {
    const origin = studio.url;
    const authorization = `Bearer ${studio.token}`;
    const json = 'application/json';
    const etag = etagOf(store.readText('shop', 'draft.json') ?? '');
    const post = (headers: Record<string, string>, body = '{}') =>
      call(studio.port, { method: 'POST', path: '/api/v1/drafts/shop/versions', headers, body });
    const cases: [Record<string, string>, string, number, string][] = [
      [{ authorization, 'content-type': json, 'if-match': etag }, '{}', 403, 'REQUEST_FORBIDDEN'],
      [
        { origin: 'null', authorization, 'content-type': json, 'if-match': etag },
        '{}',
        403,
        'REQUEST_FORBIDDEN',
      ],
      [
        { origin: 'http://evil.example', authorization, 'content-type': json, 'if-match': etag },
        '{}',
        403,
        'REQUEST_FORBIDDEN',
      ],
      [{ origin, 'content-type': json, 'if-match': etag }, '{}', 401, 'TOKEN_INVALID'],
      [
        { origin, authorization, 'content-type': 'text/plain', 'if-match': etag },
        '{}',
        415,
        'MEDIA_TYPE_UNSUPPORTED',
      ],
      [
        { origin, authorization, 'content-type': json, 'if-match': etag },
        '{',
        400,
        'REQUEST_INVALID',
      ],
      [
        { origin, authorization, 'content-type': json, 'if-match': etag },
        '{"force":true}',
        422,
        'BODY_INVALID',
      ],
      [{ origin, authorization, 'content-type': json }, '{}', 428, 'PRECONDITION_REQUIRED'],
      [
        { origin, authorization, 'content-type': json, 'if-match': '"stale"' },
        '{}',
        412,
        'PRECONDITION_FAILED',
      ],
    ];
    for (const [headers, body, status, code] of cases) {
      const answer = await post(headers, body);
      assert.equal(answer.status, status, code);
      assert.equal(problem(answer.text).code, code);
    }
    const good = { origin, authorization, 'content-type': json, 'if-match': etag };
    const unknown = await post(good, '{"force":true}');
    assert.deepEqual(
      problem(unknown.text).errors?.map((entry) => entry.pointer),
      ['/force'],
    );
    const created = await post(good);
    assert.equal(created.status, 201);
    assert.equal(created.headers.location, '/api/v1/drafts/shop/versions/2');
    assert.deepEqual(JSON.parse(created.text), { slug: 'shop', version: 2 });
    assert.equal((await post(good)).status, 412);
  } finally {
    await studio.close();
  }
});

test('a body over the limit is refused, declared or chunked', async () => {
  const { studio } = await shopStudio({ bodyLimit: 100 });
  try {
    const head = [
      'POST /api/v1/drafts/shop/versions HTTP/1.1',
      `Host: 127.0.0.1:${studio.port}`,
      `Origin: ${studio.url}`,
      `Authorization: Bearer ${studio.token}`,
      'Content-Type: application/json',
      'Connection: close',
    ];
    const body = `{"x":"${'a'.repeat(200)}"}`;
    const declared = await rawCall(
      studio.port,
      raw([...head, `Content-Length: ${body.length}`], body),
    );
    assert.equal(declared.status, 413);
    const chunk = `${body.length.toString(16)}\r\n${body}\r\n0\r\n\r\n`;
    const chunked = await rawCall(studio.port, raw([...head, 'Transfer-Encoding: chunked'], chunk));
    assert.equal(chunked.status, 413);
    assert.equal(chunked.headers.connection, 'close');
    assert.match(String(chunked.headers['content-security-policy']), /default-src/);
  } finally {
    await studio.close();
  }
});

test('unknown paths are 404, other methods 405 with Allow', async () => {
  const { studio } = await shopStudio();
  try {
    const headers = { authorization: `Bearer ${studio.token}` };
    const missing = await call(studio.port, { path: '/nope' });
    assert.equal(missing.status, 404);
    assertSecured(missing.headers, '404');
    const put = await call(studio.port, { method: 'PUT', path: '/api/v1/drafts/shop', headers });
    assert.equal(put.status, 405);
    assert.equal(put.headers.allow, 'DELETE, GET');
    const bad = await call(studio.port, { path: '/api/v1/drafts/NOT_A_SLUG', headers });
    assert.equal(bad.status, 404);
    assert.equal(problem(bad.text).code, 'ROUTE_NOT_FOUND');
    const gone = await call(studio.port, { path: '/api/v1/drafts/nope', headers });
    assert.equal(problem(gone.text).code, 'DRAFT_NOT_FOUND');
  } finally {
    await studio.close();
  }
});

test('repeated headers, HTTP/1.0 and other target forms are refused with the same headers', async () => {
  const { studio } = await shopStudio();
  try {
    const host = `Host: 127.0.0.1:${studio.port}`;
    const auth = `Authorization: Bearer ${studio.token}`;
    const close = 'Connection: close';
    const texts = [
      raw(['GET / HTTP/1.1', host, 'Host: evil.example', close]),
      raw(['GET /api/v1/drafts HTTP/1.1', host, auth, auth, close]),
      raw(['GET / HTTP/1.1', host, `Origin: ${studio.url}`, 'Origin: http://evil.example', close]),
      raw(
        [
          'POST /api/v1/drafts/shop/versions HTTP/1.1',
          host,
          'Content-Length: 2',
          'Content-Length: 2',
          close,
        ],
        '{}',
      ),
      raw(['GET / HTTP/1.0', host]),
      raw(['GET http://evil.example/ HTTP/1.1', host, close]),
      raw(['OPTIONS * HTTP/1.1', host, close]),
    ];
    for (const text of texts) {
      const answer = await rawCall(studio.port, text);
      const label = text.split('\r\n')[0] ?? '';
      assert.equal(answer.status, 400, label);
      assert.equal(answer.headers['x-content-type-options'], 'nosniff', label);
      assert.match(String(answer.headers['content-type']), /problem\+json/, label);
    }
  } finally {
    await studio.close();
  }
});

test('an error kitvas did not raise is a 500 without its text, reported to onError', async () => {
  const broken = {
    list() {
      throw new Error('boom in C:/private');
    },
  } as unknown as DraftStore;
  const { studio, errors } = await studioOver(broken);
  try {
    const cookie = await pageCookie(studio);
    const answer = await call(studio.port, { path: '/', headers: { cookie } });
    assert.equal(answer.status, 500);
    assert.ok(!answer.text.includes('boom'));
    assert.ok(!answer.text.includes('private'));
    assert.equal(errors.length, 1);
    assertSecured(answer.headers, '500');
  } finally {
    await studio.close();
  }
});

test('status and the generated OpenAPI document', async () => {
  const { studio } = await shopStudio();
  try {
    const headers = { authorization: `Bearer ${studio.token}` };
    const status = JSON.parse(
      (await call(studio.port, { path: '/api/v1/status', headers })).text,
    ) as { name: string; version: string; framePort: number };
    assert.equal(status.name, 'kitvas');
    assert.equal(status.version, '1.0.0');
    assert.equal(status.framePort, studio.framePort);
    const answer = await call(studio.port, { path: '/api/v1/openapi.json', headers });
    const doc = JSON.parse(answer.text) as { paths: Record<string, unknown> };
    assert.deepEqual(Object.keys(doc.paths).sort(), [
      '/api/v1/drafts',
      '/api/v1/drafts/{slug}',
      '/api/v1/drafts/{slug}/builds',
      '/api/v1/drafts/{slug}/checks',
      '/api/v1/drafts/{slug}/edits',
      '/api/v1/drafts/{slug}/edits/end',
      '/api/v1/drafts/{slug}/edits/reopen',
      '/api/v1/drafts/{slug}/history',
      '/api/v1/drafts/{slug}/images',
      '/api/v1/drafts/{slug}/images/{file}',
      '/api/v1/drafts/{slug}/inspect',
      '/api/v1/drafts/{slug}/kit-lens',
      '/api/v1/drafts/{slug}/notes',
      '/api/v1/drafts/{slug}/notes/{id}',
      '/api/v1/drafts/{slug}/notes/{id}/delete',
      '/api/v1/drafts/{slug}/off-kit',
      '/api/v1/drafts/{slug}/palette',
      '/api/v1/drafts/{slug}/requests',
      '/api/v1/drafts/{slug}/requests/{id}/drop',
      '/api/v1/drafts/{slug}/restore',
      '/api/v1/drafts/{slug}/structure',
      '/api/v1/drafts/{slug}/subtree',
      '/api/v1/drafts/{slug}/text-source',
      '/api/v1/drafts/{slug}/versions',
      '/api/v1/drafts/{slug}/versions/{number}',
      '/api/v1/drafts/{slug}/view',
      '/api/v1/drafts/{slug}/view/restore',
      '/api/v1/drafts/{slug}/waivers',
      '/api/v1/drafts/{slug}/waivers/withdraw',
      '/api/v1/drafts/{slug}/why',
      '/api/v1/events',
      '/api/v1/inbox',
      '/api/v1/inbox/take',
      '/api/v1/jobs',
      '/api/v1/jobs/{id}',
      '/api/v1/jobs/{id}/cancel',
      '/api/v1/kits/{id}/catalog',
      '/api/v1/links',
      '/api/v1/listening',
      '/api/v1/openapi.json',
      '/api/v1/requests/{id}',
      '/api/v1/requests/{id}/answer',
      '/api/v1/requests/{id}/done',
      '/api/v1/requests/{id}/fail',
      '/api/v1/settings/view',
      '/api/v1/shutdown',
      '/api/v1/status',
      '/api/v1/trash',
      '/api/v1/trash/{slug}',
      '/api/v1/trash/{slug}/restore',
    ]);
  } finally {
    await studio.close();
  }
});
