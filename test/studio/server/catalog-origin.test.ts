import assert from 'node:assert/strict';
import { mkdirSync, symlinkSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { test } from 'node:test';
import type { Studio } from '../../../src/studio/index.ts';
import { writeCatalog } from '../../helpers/kit/catalog.ts';
import { call, pageCookie, raw, rawCall, shopStudio } from '../../helpers/studio/studio.ts';

/** The frame key and the example frame's path, read from the kit page like the browser does. */
async function frameOf(studio: Studio): Promise<{ key: string; path: string }> {
  const cookie = await pageCookie(studio);
  const page = await call(studio.port, { path: '/kit/kitvas-ui', headers: { cookie } });
  assert.equal(page.status, 200);
  const found =
    /src="http:\/\/127\.0\.0\.1:\d+(\/k\/([^/]+)\/kitvas-ui\/html\/index\.html[^"#]*)#/.exec(
      page.text,
    );
  const path = found?.[1];
  const key = found?.[2];
  assert.ok(path && key, 'the kit page frames an example');
  return { key, path };
}

test('a built example is served on the prototype origin with the sandbox policy', async () => {
  const { studio, project } = await shopStudio();
  try {
    writeCatalog(project);
    const { key, path } = await frameOf(studio);
    assert.ok(path.endsWith('?example=Button.1'));
    const page = await call(studio.framePort, { path });
    assert.equal(page.status, 200);
    assert.equal(page.headers['content-type'], 'text/html; charset=utf-8');
    assert.match(String(page.headers['content-security-policy']), /^sandbox allow-scripts;/);
    assert.equal(page.headers['x-content-type-options'], 'nosniff');
    assert.equal(page.text, '<!doctype html><title>Examples</title>');
    const js = await call(studio.framePort, { path: `/k/${key}/kitvas-ui/js/index.js` });
    assert.equal(js.headers['content-type'], 'text/javascript; charset=utf-8');
    const css = await call(studio.framePort, { path: `/k/${key}/kitvas-ui/css/index.css` });
    assert.equal(css.headers['content-type'], 'text/css; charset=utf-8');
    const head = await call(studio.framePort, {
      method: 'HEAD',
      path: `/k/${key}/kitvas-ui/js/index.js`,
    });
    assert.equal(head.status, 200);
    assert.equal(head.text, '');
  } finally {
    await studio.close();
  }
});

test('the stamp, a wrong key, a bad kit id and a kit without a build answer 404', async () => {
  const { studio, project } = await shopStudio();
  try {
    writeCatalog(project);
    const { key } = await frameOf(studio);
    const missing = [
      `/k/${key}/kitvas-ui/json/catalog.json`,
      `/k/${key}/kitvas-ui/html/missing.html`,
      `/k/${key}/kitvas-ui/html`,
      `/k/${key}/nokit/html/index.html`,
      `/k/${key}/Kitvas-ui/html/index.html`,
      `/k/${key}/-kitvas-ui/html/index.html`,
      `/k/${'x'.repeat(22)}/kitvas-ui/html/index.html`,
      `/k/${key}/kitvas-ui/../draft.json`,
      '/k/x/kitvas-ui/html/index.html',
    ];
    for (const path of missing) {
      const answer = await call(studio.framePort, { path });
      assert.ok(answer.status === 404 || answer.status === 400, `${path}: ${answer.status}`);
      assert.equal(answer.headers['x-content-type-options'], 'nosniff', path);
    }
  } finally {
    await studio.close();
  }
});

test('encoded separators, backslashes, NUL, drives and device names never reach a file', async () => {
  const { studio, project } = await shopStudio();
  try {
    writeCatalog(project);
    const { key } = await frameOf(studio);
    const base = `/k/${key}/kitvas-ui`;
    const corpus = [
      `${base}/html%2f..%2f..%2fcatalog.json`,
      `${base}/html\\..\\..\\json\\catalog.json`,
      `${base}/html/index.html%00.png`,
      `${base}/html/CON`,
      `${base}/html/index.html.`,
      `${base}/C:/index.html`,
      `/k/${key}/kitvas-ui%2f..%2f..%2fkitvas-ui/html/index.html`,
      `/k/${key}/../../../draft.json`,
    ];
    for (const path of corpus) {
      const answer = await rawCall(
        studio.framePort,
        raw([`GET ${path} HTTP/1.1`, `Host: 127.0.0.1:${studio.framePort}`, 'Connection: close']),
      );
      assert.ok(answer.status === 404 || answer.status === 400, `${path}: ${answer.status}`);
    }
  } finally {
    await studio.close();
  }
});

test('without a build the example address is a 404, and the studio origin has no such path', async () => {
  const { studio } = await shopStudio();
  try {
    const key = 'k'.repeat(22);
    const none = await call(studio.framePort, { path: `/k/${key}/kitvas-ui/html/index.html` });
    assert.equal(none.status, 404);
    const cookie = await pageCookie(studio);
    const wrongOrigin = await call(studio.port, {
      path: `/k/${key}/kitvas-ui/html/index.html`,
      headers: { cookie },
    });
    assert.equal(wrongOrigin.status, 404);
  } finally {
    await studio.close();
  }
});

test('only GET and HEAD, and only the studio frames an example', async () => {
  const { studio, project } = await shopStudio();
  try {
    writeCatalog(project);
    const { path } = await frameOf(studio);
    const post = await call(studio.framePort, { method: 'POST', path, body: '{}' });
    assert.equal(post.status, 405);
    assert.equal(post.headers.allow, 'GET, HEAD');
    const nav = (site: string) =>
      call(studio.framePort, {
        path,
        headers: {
          'sec-fetch-mode': 'navigate',
          'sec-fetch-site': site,
          'sec-fetch-dest': 'iframe',
        },
      });
    assert.equal((await nav('same-site')).status, 200);
    assert.equal((await nav('cross-site')).status, 403);
  } finally {
    await studio.close();
  }
});

test('a symbolic link in the build folder is never followed', async (t) => {
  const { studio, project } = await shopStudio();
  try {
    const dir = writeCatalog(project);
    const secret = join(project, 'secret.js');
    writeFileSync(secret, 'secret');
    mkdirSync(join(dir, 'build', 'js'), { recursive: true });
    try {
      symlinkSync(secret, join(dir, 'build', 'js', 'link.js'));
    } catch {
      t.skip('symbolic links need a privilege here');
      return;
    }
    const { key } = await frameOf(studio);
    const answer = await call(studio.framePort, { path: `/k/${key}/kitvas-ui/js/link.js` });
    assert.equal(answer.status, 404);
  } finally {
    await studio.close();
  }
});
