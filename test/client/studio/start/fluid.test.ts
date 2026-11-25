import assert from 'node:assert/strict';
import { test } from 'node:test';
import { THUMB_PAGE_WIDTH, thumbScale } from '../../../../client/studio/start/fluid.ts';
import { SKIN_GALLERY } from '../../../../src/studio/pages/skin/pages/gallery.ts';

test('the scale draws the 1280 px page across the thumbnail', () => {
  assert.equal(thumbScale(264), 0.20625);
  assert.equal(thumbScale(320), 0.25);
  assert.equal(thumbScale(THUMB_PAGE_WIDTH), 1);
});

test('a thumbnail that is not laid out gives no scale', () => {
  assert.equal(thumbScale(0), null);
  assert.equal(thumbScale(-4), null);
  assert.equal(thumbScale(Number.NaN), null);
});

test('without the script the skin keeps the fixed column and the fixed scale', () => {
  assert.ok(SKIN_GALLERY.includes('grid-template-columns: repeat(auto-fill, 280px);'));
  assert.ok(SKIN_GALLERY.includes('scale: 0.20625;'));
  // The fluid rules apply only to a grid the script marked, and fall back to the same scale.
  assert.ok(
    SKIN_GALLERY.includes(
      '.gallery-grid[data-fluid] { grid-template-columns: repeat(auto-fill, minmax(250px, 1fr)); }',
    ),
  );
  assert.ok(SKIN_GALLERY.includes('scale: var(--thumb-scale, 0.20625);'));
});
