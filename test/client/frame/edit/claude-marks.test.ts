import assert from 'node:assert/strict';
import { test } from 'node:test';
import { placeTag } from '../../../../client/frame/edit/claude-marks.ts';

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
