import assert from 'node:assert/strict';
import { test } from 'node:test';
import { MIN_NAME, markFits } from '../../../../client/studio/canvas/caption.ts';

const base = { caption: 390, name: 60, mark: 64, size: 70, gap: 24 };

test('the mark shows when the name keeps its room beside it and the size', () => {
  assert.equal(markFits(base), true);
});

test('the mark is left out of a narrow caption so it never covers the name', () => {
  assert.equal(markFits({ ...base, caption: 200 }), false);
});

test('a short name needs only its own width, a long one at most the minimum', () => {
  const room = base.mark + base.size + 2 * base.gap;
  assert.equal(markFits({ ...base, caption: room + 20, name: 20 }), true);
  assert.equal(markFits({ ...base, caption: room + 19, name: 20 }), false);
  assert.equal(markFits({ ...base, caption: room + MIN_NAME, name: 400 }), true);
  assert.equal(markFits({ ...base, caption: room + MIN_NAME - 1, name: 400 }), false);
});
