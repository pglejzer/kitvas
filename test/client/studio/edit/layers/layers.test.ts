import assert from 'node:assert/strict';
import { test } from 'node:test';
import type { TreeNode } from '../../../../../client/channel/edit-protocol.ts';
import {
  badgeCount,
  badgeOf,
  changedIds,
  listKindOf,
  moveOps,
  nestTree,
  rowFacts,
} from '../../../../../client/studio/edit/layers/layers.ts';

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

test('changedIds lists the elements the person changed, not Claude whole-file lines', () => {
  const entry = (by: 'person' | 'claude', id: string | null) => ({
    by,
    id,
    label: 'x',
    files: [],
    offKit: false,
    at: 0,
  });
  const ids = changedIds([entry('person', 'a'), entry('claude', 'b'), entry('person', null)]);
  assert.deepEqual([...ids], ['a']);
});

test('a row shows the kit marker, the repeat count and the changed dot', () => {
  const changed = new Set(['a']);
  assert.deepEqual(rowFacts(node('a', null, 3), 'Stack', changed), {
    kit: true,
    count: 3,
    changed: true,
    kind: null,
  });
  assert.deepEqual(rowFacts(node('b', 'a'), null, changed), {
    kit: false,
    count: null,
    changed: false,
    kind: null,
  });
  assert.equal(rowFacts(node('c', 'a'), undefined, changed).kit, false);
});

test('the repeat badge says which kind of list renders the element', () => {
  const changed = new Set<string>();
  const literal = rowFacts(node('a', null, 3), null, changed, 'literal');
  assert.equal(literal.kind, 'literal');
  // Texts show as their keys outside a page.
  assert.deepEqual(badgeOf(literal), {
    label: 'layers.countKind',
    title: 'layers.kindTitle.literal',
  });
  assert.deepEqual(badgeOf(rowFacts(node('a', null, 3), null, changed)), {
    label: 'layers.count',
    title: null,
  });
  // One copy has no badge, so no kind either.
  const single = rowFacts(node('b', null, 1), null, changed, 'prop');
  assert.equal(single.kind, null);
  assert.equal(badgeOf(single), null);
});

test("a row's list kind comes from the structure, else from what an inspect told", () => {
  const known = new Map([['b', 'computed' as const]]);
  assert.equal(listKindOf({ id: 'a', list: 'prop' }, known, 'a'), 'prop');
  assert.equal(listKindOf({ id: 'b' }, known, 'b'), 'computed');
  assert.equal(listKindOf(undefined, known, 'c'), null);
});
