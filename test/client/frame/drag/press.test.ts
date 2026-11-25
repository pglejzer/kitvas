// What a press in the frame will do if the pointer moves on (`pressOf`, ADRs 0059 and 0066). What
// the session does with it then is in `test/client/frame/drag.test.ts`.

import assert from 'node:assert/strict';
import { test } from 'node:test';
import { type PressInput, pressOf } from '../../../../client/frame/drag/session.ts';

/** The copies of one list item share this id. */
const PLAN = 'A:main/Stack/Card';
/** The children of `A:main`, in order. */
const ROW = ['A:main/h1', 'A:main/Card', 'A:main/Card.2', 'A:main/Card.3'];
const MAIN = 'A:main';
const inMain = { section: (id: string): boolean => id === MAIN };

const press = (over: Partial<PressInput>): PressInput => ({
  path: [],
  selection: [],
  add: false,
  movable: () => true,
  item: () => false,
  section: () => false,
  siblings: () => [],
  copy: () => ({}),
  ...over,
});

test('a press on an element that is not selected drags it at once and picks it', () => {
  const path = ['A:main/h1', MAIN];
  const pressed = pressOf(press({ ...inMain, path, selection: ['A:main/p'] }));
  assert.deepEqual(pressed, { kind: 'move', ids: ['A:main/h1'], pick: { id: 'A:main/h1' } });
  // One of several elements with the id: the pick says which copy.
  const copy = pressOf(press({ ...inMain, path, copy: () => ({ item: 2, path: [2] }) }));
  const pick = { id: 'A:main/h1', item: 2, path: [2] };
  assert.deepEqual(copy, { kind: 'move', ids: ['A:main/h1'], pick });
});

test('the nearest element that can move is the one dragged', () => {
  const path = ['A:main/Card/Text', 'A:main/Card', MAIN];
  const pressed = pressOf(press({ ...inMain, path, movable: (id) => id === 'A:main/Card' }));
  assert.deepEqual(pressed, { kind: 'move', ids: ['A:main/Card'], pick: { id: 'A:main/Card' } });
});

test('a press on the section root, or on nothing, draws a rectangle', () => {
  const still = { ...inMain, movable: (id: string): boolean => id !== MAIN };
  assert.deepEqual(pressOf(press({ ...still, path: [MAIN], selection: [] })), { kind: 'rect' });
  assert.deepEqual(pressOf(press({ path: [], selection: ['A:main/p'] })), { kind: 'rect' });
  // Nothing up to the section root can move: the search ends there, not at the page around it.
  const fixed = press({
    ...inMain,
    path: ['A:main/Text', MAIN, 'App:page'],
    movable: (id) => id === 'App:page',
  });
  assert.deepEqual(pressOf(fixed), { kind: 'rect' });
});

test('with Shift, Ctrl or Cmd held a press draws a rectangle, wherever it starts', () => {
  const path = ['A:main/Card', MAIN];
  assert.deepEqual(pressOf(press({ ...inMain, path, add: true })), { kind: 'rect' });
  // Also on a selected element, and on a list item.
  const chosen = press({ ...inMain, path, add: true, selection: ['A:main/Card'] });
  assert.deepEqual(pressOf(chosen), { kind: 'rect' });
  assert.deepEqual(pressOf(press({ ...inMain, path, add: true, item: () => true })), {
    kind: 'rect',
  });
});

test('a press on a selected element moves it, also when a child of it was pressed', () => {
  const input = press({ ...inMain, path: ['A:main/Card/Text', 'A:main/Card', MAIN] });
  assert.deepEqual(pressOf({ ...input, selection: ['A:main/Card'] }), {
    kind: 'move',
    ids: ['A:main/Card'],
    pick: null,
  });
});

test('a selected element with several copies is picked again by the copy that was pressed', () => {
  const path = ['A:main/Stack/Card/Badge', PLAN, MAIN];
  const badge = 'A:main/Stack/Card/Badge';
  const input = press({
    ...inMain,
    path,
    selection: [badge],
    copy: () => ({ item: 1, path: [1] }),
  });
  // The chosen copy may be another one: the drag says which copy it takes.
  assert.deepEqual(pressOf(input), {
    kind: 'move',
    ids: [badge],
    pick: { id: badge, item: 1, path: [1] },
  });
});

test('selected neighbouring siblings move together, in document order', () => {
  const pressed = pressOf(
    press({
      path: ['A:main/Card.2', MAIN],
      selection: ['A:main/Card.3', 'A:main/Card.2', 'A:main/Card'],
      siblings: (id) => {
        assert.equal(id, 'A:main/Card.2');
        return ROW;
      },
    }),
  );
  assert.deepEqual(pressed, {
    kind: 'move',
    ids: ['A:main/Card', 'A:main/Card.2', 'A:main/Card.3'],
    pick: null,
  });
});

test('a mixed selection moves only the element under the pointer', () => {
  const path = ['A:main/Card', MAIN];
  const alone = { kind: 'move', ids: ['A:main/Card'], pick: null };
  // Another parent.
  const elsewhere = pressOf(
    press({ path, selection: ['A:main/Card', 'B:footer/p'], siblings: () => ROW }),
  );
  assert.deepEqual(elsewhere, alone);
  // The same parent, with an element between them.
  const apart = pressOf(
    press({ path, selection: ['A:main/Card', 'A:main/Card.3'], siblings: () => ROW }),
  );
  assert.deepEqual(apart, alone);
  // Siblings, but one of them cannot move.
  const stuck = pressOf(
    press({
      path,
      selection: ['A:main/Card', 'A:main/Card.2'],
      siblings: () => ROW,
      movable: (id) => id !== 'A:main/Card.2',
    }),
  );
  assert.deepEqual(stuck, alone);
});

test('a selected element that cannot move is not dragged: the press draws a rectangle', () => {
  const pressed = pressOf(
    press({ ...inMain, path: ['A:main/h1', MAIN], selection: [MAIN], movable: () => false }),
  );
  assert.deepEqual(pressed, { kind: 'rect' });
  // What was pressed inside it can move: that one is dragged, and picked.
  const child = pressOf(
    press({
      ...inMain,
      path: ['A:main/h1', MAIN],
      selection: [MAIN],
      movable: (id) => id === 'A:main/h1',
    }),
  );
  assert.deepEqual(child, { kind: 'move', ids: ['A:main/h1'], pick: { id: 'A:main/h1' } });
});

test('a list item drags as an item, by the copy that was pressed', () => {
  const input = press({
    ...inMain,
    path: ['A:main/Stack/Card/Heading', PLAN, 'A:main/Stack', MAIN],
    // The heading is written in an expression here; the list around the item can move.
    movable: (id) => id === 'A:main/Stack',
    item: (id) => id === PLAN,
    copy: (id) => (id === PLAN ? { item: 2, path: [2] } : {}),
  });
  const pick = { id: PLAN, item: 2, path: [2] };
  const dragged = { kind: 'item', id: PLAN, item: 2, from: [2], pick };
  assert.deepEqual(pressOf(input), dragged);
  // Selected or not, and with a child of it selected: the pressed copy is the one that goes.
  assert.deepEqual(pressOf({ ...input, selection: [PLAN] }), dragged);
  assert.deepEqual(pressOf({ ...input, selection: ['A:main/Stack/Card/Heading'] }), dragged);
  // The only copy has no place among the elements to name, but a path in its list.
  assert.deepEqual(pressOf({ ...input, copy: () => ({ path: [0] }) }), {
    kind: 'item',
    id: PLAN,
    item: 0,
    from: [0],
    pick: { id: PLAN, path: [0] },
  });
});

test('an item of a list inside a list drags as an item too, with its whole path', () => {
  const row = 'A:main/Stack/Card/Row';
  const input = press({
    ...inMain,
    path: [row, PLAN, 'A:main/Stack', MAIN],
    movable: () => false,
    item: (id) => id === row || id === PLAN,
    copy: (id) => (id === row ? { item: 7, path: [1, 2] } : { item: 1, path: [1] }),
  });
  const pick = { id: row, item: 7, path: [1, 2] };
  assert.deepEqual(pressOf(input), { kind: 'item', id: row, item: 7, from: [1, 2], pick });
});

test('an item the page cannot count in its lists does not drag as one', () => {
  const input = press({
    ...inMain,
    path: [PLAN, 'A:main/Stack', MAIN],
    movable: (id) => id === 'A:main/Stack',
    item: (id) => id === PLAN,
    copy: (id) => (id === PLAN ? { item: 2 } : {}),
  });
  // No path, no place to name in a `reorder`: the list around it is what moves.
  const stack = { kind: 'move', ids: ['A:main/Stack'], pick: { id: 'A:main/Stack' } };
  assert.deepEqual(pressOf(input), stack);
  assert.deepEqual(pressOf({ ...input, selection: [PLAN] }), stack);
});

test('of an element that can move and a list item, the nearer one is dragged', () => {
  const path = ['A:main/Stack/Card/Button', PLAN, 'A:main/Stack', MAIN];
  const item = (id: string): boolean => id === PLAN;
  const copy = (): { path: number[] } => ({ path: [0] });
  // A part of the item's template that can move drags as an element.
  const inner = pressOf(press({ ...inMain, path, item, copy, movable: (id) => id !== PLAN }));
  assert.deepEqual(inner, {
    kind: 'move',
    ids: ['A:main/Stack/Card/Button'],
    pick: { id: 'A:main/Stack/Card/Button', path: [0] },
  });
  const far = (id: string): boolean => id === 'A:main/Stack';
  const outer = pressOf(press({ ...inMain, path, item, copy, movable: far }));
  assert.equal(outer.kind, 'item');
});
