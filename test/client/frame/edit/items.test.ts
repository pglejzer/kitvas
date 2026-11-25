// The frame's rules for rendered copies (plan 16, task D; ADR 0066): which copy a pick was, which
// copies a select chooses and the outline goes around, which copy the inline text edit and the
// handles take, and where a copy stands in nested lists (ADR 0060). Plain values stand in for
// elements.

import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  carried,
  chosenOf,
  copyFor,
  copyOf,
  copyPath,
  onlyChosen,
  type PathReader,
  placeAmong,
  soleCopy,
} from '../../../../client/frame/edit/items.ts';

type Fake = { id: string; n: number };
const el = (id: string, n: number): Fake => ({ id, n });
const idOf = (element: Fake): string => element.id;
/** No copy chosen. */
const NONE = chosenOf(undefined);

test('a pick names its place among the copies only when several elements carry the id', () => {
  const copies = [el('a', 0), el('a', 1), el('a', 2)];
  assert.equal(placeAmong(copies[2], copies), 2);
  assert.equal(placeAmong(copies[0], copies), 0);
  const one = [el('b', 0)];
  assert.equal(placeAmong(one[0], one), undefined);
  assert.equal(placeAmong(el('c', 0), copies), undefined);
});

test('a select chooses the copies it names, by id, each once', () => {
  const chosen = chosenOf([
    { id: 'a', item: 2 },
    { id: 'b', item: 0 },
    { id: 'a', item: 0 },
    { id: 'a', item: 2 },
  ]);
  assert.deepEqual(
    [...chosen],
    [
      ['a', [2, 0]],
      ['b', [0]],
    ],
  );
  assert.equal(NONE.size, 0);
  assert.equal(chosenOf([]).size, 0);
});

test('the outline goes around the chosen copies only, and around the other selected ones', () => {
  const elements = [el('a', 0), el('x', 0), el('a', 1), el('a', 2), el('y', 0)];
  const one = onlyChosen(elements, idOf, chosenOf([{ id: 'a', item: 1 }]));
  assert.deepEqual(one, [el('x', 0), el('a', 1), el('y', 0)]);
  // Three rows of nineteen that carry one id: the three, in page order.
  const rows = Array.from({ length: 19 }, (_, n) => el('row', n));
  const three = chosenOf([8, 6, 7].map((item) => ({ id: 'row', item })));
  assert.deepEqual(onlyChosen(rows, idOf, three), [el('row', 6), el('row', 7), el('row', 8)]);
  // With no copy chosen every copy of a selected id is outlined.
  assert.deepEqual(onlyChosen(elements, idOf, NONE), elements);
});

test('a chosen copy past the last one outlines every copy until the page catches up', () => {
  const elements = [el('a', 0), el('a', 1), el('b', 0), el('b', 1)];
  const chosen = chosenOf([
    { id: 'a', item: 5 },
    { id: 'b', item: 1 },
  ]);
  // Only the id whose copy is missing keeps every copy.
  assert.deepEqual(onlyChosen(elements, idOf, chosen), [el('a', 0), el('a', 1), el('b', 1)]);
});

test('the inline text edit takes the first chosen copy of its id, else the first copy', () => {
  const copies = [el('a', 0), el('a', 1), el('a', 2)];
  const two = chosenOf([
    { id: 'a', item: 2 },
    { id: 'a', item: 1 },
  ]);
  assert.deepEqual(copyFor(copies, 'a', two), el('a', 2));
  assert.deepEqual(copyFor(copies, 'a', chosenOf([{ id: 'b', item: 2 }])), el('a', 0));
  assert.deepEqual(copyFor(copies, 'a', NONE), el('a', 0));
  // A chosen copy the page does not have: the first one.
  assert.deepEqual(copyFor(copies, 'a', chosenOf([{ id: 'a', item: 9 }])), el('a', 0));
  assert.equal(copyFor([], 'a', NONE), undefined);
});

test('the handles stay on one copy: one selected id with at most one chosen copy', () => {
  assert.deepEqual(soleCopy(['a'], NONE), { id: 'a' });
  assert.deepEqual(soleCopy(['a'], chosenOf([{ id: 'a', item: 3 }])), { id: 'a', item: 3 });
  // A chosen copy of another id says nothing of this one.
  assert.deepEqual(soleCopy(['a'], chosenOf([{ id: 'b', item: 3 }])), { id: 'a' });
  // Several chosen copies, several ids, or no selection: no one copy.
  const two = chosenOf([
    { id: 'a', item: 3 },
    { id: 'a', item: 4 },
  ]);
  assert.equal(soleCopy(['a'], two), null);
  assert.equal(soleCopy(['a', 'b'], NONE), null);
  assert.equal(soleCopy([], NONE), null);
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

test('a message says of a copy its place among the elements and its path in the lists', () => {
  const nodes = page();
  const read = readerOf(nodes);
  const texts = nodes.filter((node) => node.id === 'Text');
  const text = (n: number): PageNode => texts[n] ?? assert.fail(`no text ${n}`);
  // The second card's third item is the fifth text of the page.
  assert.deepEqual(copyOf(text(4), texts, ['Card', 'li'], read), { item: 4, path: [1, 2] });
  // No list around the id, or a structure that has not said yet: the place alone.
  assert.deepEqual(copyOf(text(4), texts, [], read), { item: 4 });
  assert.deepEqual(copyOf(text(4), texts, null, read), { item: 4 });
  assert.deepEqual(copyOf(text(4), texts, undefined, read), { item: 4 });
  // A root with no copy around the element: no path.
  const cards = nodes.filter((node) => node.id === 'Card');
  const card = cards[0] ?? assert.fail('no card');
  assert.deepEqual(copyOf(card, cards, ['Card', 'li'], read), { item: 0 });
  // The only element with its id has no place to name, but a path in its list.
  const only: PageNode = { id: 'li', parent: null };
  assert.deepEqual(copyOf(only, [only], ['li'], readerOf([only])), { path: [0] });
  assert.deepEqual(copyOf(only, [only], [], readerOf([only])), {});
});

test('a place or a path the protocol does not carry is left out of the message', () => {
  assert.equal(carried([0, 10_000]), true);
  assert.equal(carried([0, 10_001]), false);
  assert.equal(carried(Array.from({ length: 8 }, () => 0)), true);
  assert.equal(carried(Array.from({ length: 9 }, () => 0)), false);
  // More copies of one id than the protocol counts: the ones past its bound say nothing.
  const copies = Array.from({ length: 10_002 }, (_, n) => el('a', n));
  const read: PathReader<Fake> = { closest: (node) => node, copies: () => copies };
  const last = copies[10_001] ?? assert.fail('no copy');
  assert.deepEqual(copyOf(last, copies, ['a'], read), {});
  const bound = copies[10_000] ?? assert.fail('no copy');
  assert.deepEqual(copyOf(bound, copies, ['a'], read), { item: 10_000, path: [10_000] });
});
