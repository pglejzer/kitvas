import assert from 'node:assert/strict';
import { test } from 'node:test';
import { reorderOp } from '../../../../../client/studio/edit/structure/reorder.ts';

const PLAN = 'sections/Pricing:section/Stack/Card';

test('a reordered item becomes one move of the item in the data', () => {
  assert.deepEqual(reorderOp({ id: PLAN, item: 0, to: 2 }), {
    op: 'moveItem',
    id: PLAN,
    item: 0,
    to: 2,
  });
  assert.deepEqual(reorderOp({ id: PLAN, item: 3, to: 0 }), {
    op: 'moveItem',
    id: PLAN,
    item: 3,
    to: 0,
  });
});

test('an item dropped on its own place writes nothing', () => {
  assert.equal(reorderOp({ id: PLAN, item: 1, to: 1 }), null);
  assert.equal(reorderOp({ id: PLAN, item: 0, to: 0 }), null);
});

test('the op carries what the frame said and nothing more', () => {
  // A checked `reorder` message has a head and a type too.
  const message = { kitvas: 1, channel: 'c1', type: 'reorder', id: PLAN, item: 2, to: 1 };
  const op = reorderOp(message);
  assert.deepEqual(Object.keys(op ?? {}).sort(), ['id', 'item', 'op', 'to']);
});
