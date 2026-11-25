import assert from 'node:assert/strict';
import { test } from 'node:test';
import { DRAG_PX, dragLeft, tabShift } from '../../../../client/studio/shell/tab-row.ts';
import { SKIN_EDITOR_BODY } from '../../../../src/studio/pages/skin/editor/body.ts';

test('a tab cut off at either end is brought whole into the row; one in view stays', () => {
  const row = { left: 100, right: 300 };
  assert.equal(tabShift(row, { left: 120, right: 180 }), 0);
  assert.equal(tabShift(row, { left: 260, right: 330 }), 30);
  assert.equal(tabShift(row, { left: 70, right: 130 }), -30);
  // A tab wider than the row shows its start.
  assert.equal(tabShift(row, { left: 90, right: 340 }), -10);
});

test('the tab row is one line that scrolls sideways without a bar, never a second row', () => {
  const rule = /\.side-tabs \{([^}]*)\}/.exec(SKIN_EDITOR_BODY)?.[1] ?? '';
  assert.match(rule, /flex-wrap: nowrap;/);
  assert.match(rule, /overflow-x: auto;/);
  assert.match(rule, /scrollbar-width: none;/);
  assert.ok(SKIN_EDITOR_BODY.includes('.side-tabs::-webkit-scrollbar { display: none; }'));
  assert.match(SKIN_EDITOR_BODY, /.side-tabs > .k-tab { flex: none;/);
});

test('a press dragged sideways scrolls the row with the pointer; a short one stays a click', () => {
  const press = { from: 200, left: 30 };
  assert.equal(dragLeft(press, 200 + DRAG_PX - 1), null);
  assert.equal(dragLeft(press, 200 - (DRAG_PX - 1)), null);
  // Dragged left, the row moves on: the tabs after come into view.
  assert.equal(dragLeft(press, 160), 70);
  // Dragged right, back towards the first tab.
  assert.equal(dragLeft(press, 220), 10);
});
