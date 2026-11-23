import assert from 'node:assert/strict';
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { test } from 'node:test';
import { frameFile, frameFileMap } from '../../../src/studio/frame/frame-files.ts';
import { frameUrl, parseFramePath } from '../../../src/studio/frame/frame-url.ts';
import { tempDir } from '../../helpers/tmp.ts';

function buildDir(): string {
  const dir = join(tempDir('kitvas-frame-'), 'build');
  const files: Record<string, string> = {
    'html/index.html': '<!doctype html>',
    'js/index.js': 'void 0;',
    'css/index.css': 'body{}',
    'img/photos/a.png': 'png',
    'img/notes.txt': 'not served',
    'json/ids.json': '{}',
    'shots/filled-390.png': 'png',
  };
  for (const [rel, text] of Object.entries(files)) {
    const file = join(dir, ...rel.split('/'));
    mkdirSync(dirname(file), { recursive: true });
    writeFileSync(file, text);
  }
  return dir;
}

test('the map holds the page, its script, its sheet and images, nothing else', () => {
  assert.deepEqual([...frameFileMap(buildDir()).keys()].sort(), [
    'css/index.css',
    'html/index.html',
    'img/photos/a.png',
    'js/index.js',
  ]);
});

test('a file is found by its path below build/, with its content type', () => {
  const dir = buildDir();
  const css = frameFile(dir, 'css/index.css');
  assert.equal(css?.type, 'text/css; charset=utf-8');
  assert.ok(css?.file.endsWith('index.css'));
  assert.equal(frameFile(dir, 'img/photos/a.png')?.type, 'image/png');
  const refused = [
    'json/ids.json',
    'shots/filled-390.png',
    'img/notes.txt',
    'html/../json/ids.json',
    'html/missing.html',
  ];
  for (const rel of refused) assert.equal(frameFile(dir, rel), undefined, rel);
});

test('a missing build folder serves nothing', () => {
  assert.equal(frameFile(join(tempDir(), 'none'), 'html/index.html'), undefined);
});

test('frame paths name the key, the draft, the version and the file', () => {
  assert.deepEqual(parseFramePath(['f', 'k3y', 'shop', 'v2', 'css', 'index.css']), {
    key: 'k3y',
    slug: 'shop',
    version: 2,
    relPath: 'css/index.css',
  });
  const refused = [
    ['g', 'k', 'shop', 'v1', 'css', 'a.css'],
    ['f', 'k', 'Shop', 'v1', 'css', 'a.css'],
    ['f', 'k', 'shop', 'v0', 'css', 'a.css'],
    ['f', 'k', 'shop', '1', 'css', 'a.css'],
    ['f', 'k', 'shop', 'v1', 'index.html'],
    ['f', '', 'shop', 'v1', 'css', 'a.css'],
  ];
  for (const segments of refused) {
    assert.equal(parseFramePath(segments), undefined, segments.join('/'));
  }
});

test('the frame address carries the state', () => {
  const target = { hostname: 'localhost', port: 5001, key: 'k', slug: 'shop', version: 3 };
  assert.equal(
    frameUrl({ ...target, state: 'empty' }),
    'http://localhost:5001/f/k/shop/v3/html/index.html?state=empty',
  );
});
