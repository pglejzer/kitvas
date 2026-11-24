import assert from 'node:assert/strict';
import { test } from 'node:test';
import { addsToSelection, type TreeNode } from '../../../../../client/channel/edit-protocol.ts';
import {
  filterTree,
  firstChildOf,
  nextSelection,
  parentOf,
  tagOfId,
} from '../../../../../client/studio/edit/select/selection.ts';

const node = (id: string, parent: string | null, name: string, count = 1): TreeNode => ({
  id,
  parent,
  name,
  count,
});

const tree: TreeNode[] = [
  node('sections/Hero:section', null, 'Hero'),
  node('sections/Hero:section/Stack', 'sections/Hero:section', 'stack'),
  node('sections/Hero:section/Stack/Button', 'sections/Hero:section/Stack', 'Buy now'),
  node('sections/Hero:section/Stack/Text', 'sections/Hero:section/Stack', 'Welcome', 3),
];

test('a click replaces the selection', () => {
  assert.deepEqual(nextSelection(['a', 'b'], { id: 'c', add: false }), ['c']);
});

test('shift adds an element that is not selected', () => {
  assert.deepEqual(nextSelection(['a'], { id: 'b', add: true }), ['a', 'b']);
});

test('shift removes an element that is selected', () => {
  assert.deepEqual(nextSelection(['a', 'b'], { id: 'a', add: true }), ['b']);
});

test('Ctrl+click adds, a second Ctrl+click removes', () => {
  const add = addsToSelection({ shiftKey: false, ctrlKey: true, metaKey: false });
  const once = nextSelection(['a'], { id: 'b', add });
  assert.deepEqual(once, ['a', 'b']);
  assert.deepEqual(nextSelection(once, { id: 'b', add }), ['a']);
});

test('Cmd+click adds as Shift+click does', () => {
  const add = addsToSelection({ shiftKey: false, ctrlKey: false, metaKey: true });
  assert.deepEqual(nextSelection(['a'], { id: 'b', add }), ['a', 'b']);
});

test('a click outside any element clears the selection', () => {
  assert.deepEqual(nextSelection(['a'], { id: null, add: false }), []);
});

test('a shift click outside any element keeps the selection', () => {
  assert.deepEqual(nextSelection(['a'], { id: null, add: true }), ['a']);
});

test('parentOf gives the parent id and null at the top or for an unknown id', () => {
  assert.equal(parentOf(tree, 'sections/Hero:section/Stack'), 'sections/Hero:section');
  assert.equal(parentOf(tree, 'sections/Hero:section'), null);
  assert.equal(parentOf(tree, 'nope'), null);
});

test('firstChildOf gives the first child in document order and null for a leaf', () => {
  assert.equal(
    firstChildOf(tree, 'sections/Hero:section/Stack'),
    'sections/Hero:section/Stack/Button',
  );
  assert.equal(firstChildOf(tree, 'sections/Hero:section/Stack/Button'), null);
});

test('tagOfId reads the last tag of the path after the file stem', () => {
  assert.equal(tagOfId('sections/Hero:section/Stack/Button'), 'Button');
  assert.equal(tagOfId('sections/Hero:section'), 'section');
});

test('filterTree with an empty query keeps every node', () => {
  assert.deepEqual(filterTree(tree, '  '), tree);
});

test('filterTree matches the name without regard to case', () => {
  const ids = filterTree(tree, 'BUY').map((item) => item.id);
  assert.deepEqual(ids, [
    'sections/Hero:section',
    'sections/Hero:section/Stack',
    'sections/Hero:section/Stack/Button',
  ]);
});

test('filterTree matches the tag part of the id', () => {
  const ids = filterTree(tree, 'text').map((item) => item.id);
  assert.deepEqual(ids, [
    'sections/Hero:section',
    'sections/Hero:section/Stack',
    'sections/Hero:section/Stack/Text',
  ]);
});

test('filterTree returns nothing when no node matches', () => {
  assert.deepEqual(filterTree(tree, 'zzz'), []);
});

test('filterTree does not match the file stem of an id', () => {
  assert.deepEqual(filterTree([node('sections/Hero:div', null, 'x')], 'hero'), []);
});
