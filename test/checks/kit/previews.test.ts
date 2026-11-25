import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  BACKDROP,
  componentFile,
  PREVIEWS_FORMAT,
  type PreviewsStamp,
  previewFolder,
  previewsFresh,
  readPreviewsStamp,
  SHEET_FILE,
  stampFiles,
} from '../../../src/checks/index.ts';

const KEY = 'a'.repeat(64);

const stamp = (over: Partial<PreviewsStamp> = {}): PreviewsStamp => ({
  schemaVersion: 1,
  kit: 'base',
  format: PREVIEWS_FORMAT,
  catalog: KEY,
  folder: previewFolder(KEY),
  backdrop: '#ffffff',
  components: { Button: componentFile(0) },
  icons: { file: SHEET_FILE, cell: 32, columns: 8, names: ['check'] },
  ...over,
});

test('previews are fresh only for this kit, this format and the catalog key a build has now', () => {
  assert.equal(previewsFresh(stamp(), 'base', KEY), true);
  assert.equal(previewsFresh(stamp(), 'base', 'b'.repeat(64)), false, 'the kit changed');
  assert.equal(previewsFresh(stamp(), 'base', undefined), false, 'the kit cannot be built');
  assert.equal(previewsFresh(stamp(), 'other', KEY), false, 'another kit');
  assert.equal(previewsFresh(stamp({ format: PREVIEWS_FORMAT + 1 }), 'base', KEY), false);
  assert.equal(previewsFresh(undefined, 'base', KEY), false, 'none were made');
});

test('a set lives in a folder named by the format and the catalog key, so its addresses change', () => {
  assert.equal(previewFolder(KEY), `v${PREVIEWS_FORMAT}-${'a'.repeat(16)}`);
  assert.notEqual(previewFolder(KEY), previewFolder('b'.repeat(64)));
  assert.equal(componentFile(3), 'component-3.png');
  assert.deepEqual(stampFiles(stamp()), ['component-0.png', 'icons.png']);
  assert.deepEqual(stampFiles(stamp({ icons: null, components: {} })), []);
});

test('the stamp reads back; one of another shape, with other files or not JSON is none', () => {
  assert.deepEqual(readPreviewsStamp(JSON.stringify(stamp())), stamp());
  assert.equal(readPreviewsStamp(undefined), undefined);
  assert.equal(readPreviewsStamp('{'), undefined);
  const bad: Record<string, unknown>[] = [
    { ...stamp(), schemaVersion: 2 },
    { ...stamp(), catalog: 'short' },
    { ...stamp(), folder: '../build' },
    { ...stamp(), components: { Button: '../build/js/index.js' } },
    { ...stamp(), components: { Button: 'component-0.html' } },
    { ...stamp(), icons: { file: 'sheet.svg', cell: 32, columns: 1, names: [] } },
    { ...stamp(), backdrop: 'red; background: url(x)' },
    { ...stamp(), extra: true },
  ];
  for (const value of bad) assert.equal(readPreviewsStamp(JSON.stringify(value)), undefined);
});

test('a backdrop is a hex colour or an rgb() or rgba() value, nothing else', () => {
  for (const good of ['#ffffff', '#0A0b0C', 'rgb(255, 255, 255)', 'rgba(0, 0, 0, 0.5)']) {
    assert.equal(BACKDROP.test(good), true, good);
  }
  const refused = ['#fff', 'white', 'oklch(0.9 0 0)', 'rgb(1,2,3);x', 'url(x)', 'rgb()', ''];
  for (const bad of refused) assert.equal(BACKDROP.test(bad), false, bad);
});
