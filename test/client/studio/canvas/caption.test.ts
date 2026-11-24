import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  cardSize,
  MIN_NAME,
  markFits,
  type Say,
} from '../../../../client/studio/canvas/caption.ts';
import { t } from '../../../helpers/translate.ts';

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

/** The editor's texts as the page hands them to the script: `studio.edit.` keys without it. */
const say: Say = (key, params) => t(`studio.edit.${key}`, params);

test('the label names a preset by its name and width, any other width in pixels', () => {
  assert.equal(
    cardSize(1280, say),
    t('studio.edit.canvas.size.preset', { name: t('studio.edit.canvas.width.1280'), width: 1280 }),
  );
  assert.equal(cardSize(1000, say), t('studio.edit.canvas.size.custom', { width: 1000 }));
});

test('the script names a width as the server does', () => {
  // The client's names of the presets are the server's (`studio.width.*`).
  for (const width of [390, 768, 1280]) {
    assert.equal(t(`studio.edit.canvas.width.${width}`), t(`studio.width.${width}`), String(width));
  }
});
