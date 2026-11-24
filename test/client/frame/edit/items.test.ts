// The frame's list item rules (plan 16, task D): which copy a pick was, which copies the outline
// goes around, which copy the inline text edit takes, and where a copy stands in nested lists
// (ADR 0060). Plain values stand in for elements.

import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  choiceOf,
  copyFor,
  copyPath,
  onlyChosen,
  type PathReader,
  placeAmong,
} from '../../../../client/frame/edit/items.ts';

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

/** An element of a fake page: its id and the element it sits in. */
type PageNode = { id: string; parent: PageNode | null };

/** The page in document order: three cards, the first with two items, the second with three. */
function page(): PageNode[] {
  const out: PageNode[] = [];
  const add = (id: string, parent: PageNode | null): PageNode => {
    const node = { id, parent };
    out.push(node);
    return node;
  };
  for (const items of [2, 3, 0]) {
    const card = add('Card', null);
    for (let n = 0; n < items; n += 1) add('Text', add('li', card));
  }
  return out;
}

const inside = (node: PageNode, within: PageNode): boolean =>
  node.parent !== null && (node.parent === within || inside(node.parent, within));

function readerOf(nodes: PageNode[]): PathReader<PageNode> {
  return {
    closest(node, id) {
      for (let at: PageNode | null = node; at !== null; at = at.parent) {
        if (at.id === id) return at;
      }
      return null;
    },
    copies: (id, within) =>
      nodes.filter((node) => node.id === id && (within === null || inside(node, within))),
  };
}

test('a copy path counts each root among its copies inside the copy of the root before it', () => {
  const nodes = page();
  const read = readerOf(nodes);
  const texts = nodes.filter((node) => node.id === 'Text');
  const text = (n: number): PageNode => texts[n] ?? assert.fail(`no text ${n}`);
  // The second card's third item: the fifth text of the page.
  assert.deepEqual(copyPath(text(4), ['Card', 'li'], read), [1, 2]);
  assert.deepEqual(copyPath(text(1), ['Card', 'li'], read), [0, 1]);
  assert.deepEqual(copyPath(text(2), ['Card'], read), [1]);
  assert.deepEqual(copyPath(text(0), [], read), []);
});

test('a copy path is null when a root has no copy around the element', () => {
  const nodes = page();
  const card = nodes.find((node) => node.id === 'Card') ?? assert.fail('no card');
  assert.equal(copyPath(card, ['Card', 'li'], readerOf(nodes)), null);
  assert.equal(copyPath(card, ['Grid'], readerOf(nodes)), null);
});

test('the inline text edit takes the chosen copy of its id, else the first copy', () => {
  const copies = [el('a', 0), el('a', 1), el('a', 2)];
  assert.deepEqual(copyFor(copies, 'a', { id: 'a', item: 2 }), el('a', 2));
  assert.deepEqual(copyFor(copies, 'a', { id: 'b', item: 2 }), el('a', 0));
  assert.deepEqual(copyFor(copies, 'a', null), el('a', 0));
  assert.equal(copyFor([], 'a', null), undefined);
});
