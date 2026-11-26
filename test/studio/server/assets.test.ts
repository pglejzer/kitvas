import assert from 'node:assert/strict';
import { test } from 'node:test';
import { call, fakeAssets, pageCookie, shopStudio } from '../../helpers/studio/studio.ts';

test('the scripts need the page cookie, like the pages that load them', async () => {
  const { studio } = await shopStudio();
  try {
    for (const name of ['draft', 'gallery', 'kit', 'page']) {
      const locked = await call(studio.port, { path: `/assets/${name}.js` });
      assert.equal(locked.status, 401, name);
      assert.ok(!locked.text.includes('export'));
      const wrong = await call(studio.port, {
        path: `/assets/${name}.js`,
        headers: { cookie: `kitvas_${studio.port}=x` },
      });
      assert.equal(wrong.status, 401, name);
    }
  } finally {
    await studio.close();
  }
});

test('a script is served as JavaScript with the studio security headers', async () => {
  const { studio } = await shopStudio();
  try {
    const cookie = await pageCookie(studio);
    for (const name of ['draft', 'gallery', 'kit', 'page']) {
      const answer = await call(studio.port, { path: `/assets/${name}.js`, headers: { cookie } });
      assert.equal(answer.status, 200, name);
      assert.equal(answer.headers['content-type'], 'text/javascript; charset=utf-8');
      assert.equal(answer.headers['x-content-type-options'], 'nosniff');
      assert.ok(answer.headers['content-security-policy']);
      assert.equal(answer.text, 'export {};');
    }
  } finally {
    await studio.close();
  }
});

test('any other name under /assets is not found, and only GET is allowed', async () => {
  const { studio } = await shopStudio();
  try {
    const cookie = await pageCookie(studio);
    for (const name of ['other.js', 'draft.ts', 'draft.js.map', 'draft']) {
      const answer = await call(studio.port, { path: `/assets/${name}`, headers: { cookie } });
      assert.equal(answer.status, 404, name);
    }
    const post = await call(studio.port, {
      method: 'POST',
      path: '/assets/draft.js',
      headers: { cookie, origin: studio.url },
      body: '{}',
    });
    assert.equal(post.status, 405);
  } finally {
    await studio.close();
  }
});

test('a script that cannot be bundled is a server error, not a blank script', async () => {
  const failing = {
    ...fakeAssets,
    script: () => Promise.reject(new Error('bundle failed')),
  };
  const { studio, errors } = await shopStudio({}, { assets: failing });
  try {
    const cookie = await pageCookie(studio);
    const answer = await call(studio.port, { path: '/assets/draft.js', headers: { cookie } });
    assert.equal(answer.status, 500);
    assert.equal(errors.length, 1);
  } finally {
    await studio.close();
  }
});
