import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  CHROME,
  clampSide,
  DEFAULT_WIDTH,
  dragWidth,
  FOLDED,
  fitSides,
  foldBoth,
  foldOnSwitch,
  GAP,
  GRIP_STEP,
  gripKey,
  LAYOUT_KEY,
  LEFT_PANES,
  MAX_SIDE,
  MIN_SIDE,
  nextTab,
  noSettings,
  openingSide,
  RAIL,
  type RailView,
  railClick,
  railPressed,
  readSettings,
  type Settings,
  type StorageLike,
  sideOfPane,
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
  // Beside a 52 px rail the left gets 45 %; the right, opened again, gets what is left.
  assert.deepEqual(fitSides(folded, 1400), { left: 630, right: 450 });
});

test('a folded left panel takes no room: the rail beside it stays, the right one keeps a rail', () => {
  assert.deepEqual(FOLDED, { left: 0, right: RAIL });
  const both = { left: { width: 700, folded: false }, right: { width: 700, folded: false } };
  // Beside an open left panel of 220 the right gets 900 - 220 - 320.
  assert.deepEqual(fitSides(both, 900), { left: MIN_SIDE, right: 360 });
  // Beside a folded one it gets 45 % of the room.
  const left = { ...both, left: { width: 700, folded: true } };
  assert.equal(fitSides(left, 900).right, 405);
});

test('the panels start at the studio sizes, and the body keeps the rail and the gaps', () => {
  assert.deepEqual(DEFAULT_WIDTH, { left: 248, right: 312 });
  assert.equal(RAIL, 52);
  assert.equal(GAP, 10);
  // The rail, and in Cards a gap at each edge and between the four columns.
  assert.equal(CHROME, RAIL + 5 * GAP);
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

test('a layout stored before the rail loads as it was: the same key and the same shape', () => {
  const storage = memory();
  // What the screen of plan 15 wrote: its old default widths, the right panel folded.
  storage.items.set(
    'kitvas.editor.layout',
    JSON.stringify({ left: { width: 272, folded: false }, right: { width: 320, folded: true } }),
  );
  const settings = readSettings(storage);
  assert.deepEqual(settings, {
    left: { width: 272, folded: false },
    right: { width: 320, folded: true },
  });
  assert.deepEqual(openingSide(settings.left, 'left', 'preview'), { width: 272, folded: false });
  assert.deepEqual(openingSide(settings.right, 'right', 'edit'), { width: 320, folded: true });
  // Only the defaults moved to the new sizes.
  const none = readSettings(memory());
  assert.equal(openingSide(none.left, 'left', 'edit').width, 248);
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

test('the rail holds the left panel panes in order, Notes among them', () => {
  assert.deepEqual([...LEFT_PANES], ['layers', 'insert', 'why', 'notes']);
  assert.equal(tabFor('left', 'edit', 'notes', LEFT_PANES), 'notes');
});

test('one rail button is pressed at a time: the pane shown in the open panel', () => {
  const open: RailView = { tab: 'notes', open: true };
  const pressed = LEFT_PANES.filter((pane) => railPressed(pane, open));
  assert.deepEqual(pressed, ['notes']);
  // A folded panel shows no pane: none is pressed.
  const folded: RailView = { tab: 'notes', open: false };
  assert.deepEqual(
    LEFT_PANES.filter((pane) => railPressed(pane, folded)),
    [],
  );
});

test('a rail click opens its pane, and a click on the pane shown folds the panel', () => {
  // Folded: the click opens the panel on that pane.
  assert.deepEqual(railClick('insert', { tab: 'layers', open: false }), {
    tab: 'insert',
    open: true,
  });
  // Open on another pane: it switches, the panel stays open.
  assert.deepEqual(railClick('notes', { tab: 'layers', open: true }), { tab: 'notes', open: true });
  // Open on this pane: the panel folds and keeps the pane for the next time.
  assert.deepEqual(railClick('notes', { tab: 'notes', open: true }), {
    tab: 'notes',
    open: false,
  });
  // Folded on this pane: it opens again.
  assert.deepEqual(railClick('notes', { tab: 'notes', open: false }), { tab: 'notes', open: true });
});

test('a [data-open-pane] button finds the side that holds its pane', () => {
  const panes = {
    left: LEFT_PANES,
    right: ['properties', 'changes', 'checks', 'ai'],
  };
  assert.equal(sideOfPane('notes', panes), 'left');
  assert.equal(sideOfPane('checks', panes), 'right');
  assert.equal(sideOfPane('layers', panes), 'left');
  // A pane the page lacks (Sketches outside a craft draft), or none named: nothing opens.
  assert.equal(sideOfPane('sketches', panes), null);
  assert.equal(sideOfPane(undefined, panes), null);
  assert.equal(sideOfPane('', panes), null);
});
