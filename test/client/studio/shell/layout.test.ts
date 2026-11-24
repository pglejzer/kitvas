import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  clampSide,
  DEFAULT_WIDTH,
  dragWidth,
  fitSides,
  foldBoth,
  foldOnSwitch,
  GRIP_STEP,
  gripKey,
  LAYOUT_KEY,
  MAX_SIDE,
  MIN_SIDE,
  nextTab,
  noSettings,
  openingSide,
  readSettings,
  type Settings,
  type StorageLike,
  tabFor,
  writeSettings,
} from '../../../../client/studio/shell/layout.ts';

/** A storage in memory; `broken` makes every call throw, as a blocked one does. */
function memory(broken = false): StorageLike & { items: Map<string, string> } {
  const items = new Map<string, string>();
  return {
    items,
    getItem(key) {
      if (broken) throw new Error('blocked');
      return items.get(key) ?? null;
    },
    setItem(key, value) {
      if (broken) throw new Error('blocked');
      items.set(key, value);
    },
  };
}

test('a panel is at least 220 px and at most 720 px or 45 % of the window', () => {
  assert.equal(clampSide(100, 1600, 320), MIN_SIDE);
  assert.equal(clampSide(300, 1600, 320), 300);
  assert.equal(clampSide(900, 2400, 320), MAX_SIDE);
  // 45 % of 1400 is 630, less than 720 and less than what the canvas leaves.
  assert.equal(clampSide(700, 1400, 272), 630);
  assert.equal(clampSide(300.6, 1600, 320), 301);
});

test('the canvas keeps 320 px beside both panels, and the minimum wins in a tiny window', () => {
  // 1300 - 600 - 320 leaves 380 for this panel.
  assert.equal(clampSide(500, 1300, 600), 380);
  assert.equal(clampSide(400, 1100, 720), MIN_SIDE);
  // A width that is not a number is the least; a window that is not one limits nothing but 720.
  assert.equal(clampSide(Number.NaN, 1600, 320), MIN_SIDE);
  assert.equal(clampSide(1000, Number.NaN, 320), MAX_SIDE);
});

test('both panels fit the window, the left first, a folded one counting as its rail', () => {
  const open = { left: { width: 700, folded: false }, right: { width: 700, folded: false } };
  // The left leaves the canvas 320 beside the right's 700; the right then gets 45 %.
  assert.deepEqual(fitSides(open, 1400), { left: 380, right: 630 });
  const folded = { ...open, right: { width: 700, folded: true } };
  // Beside a 40 px rail the left gets 45 %; the right, opened again, gets what is left.
  assert.deepEqual(fitSides(folded, 1400), { left: 630, right: 450 });
});

test('a grip steps 16 px outwards and inwards, and Home and End go to the ends', () => {
  assert.equal(gripKey('ArrowRight', 'left', 300), 300 + GRIP_STEP);
  assert.equal(gripKey('ArrowLeft', 'left', 300), 300 - GRIP_STEP);
  // The right panel's grip is on its left edge: left widens it.
  assert.equal(gripKey('ArrowLeft', 'right', 300), 300 + GRIP_STEP);
  assert.equal(gripKey('ArrowRight', 'right', 300), 300 - GRIP_STEP);
  assert.equal(gripKey('Home', 'right', 300), MIN_SIDE);
  assert.equal(gripKey('End', 'left', 300), MAX_SIDE);
  for (const key of ['ArrowUp', 'Enter', ' ', 'a']) assert.equal(gripKey(key, 'left', 300), null);
});

test('a drag widens the left panel to the right and the right panel to the left', () => {
  assert.equal(dragWidth('left', 300, 40), 340);
  assert.equal(dragWidth('right', 300, 40), 260);
  assert.equal(dragWidth('right', 300, -40), 340);
});

test('the settings come back from storage as they were written', () => {
  const storage = memory();
  const settings: Settings = {
    left: { width: 300, folded: false },
    right: { width: null, folded: true },
  };
  assert.equal(writeSettings(storage, settings), true);
  assert.ok(storage.items.has(LAYOUT_KEY));
  assert.deepEqual(readSettings(storage), settings);
});

test('missing, broken or foreign storage gives no settings, and the screen still works', () => {
  assert.deepEqual(readSettings(null), noSettings());
  assert.equal(writeSettings(null, noSettings()), false);
  const broken = memory(true);
  assert.deepEqual(readSettings(broken), noSettings());
  assert.equal(writeSettings(broken, noSettings()), false);
  const storage = memory();
  for (const raw of ['{not json', '"text"', 'null', '[1,2]', '{"left":7}']) {
    storage.items.set(LAYOUT_KEY, raw);
    assert.deepEqual(readSettings(storage), noSettings(), raw);
  }
});

test('a stored width outside 220 to 720 or a fold that is not a boolean is dropped', () => {
  const storage = memory();
  storage.items.set(
    LAYOUT_KEY,
    JSON.stringify({
      left: { width: 9000, folded: 'yes' },
      right: { width: 250.4, folded: false },
    }),
  );
  assert.deepEqual(readSettings(storage), {
    left: { width: null, folded: null },
    right: { width: 250, folded: false },
  });
});

test('Preview opens with the left panel folded and the right one on Checks', () => {
  const none = noSettings();
  assert.deepEqual(openingSide(none.left, 'left', 'preview'), {
    width: DEFAULT_WIDTH.left,
    folded: true,
  });
  assert.deepEqual(openingSide(none.right, 'right', 'preview'), {
    width: DEFAULT_WIDTH.right,
    folded: false,
  });
  const right = ['properties', 'changes', 'checks'];
  assert.equal(tabFor('right', 'preview', undefined, right), 'checks');
  assert.equal(tabFor('left', 'preview', undefined, ['layers', 'insert']), 'layers');
});

test('Edit opens the left panel on Layers and the right one on Properties', () => {
  const none = noSettings();
  assert.equal(openingSide(none.left, 'left', 'edit').folded, false);
  assert.equal(foldOnSwitch(none.left, 'left', 'edit', true), false);
  const right = ['properties', 'changes', 'checks'];
  assert.equal(tabFor('right', 'edit', undefined, right), 'properties');
  assert.equal(tabFor('left', 'edit', undefined, ['layers', 'insert']), 'layers');
});

test('a switch back to Preview leaves an open panel open, so nothing moves', () => {
  const none = noSettings();
  assert.equal(foldOnSwitch(none.left, 'left', 'preview', false), false);
  assert.equal(foldOnSwitch(none.left, 'left', 'preview', true), true);
  assert.equal(foldOnSwitch(none.right, 'right', 'preview', false), false);
});

test('a fold or width the person set wins over every mode, on load and on a switch', () => {
  const set = { width: 400, folded: true };
  assert.deepEqual(openingSide(set, 'left', 'edit'), { width: 400, folded: true });
  assert.equal(foldOnSwitch(set, 'left', 'edit', false), true);
  const open = { width: null, folded: false };
  const opened = openingSide(open, 'left', 'preview');
  assert.deepEqual(opened, { width: DEFAULT_WIDTH.left, folded: false });
  assert.equal(foldOnSwitch(open, 'left', 'preview', false), false);
});

test('a tab picked in a mode comes back in that mode; a tab the page lacks never shows', () => {
  const tabs = ['properties', 'changes', 'checks'];
  assert.equal(tabFor('right', 'edit', 'changes', tabs), 'changes');
  assert.equal(tabFor('right', 'edit', 'sketches', tabs), 'properties');
  assert.equal(tabFor('right', 'preview', undefined, ['a', 'b']), 'a');
});

test('Ctrl+\\ folds both panels unless both are folded; then it opens both', () => {
  assert.equal(foldBoth({ left: false, right: false }), true);
  assert.equal(foldBoth({ left: true, right: false }), true);
  assert.equal(foldBoth({ left: true, right: true }), false);
});

test('the arrow keys move along the tabs and wrap around; Home and End go to the ends', () => {
  const tabs = ['properties', 'changes', 'checks'];
  assert.equal(nextTab(tabs, 'properties', 'ArrowRight'), 'changes');
  assert.equal(nextTab(tabs, 'checks', 'ArrowRight'), 'properties');
  assert.equal(nextTab(tabs, 'properties', 'ArrowLeft'), 'checks');
  assert.equal(nextTab(tabs, 'changes', 'Home'), 'properties');
  assert.equal(nextTab(tabs, 'changes', 'End'), 'checks');
  assert.equal(nextTab(tabs, 'changes', 'Enter'), null);
  assert.equal(nextTab([], 'changes', 'ArrowRight'), null);
});
