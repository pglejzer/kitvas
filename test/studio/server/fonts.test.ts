import assert from 'node:assert/strict';
import { join } from 'node:path';
import { test } from 'node:test';
import { defaultDepRoots } from '../../../src/shared/deps/deps.ts';
import { PLUGIN_ROOT } from '../../../src/shared/env/paths.ts';
import { createEsbuildAssets } from '../../../src/studio/adapters/esbuild-assets.ts';
import { FONT_CACHE } from '../../../src/studio/pages/asset-routes.ts';
import { FONT_FILES } from '../../../src/studio/pages/fonts.ts';
import { call, fakeAssets, pageCookie, shopStudio } from '../../helpers/studio/studio.ts';

test('a font is served as woff2, and the browser may keep it for this person', async () => {
  const { studio } = await shopStudio();
  try {
    const cookie = await pageCookie(studio);
    for (const file of FONT_FILES) {
      const answer = await call(studio.port, {
        path: `/assets/fonts/${file}`,
        headers: { cookie },
      });
      assert.equal(answer.status, 200, file);
      assert.equal(answer.headers['content-type'], 'font/woff2');
      assert.equal(answer.headers['cache-control'], FONT_CACHE);
      assert.match(FONT_CACHE, /^private, max-age=\d+$/);
      assert.equal(answer.headers['x-content-type-options'], 'nosniff');
      assert.equal(answer.text, 'wOF2-fake');
    }
  } finally {
    await studio.close();
  }
});

test('a font needs the page cookie, like the pages that load it', async () => {
  const { studio } = await shopStudio();
  try {
    const locked = await call(studio.port, { path: `/assets/fonts/${FONT_FILES[0]}` });
    assert.equal(locked.status, 401);
    assert.ok(!locked.text.includes('wOF2'));
  } finally {
    await studio.close();
  }
});

test('only the files of the typeface are served: no other name, no path out of the folder', async () => {
  const { studio } = await shopStudio();
  try {
    const cookie = await pageCookie(studio);
    const names = [
      'other.woff2',
      'figtree-latin-wght-normal.woff',
      'figtree-latin-wght-normal.woff2.map',
      '..%2F..%2Fpackage.json',
      '%2e%2e/package.json',
      'figtree-cyrillic-wght-normal.woff2',
    ];
    for (const name of names) {
      const answer = await call(studio.port, {
        path: `/assets/fonts/${name}`,
        headers: { cookie },
      });
      assert.ok(answer.status === 404 || answer.status === 400, `${name}: ${answer.status}`);
      assert.ok(!answer.text.includes('wOF2'), name);
    }
  } finally {
    await studio.close();
  }
});

test('a font that cannot be read is a server error, and the pages still answer', async () => {
  const failing = { ...fakeAssets, font: () => Promise.reject(new Error('no file')) };
  const { studio, errors } = await shopStudio({}, { assets: failing });
  try {
    const cookie = await pageCookie(studio);
    const answer = await call(studio.port, {
      path: `/assets/fonts/${FONT_FILES[0]}`,
      headers: { cookie },
    });
    assert.equal(answer.status, 500);
    assert.equal(errors.length, 1);
    assert.equal((await call(studio.port, { path: '/', headers: { cookie } })).status, 200);
  } finally {
    await studio.close();
  }
});

test('the installed font package has every file the skin names', async () => {
  const assets = createEsbuildAssets({
    roots: defaultDepRoots(),
    clientDir: join(PLUGIN_ROOT, 'client'),
  });
  for (const file of FONT_FILES) {
    const bytes = await assets.font(file);
    assert.equal(bytes.subarray(0, 4).toString('latin1'), 'wOF2', file);
    assert.ok(bytes.length > 10_000, file);
    // Read once, then answered from memory.
    assert.equal(await assets.font(file), bytes);
  }
});
