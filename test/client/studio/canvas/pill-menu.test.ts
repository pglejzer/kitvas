import assert from 'node:assert/strict';
import { test } from 'node:test';
import { pillMenu } from '../../../../client/studio/canvas/pill-menu.ts';
import { stepFocus } from '../../../../client/studio/canvas/pill-menus.ts';
import { PRESETS } from '../../../../client/studio/canvas/width.ts';

test('the pill shows the three presets, and More does not list them again', () => {
  assert.deepEqual([...PRESETS], [390, 768, 1280]);
  const { sizes } = pillMenu({ width: 390, cards: 1 });
  for (const preset of PRESETS) assert.ok(!sizes.includes(preset), String(preset));
});

test('More holds the other sizes, the custom width and Cards', () => {
  const menu = pillMenu({ width: 768, cards: 2 });
  assert.deepEqual(menu.sizes, [320, 430, 1024, 1440, 1920, 2560]);
  // The custom width has its field in the menu at any width; the card choice is the one shown.
  assert.equal(menu.cards, 2);
  assert.equal(pillMenu({ width: 768, cards: 3, every: true }).cards, 'every');
  assert.equal(pillMenu({ width: 768, cards: 3 }).cards, 3);
});

test('a width that is not a preset shows in the pill as its number, pressed', () => {
  for (const preset of PRESETS) {
    assert.equal(pillMenu({ width: preset, cards: 1 }).custom, false, String(preset));
  }
  // A size from the menu is not a preset either: it takes the pill's extra button.
  assert.equal(pillMenu({ width: 1440, cards: 1 }).custom, true);
  assert.equal(pillMenu({ width: 1000, cards: 1 }).custom, true);
});

test('a menu is walked with the arrows, Home and End, and wraps at both ends', () => {
  assert.equal(stepFocus(4, -1, 'ArrowDown'), 0);
  assert.equal(stepFocus(4, 1, 'ArrowDown'), 2);
  assert.equal(stepFocus(4, 3, 'ArrowDown'), 0);
  assert.equal(stepFocus(4, -1, 'ArrowUp'), 3);
  assert.equal(stepFocus(4, 0, 'ArrowUp'), 3);
  assert.equal(stepFocus(4, 2, 'ArrowUp'), 1);
  assert.equal(stepFocus(4, 2, 'Home'), 0);
  assert.equal(stepFocus(4, 0, 'End'), 3);
  assert.equal(stepFocus(4, 0, 'a'), null);
  assert.equal(stepFocus(0, -1, 'ArrowDown'), null);
});
