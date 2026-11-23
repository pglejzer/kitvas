import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  catalogFrameUrl,
  parseCatalogPath,
  parseFrameAddress,
} from '../../../src/studio/frame/frame-url.ts';

test('a catalog address names the key, the kit and the file below its build folder', () => {
  assert.deepEqual(parseCatalogPath(['k', 'KEY', 'base', 'html', 'index.html']), {
    key: 'KEY',
    kitId: 'base',
    relPath: 'html/index.html',
  });
  assert.deepEqual(parseCatalogPath(['k', 'KEY', 'my-kit-2', 'img', 'a', 'b.png']), {
    key: 'KEY',
    kitId: 'my-kit-2',
    relPath: 'img/a/b.png',
  });
});

test('addresses that are not a catalog address are refused', () => {
  const bad: string[][] = [
    ['k', 'KEY', 'base', 'html'],
    ['k', 'KEY', 'base'],
    ['k', 'KEY'],
    ['k'],
    [],
    ['k', '', 'base', 'html', 'index.html'],
    ['k', 'KEY', 'Base', 'html', 'index.html'],
    ['k', 'KEY', '-base', 'html', 'index.html'],
    ['k', 'KEY', 'a'.repeat(64), 'html', 'index.html'],
    ['k', 'KEY', 'ba se', 'html', 'index.html'],
    ['k', 'KEY', '..', 'html', 'index.html'],
    ['x', 'KEY', 'base', 'html', 'index.html'],
  ];
  for (const segments of bad) {
    assert.equal(parseCatalogPath(segments), undefined, segments.join('/'));
  }
});

test('both kinds of address are told apart by their first segment', () => {
  assert.deepEqual(parseFrameAddress(['f', 'KEY', 'shop', 'v2', 'html', 'index.html']), {
    kind: 'draft',
    key: 'KEY',
    slug: 'shop',
    version: 2,
    relPath: 'html/index.html',
  });
  assert.deepEqual(parseFrameAddress(['k', 'KEY', 'base', 'js', 'index.js']), {
    kind: 'catalog',
    key: 'KEY',
    kitId: 'base',
    relPath: 'js/index.js',
  });
  assert.equal(parseFrameAddress(['api', 'v1']), undefined);
  assert.equal(parseFrameAddress(['f', 'KEY', 'shop', 'html', 'index.html']), undefined);
});

test('an example address encodes the example key', () => {
  assert.equal(
    catalogFrameUrl({
      hostname: '127.0.0.1',
      port: 5001,
      key: 'KEY',
      kitId: 'base',
      example: 'Button.1',
    }),
    'http://127.0.0.1:5001/k/KEY/base/html/index.html?example=Button.1',
  );
  const odd = catalogFrameUrl({
    hostname: 'localhost',
    port: 5001,
    key: 'KEY',
    kitId: 'base',
    example: 'A B&c.1',
  });
  assert.ok(odd.endsWith('?example=A%20B%26c.1'));
});
