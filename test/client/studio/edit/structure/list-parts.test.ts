// A part of a list item (ADR 0065): which selection is one, what its note says, and the item its
// note's control selects.

import assert from 'node:assert/strict';
import { test } from 'node:test';
import type { TreeNode } from '../../../../../client/channel/edit-protocol.ts';
import {
  itemOfPart,
  partDone,
  partNote,
  partOf,
  partTarget,
} from '../../../../../client/studio/edit/structure/list-parts.ts';
import { STYLE_PROPERTIES } from '../../../../../src/edit/index.ts';
import type { Inspect } from '../../../../../src/studio/api/edit/edit-schemas.ts';
import type {
  Structure,
  StructureEntry,
} from '../../../../../src/studio/api/edit/structure-schemas.ts';

const FILE = 'src/tsx/sections/Pricing.tsx';
const HASH = '0123456789abcdef';
const SECTION = 'sections/Pricing:section';
const CARD = `${SECTION}/Card`;
const HEADING = `${CARD}/Heading`;
const BADGE = `${CARD}/Badge`;
const ROW = `${CARD}/ul/li`;
const TEXT = `${ROW}/Text`;
const ICON = `${ROW}/Icon`;

type List = NonNullable<Inspect['list']>;
type View = Parameters<typeof partTarget>[0];

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

/** Three plan cards from a list; each has a heading, a badge in a condition, and feature rows. */
const STRUCTURE: Structure = {
  version: 2,
  folder: '/d/shop/v2',
  etags: {},
  elements: [
    entry(SECTION, null, { root: 'section' }),
    entry(CARD, SECTION, { lists: [CARD], item: true, movable: 'in-expression' }),
    entry(HEADING, CARD, { lists: [CARD] }),
    entry(BADGE, CARD, { lists: [CARD], movable: 'in-expression' }),
    entry(ROW, `${CARD}/ul`, { lists: [CARD, ROW], item: true, movable: 'in-expression' }),
    entry(TEXT, ROW, { lists: [CARD, ROW] }),
    entry(ICON, ROW, { lists: [CARD, ROW] }),
  ],
  sections: [],
};

const node = (id: string, count: number): TreeNode => ({ id, parent: null, name: id, count });

/** Three cards and nine rows on the page; one card shows the badge, six rows an icon. */
const TREE: TreeNode[] = [
  node(CARD, 3),
  node(HEADING, 3),
  node(BADGE, 1),
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
    movable: null,
    file: FILE,
    etag: `"${'a'.repeat(27)}"`,
    tag: 'Heading',
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

/** A part of a card: an element of the template the three cards share. */
const PART: List = { kind: 'literal', count: 3, reason: null, root: false };

/** `id` is selected and inspected with `list`. */
const view = (id: string, list: List | null, over: Partial<View> = {}): View => ({
  selection: [id],
  copies: [],
  structure: STRUCTURE,
  inspected: inspectOf(id, list),
  tree: TREE,
  ...over,
});

test('an element inside a list item that is not the item itself is a part of it', () => {
  assert.deepEqual(partTarget(view(HEADING, PART)), { id: HEADING, root: CARD, count: 3 });
  // Inside two lists the item is the root of the nearest one, and the count is its copies.
  assert.deepEqual(partTarget(view(TEXT, PART)), { id: TEXT, root: ROW, count: 9 });
});

test('no part: the item itself, no list, another element inspected, or several selected', () => {
  assert.equal(partTarget(view(CARD, { ...PART, root: true })), null);
  // A list that does not say what the element is: no part is claimed.
  assert.equal(partTarget(view(HEADING, { kind: 'literal', count: 3, reason: null })), null);
  assert.equal(partTarget(view(HEADING, null)), null);
  assert.equal(partTarget(view(HEADING, PART, { inspected: inspectOf(TEXT, PART) })), null);
  assert.equal(partTarget(view(HEADING, PART, { inspected: null })), null);
  assert.equal(partTarget(view(HEADING, PART, { selection: [HEADING, TEXT] })), null);
  assert.equal(partTarget(view(HEADING, PART, { selection: [] })), null);
});

test('what stands in the place of an expression is no part: it changes as the code does', () => {
  // The branch of a condition inside the item.
  assert.equal(partTarget(view(BADGE, PART)), null);
});

test('a part whose item is not named still says that every item changes', () => {
  // The structure is not read yet: the item is not named, and the inspect's count is used.
  const unread = view(HEADING, { ...PART, copies: 3 }, { structure: null });
  assert.deepEqual(partTarget(unread), { id: HEADING, root: null, count: 3 });
  assert.deepEqual(partTarget(view(HEADING, PART, { structure: null })), {
    id: HEADING,
    root: null,
    count: null,
  });
  // The page has not listed the item's copies: the inspect's count again.
  const unlisted = view(HEADING, { ...PART, copies: 3 }, { tree: [] });
  assert.deepEqual(partTarget(unlisted), { id: HEADING, root: CARD, count: 3 });
  assert.equal(itemOfPart(unread), null);
});

test('the note of a part says in how many items a change shows', () => {
  assert.equal(partNote({ id: HEADING, root: CARD, count: 3 }), 'lists.note.part');
  // One item, or a count that is not known: no number is said.
  assert.equal(partNote({ id: HEADING, root: CARD, count: 1 }), 'lists.note.partAny');
  assert.equal(partNote({ id: HEADING, root: null, count: null }), 'lists.note.partAny');
});

test('the structure alone says which element is a part, for one that is not selected', () => {
  const state = { structure: STRUCTURE, tree: TREE };
  assert.deepEqual(partOf(state, HEADING), { id: HEADING, root: CARD, count: 3 });
  assert.deepEqual(partOf(state, TEXT), { id: TEXT, root: ROW, count: 9 });
  // The item itself, an element in no list, a condition's branch, an unknown element.
  assert.equal(partOf(state, CARD), null);
  assert.equal(partOf(state, ROW), null);
  assert.equal(partOf(state, SECTION), null);
  assert.equal(partOf(state, BADGE), null);
  assert.equal(partOf(state, `${SECTION}/Gone`), null);
  assert.equal(partOf({ structure: null, tree: TREE }, HEADING), null);
  // Lists whose copies cannot be counted name no item.
  const uncounted: Structure = {
    ...STRUCTURE,
    elements: [entry(HEADING, CARD, { lists: null })],
  };
  assert.equal(partOf({ structure: uncounted, tree: TREE }, HEADING), null);
});

test('a written change to a part is said with the number of items it shows in', () => {
  assert.equal(partDone({ id: HEADING, root: CARD, count: 3 }, 'delete'), 'lists.done.delete');
  assert.equal(partDone({ id: HEADING, root: CARD, count: 3 }, 'move'), 'lists.done.move');
  const unknown = { id: HEADING, root: CARD, count: null };
  assert.equal(partDone(unknown, 'duplicate'), 'lists.doneAny.duplicate');
  assert.equal(partDone({ ...unknown, count: 1 }, 'delete'), 'lists.doneAny.delete');
});

test('the control of the note selects the item, on the copy the part was chosen on', () => {
  const heading = view(HEADING, PART, { copies: [{ id: HEADING, item: 1, path: [1] }] });
  assert.deepEqual(itemOfPart(heading), {
    selection: [CARD],
    copies: [{ id: CARD, item: 1, path: [1] }],
  });
  const text = view(TEXT, PART, { copies: [{ id: TEXT, item: 4, path: [1, 1] }] });
  assert.deepEqual(itemOfPart(text), {
    selection: [ROW],
    copies: [{ id: ROW, item: 4, path: [1, 1] }],
  });
  // A part selected as itself (a row of the layers list): the item as itself.
  assert.deepEqual(itemOfPart(view(HEADING, PART)), { selection: [CARD], copies: [] });
  // No part: nothing to select.
  assert.equal(itemOfPart(view(CARD, { ...PART, root: true })), null);
});

test('a part the page shows fewer times than items takes the place the source view counted', () => {
  // The third icon of the page stands in the fifth row.
  const copies = [{ id: ICON, item: 2, path: [1, 1] }];
  const counted = view(ICON, { ...PART, copy: 4, copies: 9 }, { copies });
  assert.deepEqual(itemOfPart(counted), {
    selection: [ROW],
    copies: [{ id: ROW, item: 4, path: [1, 1] }],
  });
  // The arrays hold another number of rows than the page shows: only the path is sure.
  const unsure = view(ICON, { ...PART, copy: 4, copies: 8 }, { copies });
  assert.deepEqual(itemOfPart(unsure), { selection: [ROW], copies: [{ id: ROW, path: [1, 1] }] });
  // Neither a place nor a path: the item as itself.
  const bare = view(ICON, PART, { copies: [{ id: ICON, item: 2 }] });
  assert.deepEqual(itemOfPart(bare), { selection: [ROW], copies: [] });
});
