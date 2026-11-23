import assert from 'node:assert/strict';
import { test } from 'node:test';
import { call, openLinkUrl, pageCookie, shopStudio } from '../../helpers/studio.ts';

test('pages without the cookie get the locked page, with the security headers', async () => {
  const { studio } = await shopStudio();
  try {
    for (const path of ['/', '/drafts/shop']) {
      const answer = await call(studio.port, { path });
      assert.equal(answer.status, 401, path);
      assert.equal(answer.headers['content-type'], 'text/html; charset=utf-8');
      assert.ok(answer.headers['content-security-policy']);
      assert.ok(answer.text.includes('kitvas studio'));
      assert.ok(!answer.text.includes('shop'), 'no draft is named');
    }
    const wrong = await call(studio.port, {
      path: '/',
      headers: { cookie: `kitvas_${studio.port}=x` },
    });
    assert.equal(wrong.status, 401);
    const other = await call(studio.port, { path: '/', headers: { cookie: 'kitvas_1=x' } });
    assert.equal(other.status, 401);
  } finally {
    await studio.close();
  }
});

test('a one-time link sets the cookie once and leads to its page', async () => {
  const { studio } = await shopStudio();
  try {
    const link = new URL(await openLinkUrl(studio, '/drafts/shop'));
    assert.equal(link.origin, `http://kitvas.localhost:${studio.port}`);
    assert.equal(link.pathname, '/open');
    assert.ok(!link.href.includes(studio.token));
    const opened = await call(studio.port, {
      path: `${link.pathname}${link.search}`,
      headers: { host: link.host },
    });
    assert.equal(opened.status, 303);
    assert.equal(opened.headers.location, '/drafts/shop');
    const cookie = String(opened.headers['set-cookie']);
    const attributes = 'Path=/; Max-Age=2592000; HttpOnly; SameSite=Strict';
    assert.match(cookie, new RegExp(`^kitvas_${studio.port}=[A-Za-z0-9_-]{43}; ${attributes}$`));
    assert.ok(!cookie.includes(studio.token));
    const again = await call(studio.port, { path: `${link.pathname}${link.search}` });
    assert.equal(again.status, 401);
    assert.equal(again.headers['set-cookie'], undefined);
    const value = cookie.split(';')[0] ?? '';
    const draft = await call(studio.port, { path: '/drafts/shop', headers: { cookie: value } });
    assert.equal(draft.status, 200);
    assert.ok(draft.text.includes('<iframe'));
  } finally {
    await studio.close();
  }
});

test('the API takes the page cookie like the token; writes still need the Origin', async () => {
  const { studio } = await shopStudio();
  try {
    const cookie = await pageCookie(studio);
    const read = await call(studio.port, { path: '/api/v1/drafts', headers: { cookie } });
    assert.equal(read.status, 200);
    const noCookie = await call(studio.port, { path: '/api/v1/drafts' });
    assert.equal(noCookie.status, 401);
    const body = JSON.stringify({ kind: 'note', slug: null, element: null, text: 'Hi' });
    const write = { cookie, 'content-type': 'application/json' };
    const blocked = await call(studio.port, {
      method: 'POST',
      path: '/api/v1/inbox',
      headers: write,
      body,
    });
    assert.equal(blocked.status, 403);
    const sent = await call(studio.port, {
      method: 'POST',
      path: '/api/v1/inbox',
      headers: { ...write, origin: studio.url },
      body,
    });
    assert.equal(sent.status, 202);
  } finally {
    await studio.close();
  }
});

test('a link comes on two names; its code works once, on either', async () => {
  const { studio } = await shopStudio();
  try {
    const ask = () =>
      call(studio.port, {
        method: 'POST',
        path: '/api/v1/links',
        headers: {
          authorization: `Bearer ${studio.token}`,
          origin: studio.url,
          'content-type': 'application/json',
        },
        body: JSON.stringify({ path: '/drafts/shop' }),
      });
    const first = JSON.parse((await ask()).text) as { url: string; fallbackUrl: string };
    const url = new URL(first.url);
    const fallback = new URL(first.fallbackUrl);
    // The CLI asked on 127.0.0.1; the links name the studio's own port, never the request's Host.
    assert.equal(url.origin, `http://kitvas.localhost:${studio.port}`);
    assert.equal(fallback.origin, `http://localhost:${studio.port}`);
    assert.equal(fallback.pathname, url.pathname);
    assert.equal(fallback.search, url.search);
    const open = (link: URL) =>
      call(studio.port, { path: `${link.pathname}${link.search}`, headers: { host: link.host } });
    assert.equal((await open(url)).status, 303);
    assert.equal((await open(fallback)).status, 401);
    // The other way round: the fallback first, then the main address is used up.
    const second = JSON.parse((await ask()).text) as { url: string; fallbackUrl: string };
    assert.equal((await open(new URL(second.fallbackUrl))).status, 303);
    assert.equal((await open(new URL(second.url))).status, 401);
  } finally {
    await studio.close();
  }
});

test('a link may lead only to the drafts or one draft', async () => {
  const { studio } = await shopStudio();
  try {
    const answer = await call(studio.port, {
      method: 'POST',
      path: '/api/v1/links',
      headers: {
        authorization: `Bearer ${studio.token}`,
        origin: studio.url,
        'content-type': 'application/json',
      },
      body: JSON.stringify({ path: '/api/v1/status' }),
    });
    assert.equal(answer.status, 422);
  } finally {
    await studio.close();
  }
});
