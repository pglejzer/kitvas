import assert from 'node:assert/strict';
import { test } from 'node:test';
import type { ActionState } from '../../../client/studio/edit/actions.ts';
import {
  activate,
  clampToView,
  componentItems,
  type MenuItem,
  menuItems,
  selectionFor,
  stepIndex,
  toPagePoint,
} from '../../../client/studio/edit/menu.ts';

const on = (id: ActionState['id']): ActionState => ({ id, enabled: true, reason: null });
const off = (id: ActionState['id'], reason: ActionState['reason']): ActionState => ({
  id,
  enabled: false,
  reason,
});

const ACTIONS: ActionState[] = [
  off('delete', 'in-expression'),
  on('duplicate'),
  on('copy'),
  off('paste', 'not-found'),
  on('wrap-stack'),
  on('replace'),
  on('hide'),
  on('show-all'),
];

test('the menu lists every action with its text key and its group', () => {
  const items = menuItems(ACTIONS, 1);
  assert.deepEqual(
    items.map((item) => item.label),
    [
      'menu.delete',
      'menu.duplicate',
      'menu.copy',
      'menu.paste',
      'menu.wrap-stack',
      'menu.replace',
      'menu.hide',
      'menu.show-all',
    ],
  );
  assert.deepEqual(
    items.map((item) => item.group),
    [0, 0, 1, 1, 3, 4, 6, 6],
  );
});

test('an action that is off carries the text of its reason, one that is on none', () => {
  const items = menuItems(ACTIONS, 0);
  const del = items.find((item) => item.action === 'delete');
  assert.equal(del?.enabled, false);
  assert.equal(del?.reason, 'menu.reason.in-expression');
  const copy = items.find((item) => item.action === 'copy');
  assert.equal(copy?.enabled, true);
  assert.equal(copy?.reason, null);
});

test('show all is listed only while something is hidden', () => {
  assert.equal(
    menuItems(ACTIONS, 0).some((item) => item.action === 'show-all'),
    false,
  );
  assert.equal(
    menuItems(ACTIONS, 2).some((item) => item.action === 'show-all'),
    true,
  );
});

test('the component list leaves out parts and the element is already', () => {
  const items = componentItems(
    [
      { name: 'Button', parent: null },
      { name: 'Badge', parent: null },
      { name: 'Card.Header', parent: 'Card' },
    ],
    'Button',
  );
  assert.deepEqual(
    items.map((item) => item.tag),
    ['Badge'],
  );
  assert.equal(items[0]?.action, null);
});

const ITEMS: MenuItem[] = menuItems(
  [off('delete', 'section-root'), on('duplicate'), off('copy', 'not-found'), on('paste')],
  0,
);

test('arrow keys skip items that are off and wrap around', () => {
  assert.equal(stepIndex(ITEMS, -1, 'ArrowDown'), 1);
  assert.equal(stepIndex(ITEMS, 1, 'ArrowDown'), 3);
  assert.equal(stepIndex(ITEMS, 3, 'ArrowDown'), 1);
  assert.equal(stepIndex(ITEMS, 1, 'ArrowUp'), 3);
  assert.equal(stepIndex(ITEMS, 3, 'ArrowUp'), 1);
  assert.equal(stepIndex(ITEMS, 2, 'Home'), 1);
  assert.equal(stepIndex(ITEMS, 2, 'End'), 3);
});

test('when every item is off no item takes the focus', () => {
  const none = menuItems([off('delete', 'section-root')], 0);
  assert.equal(stepIndex(none, -1, 'ArrowDown'), -1);
});

test('Enter runs the focused item and does nothing on one that is off', () => {
  assert.equal(activate(ITEMS, 1)?.action, 'duplicate');
  assert.equal(activate(ITEMS, 0), null);
  assert.equal(activate(ITEMS, -1), null);
  assert.equal(activate(ITEMS, 9), null);
});

test('a point in the frame maps to page pixels through the box and the zoom', () => {
  assert.deepEqual(toPagePoint({ left: 100, top: 50 }, 1, { x: 10, y: 20 }), { x: 110, y: 70 });
  assert.deepEqual(toPagePoint({ left: 100, top: 50 }, 0.5, { x: 10, y: 20 }), { x: 105, y: 60 });
  assert.deepEqual(toPagePoint({ left: 0, top: 0 }, 2, { x: 10, y: 20 }), { x: 20, y: 40 });
});

test('the menu is moved back into the view when it would stick out', () => {
  const size = { width: 200, height: 300 };
  const view = { width: 1000, height: 800 };
  assert.deepEqual(clampToView({ x: 100, y: 100 }, size, view), { x: 100, y: 100 });
  assert.deepEqual(clampToView({ x: 950, y: 700 }, size, view), { x: 800, y: 500 });
  assert.deepEqual(clampToView({ x: -5, y: -5 }, size, view), { x: 0, y: 0 });
});

test('a click on an element outside the selection selects it, inside keeps the selection', () => {
  assert.deepEqual(selectionFor(['a', 'b'], 'b'), ['a', 'b']);
  assert.deepEqual(selectionFor(['a', 'b'], 'c'), ['c']);
  assert.deepEqual(selectionFor(['a'], null), ['a']);
});

test('an item shows its key from the list of shortcuts, Cmd on a Mac, nothing without one', () => {
  const hints = (mac: boolean): Record<string, string | null> =>
    Object.fromEntries(
      menuItems([...ACTIONS, on('copy-location')], 0, mac).map((item) => [item.action, item.hint]),
    );
  const pc = hints(false);
  assert.equal(pc.duplicate, 'Ctrl+D');
  assert.equal(pc.copy, 'Ctrl+C');
  assert.equal(pc['wrap-stack'], 'Ctrl+G');
  assert.equal(pc.replace, null);
  assert.equal(pc['copy-location'], null);
  assert.equal(hints(true).duplicate, 'Cmd+D');
  for (const item of componentItems([{ name: 'Button', parent: null }], null)) {
    assert.equal(item.hint, null);
  }
});

test('the menu offers Lock or Unlock, whichever applies, never both', () => {
  const free = menuItems([on('lock'), off('unlock', 'no-selection')], 0).map((item) => item.action);
  assert.deepEqual(free, ['lock']);
  const locked = menuItems([off('lock', 'no-selection'), on('unlock')], 0).map((i) => i.action);
  assert.deepEqual(locked, ['unlock']);
});
