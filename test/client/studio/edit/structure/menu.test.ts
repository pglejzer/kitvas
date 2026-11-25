import assert from 'node:assert/strict';
import { test } from 'node:test';
import type { ActionState } from '../../../../../client/studio/edit/structure/actions.ts';
import {
  activate,
  clampToView,
  componentItems,
  MENU_ICONS,
  type MenuItem,
  menuIcon,
  menuItems,
  menuSelection,
  sameItems,
  selectionFor,
  stepIndex,
  toPageBox,
  toPagePoint,
} from '../../../../../client/studio/edit/structure/menu.ts';
import { ICON_NAMES } from '../../../../../src/studio/pages/icons/paths.ts';

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

test('a box in the frame becomes a box on the page: the corner moves, the size scales', () => {
  const box = { x: 10, y: 20, width: 40, height: 60 };
  assert.deepEqual(toPageBox({ left: 100, top: 50 }, 0.5, box), {
    x: 105,
    y: 60,
    width: 20,
    height: 30,
  });
});

test('a right click on a copy selects that copy as a left click does', () => {
  const chosen = { selection: ['row'], copies: [{ id: 'row', item: 1, path: [1] }] };
  // A chosen copy stays, with the others chosen beside it.
  const two = {
    selection: ['row'],
    copies: [
      { id: 'row', item: 1, path: [1] },
      { id: 'row', item: 2, path: [2] },
    ],
  };
  assert.equal(menuSelection(chosen, 'row', { item: 1, path: [1] }), chosen);
  assert.equal(menuSelection(two, 'row', { item: 2, path: [2] }), two);
  // Another copy becomes the one chosen copy.
  assert.deepEqual(menuSelection(two, 'row', { item: 0, path: [0] }), {
    selection: ['row'],
    copies: [{ id: 'row', item: 0, path: [0] }],
  });
  // An element not selected yet: only that copy, and other selected elements leave.
  const other = { selection: ['a', 'b'], copies: [{ id: 'b', item: 1 }] };
  assert.deepEqual(menuSelection(other, 'row', { item: 3 }), {
    selection: ['row'],
    copies: [{ id: 'row', item: 3 }],
  });
});

test('a right click on no copy keeps what is selected and drops copies of what leaves', () => {
  const current = { selection: ['a', 'b'], copies: [{ id: 'b', item: 1 }] };
  assert.equal(menuSelection(current, 'b', {}), current);
  assert.equal(menuSelection(current, null, {}), current);
  assert.deepEqual(menuSelection(current, 'c', {}), { selection: ['c'], copies: [] });
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

test('an item has an icon only where its action has one; the rest keep their words alone', () => {
  assert.equal(menuIcon({ action: 'delete' }), 'trash');
  assert.equal(menuIcon({ action: 'duplicate' }), 'duplicate');
  assert.equal(menuIcon({ action: 'hide' }), 'eye-off');
  assert.equal(menuIcon({ action: 'wrap-stack' }), null);
  assert.equal(menuIcon({ action: 'replace' }), null);
  // A component in the list that Replace opens, and the note item.
  assert.equal(menuIcon({ action: null }), null);
  assert.equal(menuIcon({ action: null, note: true }), 'note');
});

test('every icon of the menu is one the studio draws', () => {
  for (const name of Object.values(MENU_ICONS)) assert.ok(ICON_NAMES.includes(name), name);
});

test('the open menu is drawn again only when an item changed', () => {
  const before = menuItems([off('delete', 'in-expression'), on('copy')], 0);
  assert.equal(sameItems(before, menuItems([off('delete', 'in-expression'), on('copy')], 0)), true);
  // The facts of a list item came: Delete is on now, and it says it acts on the item.
  assert.equal(sameItems(before, menuItems([on('delete'), on('copy')], 0)), false);
  assert.equal(sameItems(before, menuItems([on('delete'), on('copy')], 0, false, true)), false);
  assert.equal(sameItems(before, before.slice(0, 1)), false);
});
