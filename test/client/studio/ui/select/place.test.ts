import assert from 'node:assert/strict';
import { test } from 'node:test';
import { placeList } from '../../../../../client/studio/ui/select/place.ts';

const view = { width: 1000, height: 800 };

test('the list opens under the trigger, at least 240 wide', () => {
  assert.deepEqual(placeList({ left: 100, top: 100, width: 180, height: 28 }, view, 200), {
    left: 100,
    top: 132,
    width: 240,
    maxHeight: 320,
    above: false,
  });
});

test('the list opens above when there is no room under it', () => {
  const placed = placeList({ left: 100, top: 700, width: 180, height: 28 }, view, 300);
  assert.equal(placed.above, true);
  assert.equal(placed.top, 396);
  assert.equal(placed.maxHeight, 320);
});

test('the list stays inside the window on the right', () => {
  const placed = placeList({ left: 900, top: 100, width: 180, height: 28 }, view, 200);
  assert.equal(placed.left, 752);
});
