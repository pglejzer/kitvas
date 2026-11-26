import assert from 'node:assert/strict';
import { test } from 'node:test';
import type { Studio } from '../../../src/studio/index.ts';
import { call, pageCookie, raw, rawCall, shopStudio } from '../../helpers/studio/studio.ts';

/** The frame key, read from the address the draft page frames. */
async function keyOf(studio: Studio): Promise<string> {
  const cookie = await pageCookie(studio);
  const page = await call(studio.port, { path: '/drafts/shop', headers: { cookie } });
  const key = /\/f\/([^/]+)\/shop\/v1\/html\/index\.html/.exec(page.text)?.[1];
  assert.ok(key, 'the draft page frames the prototype');
  return key;
}

test('the framed address serves the page with the sandbox policy', async () => {
  const { studio } = await shopStudio();
  try {
    const key = await keyOf(studio);
    const page = await call(studio.framePort, {
      path: `/f/${key}/shop/v1/html/index.html?state=filled`,
    });
    assert.equal(page.status, 200);
    assert.equal(page.headers['content-type'], 'text/html; charset=utf-8');
    const csp = String(page.headers['content-security-policy']);
    assert.match(csp, /^sandbox allow-scripts;/);
    assert.ok(csp.includes(`frame-ancestors http://127.0.0.1:${studio.port} `));
    assert.equal(page.headers['cross-origin-resource-policy'], 'cross-origin');
    assert.equal(page.headers['x-content-type-options'], 'nosniff');
    assert.equal(page.text, '<!doctype html><title>Shop</title>');
    const css = await call(studio.framePort, { path: `/f/${key}/shop/v1/css/index.css` });
    assert.equal(css.headers['content-type'], 'text/css; charset=utf-8');
    // Only a stylesheet may be read across origins: the frame makes forced-state twins of its rules.
    assert.equal(css.headers['access-control-allow-origin'], '*');
    assert.equal(page.headers['access-control-allow-origin'], undefined);
    const head = await call(studio.framePort, {
      method: 'HEAD',
      path: `/f/${key}/shop/v1/js/index.js`,
    });
    assert.equal(head.status, 200);
    assert.equal(head.text, '');
  } finally {
    await studio.close();
  }
});

test('a page on kitvas.localhost frames the prototype origin on that name', async () => {
  const { studio } = await shopStudio();
  try {
    const cookie = await pageCookie(studio);
    const host = `kitvas.localhost:${studio.port}`;
    const page = await call(studio.port, { path: '/drafts/shop', headers: { host, cookie } });
    assert.equal(page.status, 200);
    const src = /<iframe src="([^"]+)"/.exec(page.text)?.[1] ?? '';
    const framed = new URL(src.replaceAll('&amp;', '&'));
    // Same name, other port: the origins stay the same site, and the frame passes Fetch Metadata.
    assert.equal(framed.host, `kitvas.localhost:${studio.framePort}`);
    const frame = await call(studio.framePort, {
      path: `${framed.pathname}${framed.search}`,
      headers: {
        host: framed.host,
        'sec-fetch-mode': 'navigate',
        'sec-fetch-site': 'same-site',
        'sec-fetch-dest': 'iframe',
      },
    });
    assert.equal(frame.status, 200);
    const csp = String(frame.headers['content-security-policy']);
    assert.ok(csp.includes(`http://kitvas.localhost:${studio.port};`), csp);
  } finally {
    await studio.close();
  }
});

test('a wrong key, files outside the map and traversal all answer 404', async () => {
  const { studio } = await shopStudio();
  try {
    const key = await keyOf(studio);
    const wrong = await call(studio.framePort, {
      path: `/f/${'x'.repeat(22)}/shop/v1/html/index.html`,
    });
    assert.equal(wrong.status, 404);
    const paths = ['json/ids.json', 'html/missing.html', '../draft.json', 'html/../json/ids.json'];
    for (const rel of paths) {
      const answer = await call(studio.framePort, { path: `/f/${key}/shop/v1/${rel}` });
      assert.equal(answer.status, 404, rel);
    }
  } finally {
    await studio.close();
  }
});

test('encoded separators, backslashes, NUL, drives and device names never reach a file', async () => {
  const { studio } = await shopStudio();
  try {
    const key = await keyOf(studio);
    const base = `/f/${key}/shop/v1`;
    const corpus = [
      `${base}/html%2f..%2f..%2fdraft.json`,
      `${base}/html\\..\\..\\draft.json`,
      `${base}/html/index.html%00.png`,
      `${base}/html/CON`,
      `${base}/html/index.html.`,
      `${base}/C:/index.html`,
      `/f/${key}/../../draft.json`,
    ];
    for (const path of corpus) {
      const answer = await rawCall(
        studio.framePort,
        raw([`GET ${path} HTTP/1.1`, `Host: 127.0.0.1:${studio.framePort}`, 'Connection: close']),
      );
      assert.ok(answer.status === 404 || answer.status === 400, `${path}: ${answer.status}`);
      assert.equal(answer.headers['x-content-type-options'], 'nosniff', path);
    }
  } finally {
    await studio.close();
  }
});

test('only GET and HEAD; only the studio frames it; only its own Host', async () => {
  const { studio } = await shopStudio();
  try {
    const key = await keyOf(studio);
    const page = `/f/${key}/shop/v1/html/index.html`;
    const post = await call(studio.framePort, { method: 'POST', path: page, body: '{}' });
    assert.equal(post.status, 405);
    assert.equal(post.headers.allow, 'GET, HEAD');
    const nav = (site: string, dest: string) =>
      call(studio.framePort, {
        path: page,
        headers: { 'sec-fetch-mode': 'navigate', 'sec-fetch-site': site, 'sec-fetch-dest': dest },
      });
    assert.equal((await nav('same-site', 'iframe')).status, 200);
    assert.equal((await nav('cross-site', 'iframe')).status, 403);
    assert.equal((await nav('cross-site', 'document')).status, 403);
    const script = await call(studio.framePort, {
      path: `/f/${key}/shop/v1/js/index.js`,
      headers: {
        'sec-fetch-mode': 'no-cors',
        'sec-fetch-site': 'cross-site',
        'sec-fetch-dest': 'script',
      },
    });
    assert.equal(script.status, 200);
    for (const host of [`127.0.0.1:${studio.port}`, 'evil.example']) {
      assert.equal((await call(studio.framePort, { path: page, headers: { host } })).status, 403);
    }
  } finally {
    await studio.close();
  }
});

test('each origin serves only its own things', async () => {
  const { studio } = await shopStudio();
  try {
    const key = await keyOf(studio);
    const headers = { authorization: `Bearer ${studio.token}` };
    const api = await call(studio.framePort, { path: '/api/v1/drafts', headers });
    assert.equal(api.status, 404);
    const file = await call(studio.port, { path: `/f/${key}/shop/v1/html/index.html` });
    assert.equal(file.status, 404);
  } finally {
    await studio.close();
  }
});
