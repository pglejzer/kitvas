import assert from 'node:assert/strict';
import { test } from 'node:test';
import type { TreeNode } from '../../../../../client/channel/edit-protocol.ts';
import { nestTree } from '../../../../../client/studio/edit/layers/facts.ts';
import {
  foldsKey,
  isOpen,
  MAX_CHOICES,
  parseFolds,
  readFolds,
  revealSelection,
  setOpen,
  setSubtree,
  treeKey,
  writeFolds,
} from '../../../../../client/studio/edit/layers/folds.ts';

const node = (id: string, parent: string | null): TreeNode => ({ id, parent, name: id, count: 1 });

// s > a > b > c, s > d
const tree = [node('s', null), node('a', 's'), node('b', 'a'), node('c', 'b'), node('d', 's')];

test('a section row starts open and a deeper row with children starts folded', () => {
  assert.equal(isOpen('s', 1, {}, false), true);
  assert.equal(isOpen('a', 2, {}, false), false);
});

test('the person own choice overrides the default either way', () => {
  assert.equal(isOpen('s', 1, { s: false }, false), false);
  assert.equal(isOpen('a', 2, { a: true }, false), true);
});

test('an id that looks like an object property is no choice', () => {
  assert.equal(isOpen('constructor', 2, {}, false), false);
  assert.equal(isOpen('toString', 1, {}, false), true);
});

test('searching draws every row open and ignores the choices', () => {
  assert.equal(isOpen('a', 2, {}, true), true);
  assert.equal(isOpen('s', 1, { s: false }, true), true);
});

test('searching changes no choices, so they apply again when the search is cleared', () => {
  const choices = { a: false, s: false };
  isOpen('a', 2, choices, true);
  assert.deepEqual(choices, { a: false, s: false });
  assert.equal(isOpen('a', 2, choices, false), false);
});

test('revealing a selection opens every ancestor of it as an explicit choice', () => {
  const next = revealSelection(tree, ['c'], {});
  assert.deepEqual(next, { b: true, a: true, s: true });
  assert.equal(isOpen('a', 2, next, false), true);
});

test('revealing opens the ancestors of every selected element', () => {
  const next = revealSelection(tree, ['b', 'd'], {});
  assert.deepEqual(Object.keys(next).sort(), ['a', 's']);
});

test('revealing overrides a fold on an ancestor and keeps other choices', () => {
  const next = revealSelection(tree, ['b'], { a: false, d: false });
  assert.equal(next.a, true);
  assert.equal(next.d, false);
});

test('revealing hands back the same choices when every ancestor is already open', () => {
  const choices = { a: true, s: true };
  assert.equal(revealSelection(tree, ['b'], choices), choices);
});

test('revealing skips a selected element the tree does not hold', () => {
  const choices = { a: false };
  assert.equal(revealSelection(tree, ['gone'], choices), choices);
  assert.equal(revealSelection(tree, [], choices), choices);
});

test('revealing survives a parent cycle', () => {
  const loop = [node('x', 'y'), node('y', 'x')];
  assert.deepEqual(revealSelection(loop, ['x'], {}), { y: true });
});

test('setting one row changes only that row and leaves the input alone', () => {
  const before = { a: false };
  const next = setOpen('b', true, before);
  assert.deepEqual(next, { a: false, b: true });
  assert.deepEqual(before, { a: false });
  assert.equal(setOpen('a', false, before), before);
});

test('setSubtree sets the row and every row under it that has children', () => {
  const [root] = nestTree(tree);
  assert.ok(root);
  const open = setSubtree(root, true, {});
  assert.deepEqual(Object.keys(open).sort(), ['a', 'b', 's']);
  assert.ok(Object.values(open).every((value) => value));
  const folded = setSubtree(root, false, open);
  assert.ok(Object.values(folded).every((value) => !value));
});

test('setSubtree leaves a leaf row without an entry', () => {
  const [root] = nestTree(tree);
  const leaf = root?.children.find((item) => item.node.id === 'd');
  assert.ok(leaf);
  const choices = {};
  assert.equal(setSubtree(leaf, true, choices), choices);
});

test('the choices are capped and the oldest are dropped first', () => {
  let choices = {};
  for (let at = 0; at < MAX_CHOICES + 20; at += 1) choices = setOpen(`id-${at}`, true, choices);
  const ids = Object.keys(choices);
  assert.equal(ids.length, MAX_CHOICES);
  assert.equal(ids[0], 'id-20');
  assert.equal(ids.at(-1), `id-${MAX_CHOICES + 19}`);
});

test('a choice made again counts as the newest', () => {
  let choices = {};
  for (let at = 0; at < MAX_CHOICES; at += 1) choices = setOpen(`id-${at}`, true, choices);
  choices = setOpen('id-0', false, choices);
  choices = setOpen('extra', true, choices);
  assert.equal(Object.hasOwn(choices, 'id-0'), true);
  assert.equal(Object.hasOwn(choices, 'id-1'), false);
});

test('stored choices come back by the draft slug', () => {
  const kept = new Map<string, string>();
  const storage = {
    getItem: (key: string) => kept.get(key) ?? null,
    setItem: (key: string, value: string) => void kept.set(key, value),
  };
  writeFolds(storage, 'home', { a: true, b: false });
  assert.deepEqual([...kept.keys()], [foldsKey('home')]);
  assert.equal(foldsKey('home'), 'kitvas.layers.folds:home');
  assert.deepEqual(readFolds(storage, 'home'), { a: true, b: false });
  assert.deepEqual(readFolds(storage, 'other'), {});
});

test('junk in storage counts as no choices', () => {
  assert.deepEqual(parseFolds(null), {});
  assert.deepEqual(parseFolds('{not json'), {});
  assert.deepEqual(parseFolds('[1,2]'), {});
  assert.deepEqual(parseFolds('"text"'), {});
  assert.deepEqual(parseFolds('null'), {});
  assert.deepEqual(parseFolds('{"a":true,"b":"yes","c":1,"d":false}'), { a: true, d: false });
});

test('a stored value over the cap is cut to the newest entries', () => {
  const big = Object.fromEntries(
    Array.from({ length: MAX_CHOICES + 5 }, (_, at) => [`k${at}`, true]),
  );
  const parsed = parseFolds(JSON.stringify(big));
  assert.equal(Object.keys(parsed).length, MAX_CHOICES);
  assert.equal(Object.hasOwn(parsed, 'k0'), false);
  assert.equal(Object.hasOwn(parsed, `k${MAX_CHOICES + 4}`), true);
});

test('storage that is missing or throws counts as no choices and never throws', () => {
  const broken = {
    getItem: (): string | null => {
      throw new Error('blocked');
    },
    setItem: (): void => {
      throw new Error('full');
    },
  };
  assert.deepEqual(readFolds(null, 'home'), {});
  assert.deepEqual(readFolds(broken, 'home'), {});
  assert.doesNotThrow(() => writeFolds(broken, 'home', { a: true }));
  assert.doesNotThrow(() => writeFolds(null, 'home', { a: true }));
});

test('ArrowRight opens a folded row and goes to the first child of an open one', () => {
  assert.equal(treeKey('ArrowRight', { hasChildren: true, open: false, hasParent: true }), 'open');
  assert.equal(
    treeKey('ArrowRight', { hasChildren: true, open: true, hasParent: true }),
    'first-child',
  );
});

test('ArrowRight on a row without children does nothing', () => {
  assert.equal(treeKey('ArrowRight', { hasChildren: false, open: false, hasParent: true }), null);
});

test('ArrowLeft folds an open row and goes to the parent from a folded or leaf row', () => {
  assert.equal(treeKey('ArrowLeft', { hasChildren: true, open: true, hasParent: true }), 'fold');
  assert.equal(treeKey('ArrowLeft', { hasChildren: true, open: false, hasParent: true }), 'parent');
  assert.equal(
    treeKey('ArrowLeft', { hasChildren: false, open: false, hasParent: true }),
    'parent',
  );
});

test('ArrowLeft on a top row that is folded or a leaf does nothing', () => {
  assert.equal(treeKey('ArrowLeft', { hasChildren: true, open: false, hasParent: false }), null);
  assert.equal(treeKey('ArrowLeft', { hasChildren: false, open: false, hasParent: false }), null);
});

test('other keys are not tree keys', () => {
  assert.equal(treeKey('ArrowDown', { hasChildren: true, open: true, hasParent: true }), null);
  assert.equal(treeKey('Enter', { hasChildren: true, open: false, hasParent: true }), null);
});
