// The frame's list item rules (plan 16, task D): which copy a pick was, which copies the outline
// goes around, and which copy the inline text edit takes. Plain values stand in for elements.

import assert from 'node:assert/strict';
import { test } from 'node:test';
import { choiceOf, copyFor, onlyChosen, placeAmong } from '../../../../client/frame/edit/items.ts';

type Fake = { id: string; n: number };
const el = (id: string, n: number): Fake => ({ id, n });
const idOf = (element: Fake): string => element.id;

test('a pick names its place among the copies only when several elements carry the id', () => {
  const copies = [el('a', 0), el('a', 1), el('a', 2)];
  assert.equal(placeAmong(copies[2], copies), 2);
  assert.equal(placeAmong(copies[0], copies), 0);
  const one = [el('b', 0)];
  assert.equal(placeAmong(one[0], one), undefined);
  assert.equal(placeAmong(el('c', 0), copies), undefined);
});

test('a select with an item chooses that copy of its first id; without one it chooses none', () => {
  assert.deepEqual(choiceOf(['a', 'b'], 1), { id: 'a', item: 1 });
  assert.equal(choiceOf(['a'], undefined), null);
  assert.equal(choiceOf([], 0), null);
});

test('the outline goes around the chosen copy only, and around the other selected ones', () => {
  const elements = [el('a', 0), el('x', 0), el('a', 1), el('a', 2), el('y', 0)];
  const kept = onlyChosen(elements, idOf, { id: 'a', item: 1 });
  assert.deepEqual(kept, [el('x', 0), el('a', 1), el('y', 0)]);
  assert.deepEqual(onlyChosen(elements, idOf, null), elements);
});

test('a chosen copy past the last one outlines every copy until the page catches up', () => {
  const elements = [el('a', 0), el('a', 1)];
  assert.deepEqual(onlyChosen(elements, idOf, { id: 'a', item: 5 }), elements);
});

test('the inline text edit takes the chosen copy of its id, else the first copy', () => {
  const copies = [el('a', 0), el('a', 1), el('a', 2)];
  assert.deepEqual(copyFor(copies, 'a', { id: 'a', item: 2 }), el('a', 2));
  assert.deepEqual(copyFor(copies, 'a', { id: 'b', item: 2 }), el('a', 0));
  assert.deepEqual(copyFor(copies, 'a', null), el('a', 0));
  assert.equal(copyFor([], 'a', null), undefined);
});
