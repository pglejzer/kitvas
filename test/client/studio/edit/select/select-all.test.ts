// Select all (ADR 0065): the siblings of the first selected element, for a list item the items
// of its own list, and the page's sections when nothing is selected.

import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  type CopyRef,
  MAX_COPIES,
  type TreeNode,
} from '../../../../../client/channel/edit-protocol.ts';
import { selectAll } from '../../../../../client/studio/edit/select/select-all.ts';
import { STYLE_PROPERTIES } from '../../../../../src/edit/index.ts';
import type { Inspect } from '../../../../../src/studio/api/edit/edit-schemas.ts';
import type {
  Structure,
  StructureEntry,
} from '../../../../../src/studio/api/edit/structure-schemas.ts';

const FILE = 'src/tsx/sections/Pricing.tsx';
const HASH = '0123456789abcdef';
const HERO = 'sections/Hero:section';
const PRICING = 'sections/Pricing:section';
const TITLE = `${PRICING}/h2`;
const GRID = `${PRICING}/div`;
const CARD = `${GRID}/Card`;
const HEADING = `${CARD}/Heading`;
const LIST = `${CARD}/ul`;
const ROW = `${LIST}/li`;
const TEXT = `${ROW}/Text`;
const ICON = `${ROW}/Icon`;

type List = NonNullable<Inspect['list']>;
type View = Parameters<typeof selectAll>[0];

const entry = (
  id: string,
  parent: string | null,
  over: Partial<StructureEntry> = {},
): StructureEntry => ({
  id,
  file: FILE,
  line: 1,
  column: 1,
  tag: 'div',
  parent,
  hash: HASH,
  text: null,
  props: [],
  component: null,
  movable: null,
  accepts: true,
  mixed: false,
  interactive: false,
  root: null,
  ...over,
});

/** Two sections; three plan cards from a list, each with a heading and a list of feature rows. */
const STRUCTURE: Structure = {
  version: 2,
  folder: '/d/shop/v2',
  etags: {},
  elements: [
    entry(HERO, null, { root: 'section' }),
    entry(PRICING, null, { root: 'section' }),
    entry(TITLE, PRICING),
    entry(GRID, PRICING),
    entry(CARD, GRID, { lists: [CARD], item: true, movable: 'in-expression' }),
    entry(HEADING, CARD, { lists: [CARD] }),
    entry(LIST, CARD, { lists: [CARD] }),
    entry(ROW, LIST, { lists: [CARD, ROW], item: true, movable: 'in-expression' }),
    entry(TEXT, ROW, { lists: [CARD, ROW] }),
    entry(ICON, ROW, { lists: [CARD, ROW] }),
  ],
  sections: [
    { id: 'hero', element: HERO, purpose: '' },
    { id: 'pricing', element: PRICING, purpose: '' },
  ],
};

const node = (id: string, count: number): TreeNode => ({ id, parent: null, name: id, count });

/** Three cards and nine rows on the page; only six rows show an icon. */
const TREE: TreeNode[] = [
  node(CARD, 3),
  node(HEADING, 3),
  node(LIST, 3),
  node(ROW, 9),
  node(TEXT, 9),
  node(ICON, 6),
];

function inspectOf(id: string, list: List | null): Inspect {
  const styles = Object.fromEntries(
    STYLE_PROPERTIES.map((property) => [property, { kind: 'kit' }]),
  ) as Inspect['styles'];
  return {
    id,
    version: 2,
    hash: HASH,
    movable: 'in-expression',
    file: FILE,
    etag: `"${'a'.repeat(27)}"`,
    tag: 'li',
    component: null,
    props: [],
    spread: false,
    text: null,
    textRefusal: 'no-text',
    className: null,
    styleClass: null,
    scss: null,
    styles,
    list,
  };
}

const view = (over: Partial<View> = {}): View => ({
  selection: [],
  copies: [],
  structure: STRUCTURE,
  inspected: null,
  tree: TREE,
  ...over,
});

const SECTIONS = { selection: [HERO, PRICING], copies: [] };
/** The rows of one plan, read for the copy at `[1, 1]`. */
const ROWS: List = { kind: 'literal', count: 3, reason: null, root: true, copy: 4, copies: 9 };
const CARDS: List = { kind: 'literal', count: 3, reason: null, root: true };

test("with nothing selected, select-all selects the page's sections", () => {
  assert.deepEqual(selectAll(view()), SECTIONS);
  // A selected element the structure does not know is no place to look for siblings.
  assert.deepEqual(selectAll(view({ selection: ['sections/Gone:div'] })), SECTIONS);
  // A section whose root is not read is left out.
  const unread: Structure = {
    ...STRUCTURE,
    sections: [
      { id: 'hero', element: null, purpose: '' },
      { id: 'pricing', element: PRICING, purpose: '' },
    ],
  };
  assert.deepEqual(selectAll(view({ structure: unread })), { selection: [PRICING], copies: [] });
  // A draft without a layout: every root a section's file returns.
  assert.deepEqual(selectAll(view({ structure: { ...STRUCTURE, sections: [] } })), SECTIONS);
});

test('there is nothing to select before the structure is read, or on an empty page', () => {
  assert.equal(selectAll(view({ structure: null })), null);
  const empty: Structure = { ...STRUCTURE, elements: [], sections: [] };
  assert.equal(selectAll(view({ structure: empty })), null);
});

test('with an element selected, select-all selects its siblings', () => {
  assert.deepEqual(selectAll(view({ selection: [TITLE] })), {
    selection: [TITLE, GRID],
    copies: [],
  });
  // The first selected element says whose siblings.
  assert.deepEqual(selectAll(view({ selection: [GRID, HEADING] })), {
    selection: [TITLE, GRID],
    copies: [],
  });
  // A section's root has no parent: its siblings are the sections.
  assert.deepEqual(selectAll(view({ selection: [PRICING] })), SECTIONS);
});

test('with one row selected, its siblings are the rows of its own list', () => {
  const state = view({
    selection: [ROW],
    copies: [{ id: ROW, item: 4, path: [1, 1] }],
    inspected: inspectOf(ROW, ROWS),
  });
  const all = selectAll(state);
  // The rows of the second plan: they stand one after another among the nine of the page.
  assert.deepEqual(all, {
    selection: [ROW],
    copies: [
      { id: ROW, item: 3, path: [1, 0] },
      { id: ROW, item: 4, path: [1, 1] },
      { id: ROW, item: 5, path: [1, 2] },
    ],
  });
  // Pressed again, the same rows stay: it never grows to the rows of the other plans.
  assert.ok(all !== null);
  assert.deepEqual(selectAll({ ...state, ...all }), all);
  // A copy the frame gave no place among the copies: the rows are named by their paths.
  const pathOnly = view({
    selection: [ROW],
    copies: [{ id: ROW, path: [2, 0] }],
    inspected: inspectOf(ROW, ROWS),
  });
  assert.deepEqual(selectAll(pathOnly)?.copies, [
    { id: ROW, path: [2, 0] },
    { id: ROW, path: [2, 1] },
    { id: ROW, path: [2, 2] },
  ]);
});

test('the items of a list inside no other are every copy, each named', () => {
  const copies: CopyRef[] = [{ id: CARD, item: 1, path: [1] }];
  const state = view({ selection: [CARD], copies, inspected: inspectOf(CARD, CARDS) });
  const cards = {
    selection: [CARD],
    copies: [
      { id: CARD, item: 0, path: [0] },
      { id: CARD, item: 1, path: [1] },
      { id: CARD, item: 2, path: [2] },
    ],
  };
  assert.deepEqual(selectAll(state), cards);
  // The same from a copy the frame gave no path.
  assert.deepEqual(selectAll({ ...state, copies: [{ id: CARD, item: 1 }] }), cards);
  // Never more copies than a message names.
  const long = inspectOf(CARD, { ...CARDS, count: MAX_COPIES + 300 });
  assert.equal(selectAll({ ...state, inspected: long })?.copies.length, MAX_COPIES);
});

test('a list whose items are not counted: the element itself, or what is chosen stays', () => {
  const card: CopyRef[] = [{ id: CARD, item: 1, path: [1] }];
  // In a list inside no other, the element itself is every item.
  assert.deepEqual(selectAll(view({ selection: [CARD], copies: card })), {
    selection: [CARD],
    copies: [],
  });
  const computed: List = { kind: 'prop', count: null, reason: 'list-not-literal', root: true };
  const readOnly = view({ selection: [CARD], copies: card, inspected: inspectOf(CARD, computed) });
  assert.deepEqual(selectAll(readOnly), { selection: [CARD], copies: [] });
  // Inside another list the element itself would be the rows of every plan: the copy stays.
  const row: CopyRef[] = [{ id: ROW, item: 4, path: [1, 1] }];
  assert.deepEqual(selectAll(view({ selection: [ROW], copies: row })), {
    selection: [ROW],
    copies: row,
  });
});

test('a list item selected as itself has only its element siblings', () => {
  assert.deepEqual(selectAll(view({ selection: [ROW] })), { selection: [ROW], copies: [] });
  assert.deepEqual(selectAll(view({ selection: [CARD] })), { selection: [CARD], copies: [] });
});

test('the siblings of a part of an item are selected on the copy the part was chosen on', () => {
  const heading = view({ selection: [HEADING], copies: [{ id: HEADING, item: 1, path: [1] }] });
  assert.deepEqual(selectAll(heading), {
    selection: [HEADING, LIST],
    copies: [
      { id: HEADING, item: 1, path: [1] },
      { id: LIST, item: 1, path: [1] },
    ],
  });
  // A sibling the page shows fewer times has another place among its copies: it is selected as
  // itself.
  const text = view({ selection: [TEXT], copies: [{ id: TEXT, item: 4, path: [1, 1] }] });
  assert.deepEqual(selectAll(text), {
    selection: [TEXT, ICON],
    copies: [{ id: TEXT, item: 4, path: [1, 1] }],
  });
  // A part selected as itself: its siblings as themselves.
  assert.deepEqual(selectAll(view({ selection: [HEADING] })), {
    selection: [HEADING, LIST],
    copies: [],
  });
});
