import assert from 'node:assert/strict';
import { test } from 'node:test';
import { safeSegments } from '../../../src/studio/security/file-paths.ts';

test('plain paths split into decoded segments', () => {
  assert.deepEqual(safeSegments('/f/key/shop/v1/css/index.css'), [
    'f',
    'key',
    'shop',
    'v1',
    'css',
    'index.css',
  ]);
  assert.deepEqual(safeSegments('/f/a%20b.png'), ['f', 'a b.png']);
  assert.deepEqual(safeSegments('/f/console.js'), ['f', 'console.js']);
});

test('paths that could leave the folder or alias a file are refused', () => {
  const corpus = [
    '/a/../b',
    '/a/./b',
    '/a/%2e%2e/b',
    '/a/%2E%2E/b',
    '/a/..%2fb',
    '/a/%2F',
    '/a/%5cb',
    '/a\\b',
    '/a/%00',
    '/a/b%00.png',
    '/a/%0a',
    '/C:/x',
    '/a/c%3a',
    '/a/con',
    '/a/CON.txt',
    '/a/nul.png',
    '/a/com1',
    '/a/LPT9.log',
    '/a/conin$',
    '/a/x.',
    '/a/x%20',
    '//a',
    '/a//b',
    '/a/',
    '/a/%E0%A4%A',
  ];
  for (const path of corpus) assert.equal(safeSegments(path), undefined, path);
});
