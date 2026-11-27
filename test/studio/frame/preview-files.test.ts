import assert from 'node:assert/strict';
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { test } from 'node:test';
import { frameFile, frameFileMap, SERVED_PREVIEWS } from '../../../src/studio/frame/frame-files.ts';
import { catalogPreviewUrl, parseFrameAddress } from '../../../src/studio/frame/frame-url.ts';
import { tempDir } from '../../helpers/tmp.ts';

const SET = 'v1-0123456789abcdef';

/** A kit's catalog folder with a set of previews beside its build. */
function catalogFolder(): string {
  const dir = tempDir('kitvas-previews-');
  const files: Record<string, string> = {
    [`previews/${SET}/component-0.png`]: 'png',
    [`previews/${SET}/icons.png`]: 'png',
    [`previews/${SET}/page.html`]: '<script>1</script>',
    [`previews/${SET}/glyph.svg`]: '<svg/>',
    'previews/previews.json': '{}',
    'build/html/index.html': '<!doctype html>',
    'build/js/index.js': 'void 0;',
    'verify.json': '{}',
  };
  for (const [rel, text] of Object.entries(files)) {
    const file = join(dir, ...rel.split('/'));
    mkdirSync(dirname(file), { recursive: true });
    writeFileSync(file, text);
  }
  return dir;
}

test('the previews of a catalog folder serve their PNG files and nothing else', () => {
  const dir = catalogFolder();
  assert.deepEqual([...frameFileMap(dir, SERVED_PREVIEWS).keys()].sort(), [
    `previews/${SET}/component-0.png`,
    `previews/${SET}/icons.png`,
  ]);
  assert.equal(frameFile(dir, `previews/${SET}/icons.png`, SERVED_PREVIEWS)?.type, 'image/png');
  const refused = [
    'previews/previews.json',
    `previews/${SET}/page.html`,
    `previews/${SET}/glyph.svg`,
    `previews/${SET}/../../verify.json`,
    'build/html/index.html',
    'build/js/index.js',
    'verify.json',
    `previews/${SET}/missing.png`,
  ];
  for (const rel of refused) assert.equal(frameFile(dir, rel, SERVED_PREVIEWS), undefined, rel);
});

test('the build of a catalog folder never serves the previews beside it', () => {
  const dir = catalogFolder();
  assert.equal(frameFile(join(dir, 'build'), `previews/${SET}/icons.png`), undefined);
  assert.equal(frameFile(join(dir, 'build'), `../previews/${SET}/icons.png`), undefined);
});

test('a preview address is a kit catalog address whose path starts at previews/', () => {
  const url = catalogPreviewUrl({
    hostname: 'kitvas.localhost',
    port: 5001,
    key: 'k3y',
    kitId: 'kitvas-ui',
    path: `previews/${SET}/component-0.png`,
  });
  assert.equal(url, `http://kitvas.localhost:5001/k/k3y/kitvas-ui/previews/${SET}/component-0.png`);
  const segments = new URL(url).pathname.split('/').slice(1);
  assert.deepEqual(parseFrameAddress(segments), {
    kind: 'catalog',
    key: 'k3y',
    kitId: 'kitvas-ui',
    relPath: `previews/${SET}/component-0.png`,
  });
  // Each segment is encoded on its own: a slash inside a name could never make another folder.
  const target = { hostname: 'h', port: 1, key: 'k', kitId: 'kitvas-ui' };
  const odd = catalogPreviewUrl({ ...target, path: 'a b/c?d' });
  assert.equal(odd, 'http://h:1/k/k/kitvas-ui/a%20b/c%3Fd');
});
