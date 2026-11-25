import assert from 'node:assert/strict';
import { test } from 'node:test';
import type { CopyRef } from '../../../../../client/channel/edit-protocol.ts';
import { movedCopy, reorderOp } from '../../../../../client/studio/edit/structure/reorder.ts';

const PLAN = 'sections/Pricing:section/Stack/Card';
const ROW = `${PLAN}/ul/li`;

test('a reordered item becomes one move of the item in the data, by its path', () => {
  assert.deepEqual(reorderOp({ id: PLAN, from: [0], to: [2] }), {
    op: 'moveItem',
    id: PLAN,
    item: 0,
    to: 2,
    path: [0],
    toPath: [2],
  });
  // A row of the first plan to another place in that plan: only that plan's rows change.
  assert.deepEqual(reorderOp({ id: ROW, from: [0, 2], to: [0, 0] }), {
    op: 'moveItem',
    id: ROW,
    item: 2,
    to: 0,
    path: [0, 2],
    toPath: [0, 0],
  });
});

test('an item dropped into the same list of another parent names both places', () => {
  // The first row of the third plan, between two rows of the first.
  assert.deepEqual(reorderOp({ id: ROW, from: [2, 0], to: [0, 1] }), {
    op: 'moveItem',
    id: ROW,
    item: 0,
    to: 1,
    path: [2, 0],
    toPath: [0, 1],
  });
});

test('an item dropped on its own place writes nothing', () => {
  assert.equal(reorderOp({ id: PLAN, from: [1], to: [1] }), null);
  assert.equal(reorderOp({ id: ROW, from: [0, 1], to: [0, 1] }), null);
  // Two paths of different depths, or none at all, name no one list.
  assert.equal(reorderOp({ id: ROW, from: [0, 1], to: [1] }), null);
  assert.equal(reorderOp({ id: ROW, from: [], to: [] }), null);
});

test('the op carries what the frame said and nothing more', () => {
  // A checked `reorder` message has a head and a type too.
  const message = { kitvas: 1, channel: 'c1', type: 'reorder', id: PLAN, from: [2], to: [1] };
  const op = reorderOp(message);
  assert.deepEqual(Object.keys(op ?? {}).sort(), ['id', 'item', 'op', 'path', 'to', 'toPath']);
  // The paths are the op's own: the message's arrays are not handed on.
  assert.ok(op !== null && op.op === 'moveItem');
  assert.notEqual(op.path, message.from);
  assert.notEqual(op.toPath, message.to);
});

test('an item moved in its own list stays the chosen copy, as far on as it moved', () => {
  const chosen: CopyRef = { id: ROW, item: 5, path: [1, 2] };
  assert.deepEqual(movedCopy({ id: ROW, from: [1, 2], to: [1, 0] }, chosen), {
    id: ROW,
    item: 3,
    path: [1, 0],
  });
  // A copy chosen without a path is taken for the moved one.
  assert.deepEqual(movedCopy({ id: PLAN, from: [0], to: [2] }, { id: PLAN, item: 0 }), {
    id: PLAN,
    item: 2,
    path: [2],
  });
});

test('where the place among the copies does not follow, only the path is known', () => {
  // Another parent's list: the rows between the two places are not counted here.
  const chosen: CopyRef = { id: ROW, item: 6, path: [2, 0] };
  assert.deepEqual(movedCopy({ id: ROW, from: [2, 0], to: [0, 1] }, chosen), {
    id: ROW,
    path: [0, 1],
  });
  // Nothing chosen, another copy chosen, another element chosen, or a copy with no place.
  const move = { id: ROW, from: [1, 2], to: [1, 0] };
  assert.deepEqual(movedCopy(move, null), { id: ROW, path: [1, 0] });
  assert.deepEqual(movedCopy(move, { id: ROW, item: 3, path: [1, 0] }), { id: ROW, path: [1, 0] });
  assert.deepEqual(movedCopy(move, { id: PLAN, item: 1, path: [1] }), { id: ROW, path: [1, 0] });
  assert.deepEqual(movedCopy(move, { id: ROW, path: [1, 2] }), { id: ROW, path: [1, 0] });
});
