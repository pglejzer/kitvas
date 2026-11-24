import assert from 'node:assert/strict';
import { test } from 'node:test';
import type { TreeNode } from '../../../client/channel/edit-protocol.ts';
import { badgeCount, moveOps, nestTree } from '../../../client/studio/edit/layers.ts';

const node = (id: string, parent: string | null, count = 1): TreeNode => ({
  id,
  parent,
  name: id,
  count,
});

test('the badge shows only for an item of a mapped list', () => {
  assert.equal(badgeCount(node('a', null, 1)), null);
  assert.equal(badgeCount(node('a', null, 4)), 4);
});

test('nestTree puts children under their parent in document order', () => {
  const roots = nestTree([node('a', null), node('b', 'a'), node('c', 'a'), node('d', 'b')]);
  assert.equal(roots.length, 1);
  assert.deepEqual(
    roots[0]?.children.map((item) => item.node.id),
    ['b', 'c'],
  );
  assert.deepEqual(
    roots[0]?.children[0]?.children.map((item) => item.node.id),
    ['d'],
  );
});

test('moveOps keeps the order of a group dropped after an anchor', () => {
  const hashes = new Map([['a', '0123456789abcdef']]);
  const ops = moveOps(['a', 'b', 'c'], { anchor: 'x', place: 'after' }, hashes);
  assert.deepEqual(ops, [
    { op: 'moveElement', id: 'a', anchor: 'x', place: 'after', hash: '0123456789abcdef' },
    { op: 'moveElement', id: 'b', anchor: 'a', place: 'after' },
    { op: 'moveElement', id: 'c', anchor: 'b', place: 'after' },
  ]);
});

test('moveOps sends every element to the same place for before and last', () => {
  const before = moveOps(['a', 'b'], { anchor: 'x', place: 'before' }, new Map());
  assert.deepEqual(
    before.map((op) => ('anchor' in op ? `${op.place}:${op.anchor}` : '')),
    ['before:x', 'before:x'],
  );
  const last = moveOps(['a', 'b'], { anchor: 'x', place: 'last' }, new Map());
  assert.deepEqual(
    last.map((op) => ('place' in op ? op.place : '')),
    ['last', 'last'],
  );
});

test('nestTree makes a node a root when its parent was filtered out', () => {
  const roots = nestTree([node('b', 'a'), node('c', null)]);
  assert.deepEqual(
    roots.map((item) => item.node.id),
    ['b', 'c'],
  );
});
