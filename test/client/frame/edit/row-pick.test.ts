// What a press in the frame takes inside a list (ADR 0069): the list item first, the part under
// the pointer on the next press, and the element itself wherever the lists are not known. Plain
// values stand in for elements.

import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  type Listed,
  MENU,
  PLAIN,
  type Press,
  pressTarget,
  type RowFacts,
  type RowReader,
  type RowScene,
  rowAround,
  rowFacts,
  takesRow,
} from '../../../../client/frame/edit/row-pick.ts';

const ADD: Press = { add: true, double: false };
const DOUBLE: Press = { add: false, double: true };
const ADD_DOUBLE: Press = { add: true, double: true };

/** A press inside a row that nothing is selected in. */
const facts = (over: Partial<RowFacts> = {}): RowFacts => ({
  row: 'Feature',
  isRow: false,
  rowTaken: false,
  inRow: false,
  ...over,
});

test('a press outside any row, or on the row itself, takes the element under the pointer', () => {
  for (const press of [PLAIN, ADD, DOUBLE]) {
    assert.equal(takesRow(facts({ row: null }), press), false);
    assert.equal(takesRow(facts({ isRow: true }), press), false);
    assert.equal(takesRow(facts({ isRow: true, rowTaken: true }), press), false);
  }
});

test('a plain click on a part of a row takes the row, and the part once the row is chosen', () => {
  assert.equal(takesRow(facts(), PLAIN), true);
  assert.equal(takesRow(facts({ rowTaken: true }), PLAIN), false);
  assert.equal(takesRow(facts({ inRow: true }), PLAIN), false);
  assert.equal(takesRow(facts({ rowTaken: true, inRow: true }), PLAIN), false);
});

test('with the add key the row is added or taken out, and parts while a part is chosen', () => {
  assert.equal(takesRow(facts(), ADD), true);
  // A chosen row is named again, so it leaves the selection.
  assert.equal(takesRow(facts({ rowTaken: true }), ADD), true);
  // Parts of one row are being chosen together: the part is added or taken out.
  assert.equal(takesRow(facts({ inRow: true }), ADD), false);
  assert.equal(takesRow(facts({ rowTaken: true, inRow: true }), ADD), false);
});

test('a double click takes the element under the pointer whatever is selected', () => {
  for (const press of [DOUBLE, ADD_DOUBLE]) {
    assert.equal(takesRow(facts(), press), false);
    assert.equal(takesRow(facts({ rowTaken: true }), press), false);
    assert.equal(takesRow(facts({ inRow: true }), press), false);
  }
});

test('a right click names the row, also a chosen one, and the part while a part is chosen', () => {
  assert.equal(takesRow(facts(), MENU), true);
  // The menu of a chosen row is the row's, not the menu of the text under the pointer.
  assert.equal(takesRow(facts({ rowTaken: true }), MENU), true);
  assert.equal(takesRow(facts({ inRow: true }), MENU), false);
  assert.equal(takesRow(facts({ isRow: true, rowTaken: true }), MENU), false);
});

/** An element of a fake page: its id and the element it sits in. */
type PageNode = { id: string; parent: PageNode | null };

/**
 * Two cards from `plans.map`, the first with two features, the second with three, each feature
 * row from `plan.features.map` with a text and an icon. In page order.
 */
function page(): PageNode[] {
  const out: PageNode[] = [];
  const add = (id: string, parent: PageNode | null): PageNode => {
    const node = { id, parent };
    out.push(node);
    return node;
  };
  for (const features of [2, 3]) {
    const card = add('Card', null);
    add('Heading', card);
    for (let n = 0; n < features; n += 1) {
      const feature = add('Feature', card);
      add('Text', feature);
      add('Icon', feature);
    }
  }
  return out;
}

/** The structure of that page: both lists are literals of the file, so both roots are items. */
const ENTRIES = new Map<string, Listed>([
  ['Card', { lists: ['Card'], item: true }],
  ['Heading', { lists: ['Card'], item: false }],
  ['Feature', { lists: ['Card', 'Feature'], item: true }],
  ['Text', { lists: ['Card', 'Feature'], item: false }],
  ['Icon', { lists: ['Card', 'Feature'], item: false }],
]);
const entryOf = (id: string): Listed | undefined => ENTRIES.get(id);

const within = (node: PageNode, outer: PageNode): boolean =>
  node.parent !== null && (node.parent === outer || within(node.parent, outer));

const READ: RowReader<PageNode> = {
  idOf: (node) => node.id,
  closest(node, id) {
    for (let at: PageNode | null = node; at !== null; at = at.parent) {
      if (at.id === id) return at;
    }
    return null;
  },
  inside: within,
};

/** Copy `n` of `id` on the page. */
const nth = (nodes: readonly PageNode[], id: string, n: number): PageNode =>
  nodes.filter((node) => node.id === id)[n] ?? assert.fail(`no ${id} ${n}`);

const scene = (
  selected: readonly PageNode[],
  entries: (id: string) => Listed | undefined = entryOf,
): RowScene<PageNode> => ({ entryOf: entries, selected: () => selected, read: READ });

test('in a list inside a list a feature text takes its feature row, a heading its card', () => {
  const nodes = page();
  // The second card's third feature: the fifth feature of the page.
  assert.equal(rowAround(nth(nodes, 'Text', 4), entryOf, READ), nth(nodes, 'Feature', 4));
  assert.equal(rowAround(nth(nodes, 'Icon', 0), entryOf, READ), nth(nodes, 'Feature', 0));
  assert.equal(rowAround(nth(nodes, 'Heading', 1), entryOf, READ), nth(nodes, 'Card', 1));
  // A row pressed itself is its own row.
  assert.equal(rowAround(nth(nodes, 'Feature', 2), entryOf, READ), nth(nodes, 'Feature', 2));
  assert.equal(rowAround(nth(nodes, 'Card', 0), entryOf, READ), nth(nodes, 'Card', 0));
});

test('lists that are not known give no row, and the press takes the element itself', () => {
  const nodes = page();
  const text = nth(nodes, 'Text', 0);
  const unknown = (id: string): Listed | undefined =>
    id === 'Text' ? { lists: null, item: false } : entryOf(id);
  const row = rowAround(text, unknown, READ);
  assert.equal(row, null);
  const known = rowFacts(text, row, [], READ);
  assert.deepEqual(known, { row: null, isRow: false, rowTaken: false, inRow: false });
  for (const press of [PLAIN, ADD]) assert.equal(takesRow(known, press), false);
  assert.equal(pressTarget(text, PLAIN, scene([], unknown)), text);
});

test('an element with no entry yet, or that stands in no list, has no row', () => {
  const nodes = page();
  const text = nth(nodes, 'Text', 0);
  // No entry yet: a build the structure has not answered.
  const missing = (id: string): Listed | undefined => (id === 'Text' ? undefined : entryOf(id));
  const outside = (id: string): Listed | undefined =>
    id === 'Text' ? { lists: [], item: false } : entryOf(id);
  for (const entries of [missing, outside]) {
    assert.equal(rowAround(text, entries, READ), null);
    assert.equal(pressTarget(text, PLAIN, scene([], entries)), text);
  }
  assert.equal(rowAround(text, entryOf, READ), nth(nodes, 'Feature', 0));
});

test('a list the editor cannot write is no row: the item of the list around it is', () => {
  const nodes = page();
  const fixed = (id: string): Listed | undefined =>
    id === 'Feature' ? { lists: ['Card', 'Feature'], item: false } : entryOf(id);
  assert.equal(rowAround(nth(nodes, 'Text', 4), fixed, READ), nth(nodes, 'Card', 1));
  const none = (id: string): Listed | undefined => {
    const entry = entryOf(id);
    return entry === undefined ? undefined : { ...entry, item: false };
  };
  assert.equal(rowAround(nth(nodes, 'Text', 4), none, READ), null);
});

test('a press takes the row on its copy first, and the part once that copy is chosen', () => {
  const nodes = page();
  const text = nth(nodes, 'Text', 4);
  const feature = nth(nodes, 'Feature', 4);
  assert.equal(pressTarget(text, PLAIN, scene([])), feature);
  assert.equal(pressTarget(text, PLAIN, scene([feature])), text);
  // Another copy of the row is chosen, or a part of another copy: this copy is not.
  assert.equal(pressTarget(text, PLAIN, scene([nth(nodes, 'Feature', 3)])), feature);
  assert.equal(pressTarget(text, PLAIN, scene([nth(nodes, 'Icon', 3)])), feature);
  // A part of this copy is chosen: the press goes to the part under the pointer.
  assert.equal(pressTarget(text, PLAIN, scene([nth(nodes, 'Icon', 4)])), text);
  // Nothing under the pointer: nothing.
  assert.equal(pressTarget(null, PLAIN, scene([])), null);
});

test('the add key takes the row in or out, and a part while a part of that copy is chosen', () => {
  const nodes = page();
  const text = nth(nodes, 'Text', 4);
  const feature = nth(nodes, 'Feature', 4);
  assert.equal(pressTarget(text, ADD, scene([nth(nodes, 'Feature', 3)])), feature);
  assert.equal(pressTarget(text, ADD, scene([feature])), feature);
  assert.equal(pressTarget(text, ADD, scene([nth(nodes, 'Icon', 4)])), text);
});

test('a double click takes the text under the pointer whatever is chosen', () => {
  const nodes = page();
  const text = nth(nodes, 'Text', 4);
  for (const selected of [[], [nth(nodes, 'Feature', 4)], [nth(nodes, 'Icon', 4)]]) {
    assert.equal(pressTarget(text, DOUBLE, scene(selected)), text);
  }
});

test('a press on a heading goes to the heading once its card or a row in it is chosen', () => {
  const nodes = page();
  const heading = nth(nodes, 'Heading', 1);
  const card = nth(nodes, 'Card', 1);
  const feature = nth(nodes, 'Feature', 4);
  assert.equal(pressTarget(heading, PLAIN, scene([])), card);
  assert.equal(pressTarget(heading, PLAIN, scene([card])), heading);
  assert.equal(pressTarget(heading, PLAIN, scene([feature])), heading);
  // A chosen card does not keep a press on one of its feature rows from taking that row.
  assert.equal(pressTarget(nth(nodes, 'Text', 4), PLAIN, scene([card])), feature);
});
