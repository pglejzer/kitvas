import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { test } from 'node:test';
import {
  CLAUDE_MARK_MS,
  POINTER_PATH,
  POINTER_PLACE,
  placeTag,
} from '../../../../client/frame/edit/claude-marks.ts';
import { SKIN_LOGO } from '../../../../src/studio/pages/skin/logo.ts';

const view = { width: 1000, height: 800 };
const tag = { width: 60, height: 18 };

test('the tag sits under the bottom right corner', () => {
  const box = { left: 100, top: 100, width: 300, height: 200 };
  assert.deepEqual(placeTag(box, tag, view), { left: 340, top: 304 });
});

test('the tag goes inside the box when there is no room under it', () => {
  const box = { left: 100, top: 590, width: 300, height: 200 };
  assert.deepEqual(placeTag(box, tag, view), { left: 340, top: 790 - 18 - 4 });
});

test('the tag stays inside the window on the left', () => {
  const box = { left: 0, top: 100, width: 30, height: 20 };
  assert.equal(placeTag(box, tag, view).left, 0);
});

test('the tag stays inside the window on the right', () => {
  const box = { left: 900, top: 100, width: 400, height: 20 };
  assert.equal(placeTag(box, tag, view).left, 1000 - 60);
});

test('the working motion has the period of the bar logo working sign', () => {
  const found = /k-logo-tap (\d+(?:\.\d+)?)s ease-in-out infinite/.exec(SKIN_LOGO);
  assert.ok(found?.[1]);
  assert.equal(CLAUDE_MARK_MS, Math.round(Number(found[1]) * 1000));
});

test('the pointer is the logo pointer, with the place the logo gives it', async () => {
  const logo = await readFile(
    new URL('../../../../src/studio/pages/brand/logo.ts', import.meta.url),
    'utf8',
  );
  assert.ok(logo.includes(`const V = '${POINTER_PATH}';`));
  assert.ok(logo.includes(`const POINTER_PLACE = '${POINTER_PLACE}';`));
});
