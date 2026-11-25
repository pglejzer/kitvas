// Data list items on the draft page (plan 16, task D; ADR 0065): which copy is the item, what the
// list actions send and when they are off, the ops by a copy's path, a Delete of several chosen
// items, the inline text edit's `before`, the note, and the routing of Move, Duplicate and Delete
// through the actions and the menu.

import assert from 'node:assert/strict';
import { test } from 'node:test';
import type { CopyRef, TreeNode } from '../../../../../client/channel/edit-protocol.ts';
import type { EditorContext } from '../../../../../client/studio/edit/context.ts';
import {
  createStore,
  type EditorState,
  type Gesture,
  type Store,
} from '../../../../../client/studio/edit/store.ts';
import {
  type ActionId,
  actionsFor,
  runAction,
} from '../../../../../client/studio/edit/structure/actions.ts';
import {
  chosenItems,
  itemTarget,
  keyFieldOf,
  listOps,
  listReason,
  noteText,
  removeOps,
  shifted,
  textTarget,
} from '../../../../../client/studio/edit/structure/lists.ts';
import { menuItems } from '../../../../../client/studio/edit/structure/menu.ts';
import { STYLE_PROPERTIES } from '../../../../../src/edit/index.ts';
import type { EditOutcome, Inspect } from '../../../../../src/studio/api/edit/edit-schemas.ts';
import type { StructureEntry } from '../../../../../src/studio/api/edit/structure-schemas.ts';

const FILE = 'src/tsx/sections/Pricing.tsx';
const CARD = 'sections/Pricing:section/Stack/Card';
const HEADING = `${CARD}/Heading`;
const ROW = `${CARD}/ul/li`;
const HASH = '0123456789abcdef';
const ETAG = `"${'a'.repeat(27)}"`;

type List = NonNullable<Inspect['list']>;

const LITERAL: List = { kind: 'literal', count: 3, reason: null };
const PROP: List = { kind: 'prop', count: null, reason: 'list-not-literal' };
const WITH_TEXTS: List = { ...LITERAL, texts: ['Free', 'Pro', null] };
/** A part of an item: an element of the template every card shares. */
const PART: List = { ...LITERAL, root: false };
/**
 * The feature rows of the second of three plans, read for the copy at `[1, 1]`: three rows in
 * that plan, the fifth of the nine the page shows.
 */
const ROWS: List = { kind: 'literal', count: 3, reason: null, root: true, copy: 4, copies: 9 };

function inspectOf(id: string, list: List | null, text: string | null = null): Inspect {
  const styles = Object.fromEntries(
    STYLE_PROPERTIES.map((property) => [property, { kind: 'kit' }]),
  ) as Inspect['styles'];
  return {
    id,
    version: 2,
    hash: HASH,
    movable: 'in-expression',
    file: FILE,
    etag: ETAG,
    tag: 'Card',
    component: null,
    props: [],
    spread: false,
    text,
    textRefusal: text === null ? 'no-text' : null,
    className: null,
    styleClass: null,
    scss: null,
    styles,
    list,
  };
}

const node = (id: string, count: number): TreeNode => ({ id, parent: null, name: id, count });

function entry(id: string): StructureEntry {
  return {
    id,
    file: FILE,
    line: 1,
    column: 1,
    tag: 'Card',
    parent: null,
    hash: HASH,
    text: null,
    props: [],
    component: 'Card',
    movable: 'in-expression',
    accepts: true,
    mixed: false,
    interactive: false,
    root: null,
  };
}

/** The selection is `id`, inspected with `list`, rendered `copies` times, on its copy `item`. */
function stateWith(
  id: string,
  list: List | null,
  copies: number,
  item: number | null,
  more: Partial<EditorState> = {},
): EditorState {
  const store = createStore('demo');
  store.set({
    on: true,
    selection: [id],
    copies: item === null ? [] : [{ id, item }],
    inspected: inspectOf(id, list),
    tree: [node(id, copies)],
    ...more,
  });
  return store.get();
}

/** A feature row chosen on the copy the frame named: its place on the page and its path. */
const rowAt = (item: number, path: number[], rendered = 9): EditorState =>
  stateWith(ROW, ROWS, rendered, null, { copies: [{ id: ROW, item, path }] });

test('the selection is a list item on the chosen copy, with the count and no mismatch', () => {
  const target = itemTarget(stateWith(CARD, LITERAL, 3, 1));
  assert.deepEqual(target, {
    id: CARD,
    list: LITERAL,
    item: 1,
    path: null,
    copy: 1,
    count: 3,
    mismatch: false,
  });
  // The element itself, every copy: no item is named.
  assert.equal(itemTarget(stateWith(CARD, LITERAL, 3, null))?.item, null);
  // One copy needs no pick.
  const one: List = { kind: 'literal', count: 1, reason: null };
  assert.equal(itemTarget(stateWith(CARD, one, 1, null))?.item, 0);
  // A copy past the end is no item, and more copies than items is a mismatch.
  assert.equal(itemTarget(stateWith(CARD, LITERAL, 3, 4))?.item, null);
  assert.equal(itemTarget(stateWith(CARD, LITERAL, 6, 1))?.mismatch, true);
  // A read-only list counts the copies the frame renders.
  assert.equal(itemTarget(stateWith(CARD, PROP, 4, 2))?.count, 4);
});

test('no list item: no list, another element inspected, several selected, or a part', () => {
  assert.equal(itemTarget(stateWith(CARD, null, 3, 1)), null);
  assert.equal(itemTarget(stateWith(CARD, LITERAL, 3, 1, { inspected: null })), null);
  const other = stateWith(CARD, LITERAL, 3, 1, { inspected: inspectOf(HEADING, LITERAL) });
  assert.equal(itemTarget(other), null);
  assert.equal(itemTarget(stateWith(CARD, LITERAL, 3, 1, { selection: [CARD, HEADING] })), null);
  // A part of an item is an element of the template: the element actions' rules apply to it.
  const part = stateWith(HEADING, PART, 3, 1);
  assert.equal(itemTarget(part), null);
  assert.equal(chosenItems(part), null);
  assert.equal(listReason(part, 'delete'), undefined);
});

test('a copy inside another list is the item at the end of its path, in its own list', () => {
  const target = itemTarget(rowAt(4, [1, 1]));
  assert.deepEqual(target, {
    id: ROW,
    list: ROWS,
    item: 1,
    path: [1, 1],
    copy: 4,
    count: 3,
    mismatch: false,
  });
  // The edges are those of the copy's own list, not of all the rows of the page.
  assert.equal(listReason(rowAt(3, [1, 0]), 'move-up'), 'at-edge');
  assert.equal(listReason(rowAt(3, [1, 0]), 'move-down'), null);
  assert.equal(listReason(rowAt(5, [1, 2]), 'move-down'), 'at-edge');
  assert.equal(listReason(rowAt(5, [1, 2]), 'move-up'), null);
  // The page shows fewer rows than the arrays hold: no copy can be told apart.
  assert.equal(listReason(rowAt(4, [1, 1], 8), 'delete'), 'list-not-literal');
});

test('the list actions are off at the edges, without a copy and on a mismatch', () => {
  const first = stateWith(CARD, LITERAL, 3, 0);
  assert.equal(listReason(first, 'move-up'), 'at-edge');
  assert.equal(listReason(first, 'move-down'), null);
  assert.equal(listReason(first, 'duplicate'), null);
  assert.equal(listReason(first, 'delete'), null);
  assert.equal(listReason(stateWith(CARD, LITERAL, 3, 2), 'move-down'), 'at-edge');
  assert.equal(listReason(stateWith(CARD, LITERAL, 3, null), 'delete'), 'pick-item');
  assert.equal(listReason(stateWith(CARD, LITERAL, 5, 1), 'delete'), 'list-not-literal');
  // Other actions, and no list item, keep the element actions' own rules.
  assert.equal(listReason(first, 'cut'), undefined);
  assert.equal(listReason(stateWith(CARD, null, 3, 0), 'delete'), undefined);
  // A read-only list sends them, so the server's refusal offers Ask Claude.
  assert.equal(listReason(stateWith(CARD, PROP, 3, 1), 'move-up'), null);
});

test('the list ops name the item, and say how far the chosen copy moves', () => {
  const target = itemTarget(stateWith(CARD, LITERAL, 3, 1));
  assert.ok(target !== null);
  const of = (action: ActionId) => listOps(target, action);
  assert.deepEqual(of('move-up'), {
    ops: [{ op: 'moveItem', id: CARD, item: 1, to: 0 }],
    shift: -1,
  });
  assert.deepEqual(of('move-down'), {
    ops: [{ op: 'moveItem', id: CARD, item: 1, to: 2 }],
    shift: 1,
  });
  assert.deepEqual(of('duplicate'), {
    ops: [{ op: 'duplicateItem', id: CARD, item: 1 }],
    shift: 1,
  });
  assert.deepEqual(of('delete'), { ops: [{ op: 'removeItem', id: CARD, item: 1 }], shift: null });
  assert.equal(of('copy'), null);
  // The copy after a move: its place among the copies moves with it.
  assert.deepEqual(shifted(target, 1), { id: CARD, item: 2 });
  assert.deepEqual(shifted(target, -1), { id: CARD, item: 0 });
});

test('the ops of a copy inside another list carry its path, and the copy moves along it', () => {
  const target = itemTarget(rowAt(4, [1, 1]));
  assert.ok(target !== null);
  const of = (action: ActionId) => listOps(target, action);
  assert.deepEqual(of('move-up'), {
    ops: [{ op: 'moveItem', id: ROW, item: 1, to: 0, path: [1, 1] }],
    shift: -1,
  });
  assert.deepEqual(of('move-down'), {
    ops: [{ op: 'moveItem', id: ROW, item: 1, to: 2, path: [1, 1] }],
    shift: 1,
  });
  assert.deepEqual(of('duplicate'), {
    ops: [{ op: 'duplicateItem', id: ROW, item: 1, path: [1, 1] }],
    shift: 1,
  });
  assert.deepEqual(of('delete'), {
    ops: [{ op: 'removeItem', id: ROW, item: 1, path: [1, 1] }],
    shift: null,
  });
  assert.deepEqual(shifted(target, 1), { id: ROW, item: 5, path: [1, 2] });
  assert.deepEqual(shifted(target, -1), { id: ROW, item: 3, path: [1, 0] });
  // The op's path is its own array: the copy's path stays as the frame gave it.
  assert.deepEqual(target.path, [1, 1]);
});

test('several chosen items are removed from the last place of each list to the first', () => {
  const picked: CopyRef[] = [
    { id: ROW, item: 0, path: [0, 0] },
    { id: ROW, item: 5, path: [1, 2] },
    { id: ROW, item: 3, path: [1, 0] },
    { id: ROW, item: 2, path: [0, 2] },
  ];
  // Each op finds its item where the one before left it: a later place never moves an earlier one.
  assert.deepEqual(removeOps(ROW, picked), [
    { op: 'removeItem', id: ROW, item: 2, path: [1, 2] },
    { op: 'removeItem', id: ROW, item: 0, path: [1, 0] },
    { op: 'removeItem', id: ROW, item: 2, path: [0, 2] },
    { op: 'removeItem', id: ROW, item: 0, path: [0, 0] },
  ]);
  // In a list inside no other, a copy's place among the copies is its item.
  const flat: CopyRef[] = [
    { id: CARD, item: 0 },
    { id: CARD, item: 2 },
    { id: CARD, item: 1 },
  ];
  assert.deepEqual(removeOps(CARD, flat), [
    { op: 'removeItem', id: CARD, item: 2 },
    { op: 'removeItem', id: CARD, item: 1 },
    { op: 'removeItem', id: CARD, item: 0 },
  ]);
  // A copy that names no item: nothing is removed.
  assert.equal(removeOps(CARD, [{ id: CARD, item: 1 }, { id: CARD }]), null);
});

test('with several items chosen only Delete is on', () => {
  const picked: CopyRef[] = [
    { id: ROW, item: 3, path: [1, 0] },
    { id: ROW, item: 5, path: [1, 2] },
  ];
  const state = stateWith(ROW, ROWS, 9, null, { copies: picked });
  assert.deepEqual(chosenItems(state), { id: ROW, copies: picked });
  assert.equal(listReason(state, 'delete'), null);
  assert.equal(listReason(state, 'duplicate'), 'one-only');
  assert.equal(listReason(state, 'move-up'), 'one-only');
  assert.equal(listReason(state, 'move-down'), 'one-only');
  assert.equal(listReason(state, 'cut'), undefined);
  // One chosen copy is the one item.
  assert.equal(chosenItems(stateWith(CARD, LITERAL, 3, 1)), null);
  // More copies on the page than the list has items: a place among them names no item.
  const flat: CopyRef[] = [
    { id: CARD, item: 0 },
    { id: CARD, item: 4 },
  ];
  const mismatch = stateWith(CARD, LITERAL, 5, null, { copies: flat });
  assert.equal(listReason(mismatch, 'delete'), 'list-not-literal');
});

type Fixture = { ctx: EditorContext; store: Store; gestures: Gesture[] };

const APPLIED: EditOutcome = {
  outcome: 'applied',
  version: 2,
  started: false,
  etags: {},
  merged: false,
  inverse: [],
  renames: {},
  created: [],
  dropped: [],
};

function fixture(list: List, item: number | null): Fixture {
  const store = createStore('demo');
  store.set({
    on: true,
    selection: [CARD],
    copies: item === null ? [] : [{ id: CARD, item }],
    inspected: inspectOf(CARD, list),
    tree: [node(CARD, 3)],
    structure: { version: 2, folder: '/d', etags: {}, elements: [entry(CARD)], sections: [] },
  });
  const gestures: Gesture[] = [];
  const ctx = {
    slug: 'demo',
    store,
    history: {
      apply: async (gesture: Gesture) => {
        gestures.push(gesture);
        return APPLIED;
      },
    },
    bridge: { send: () => undefined },
  } as unknown as EditorContext;
  return { ctx, store, gestures };
}

const stateOf = (f: Fixture, id: ActionId) => actionsFor(f.store.get()).find((a) => a.id === id);

test('Move, Duplicate and Delete on a list item act on the item of the data', async () => {
  const f = fixture(LITERAL, 1);
  assert.deepEqual(stateOf(f, 'move-down'), { id: 'move-down', enabled: true, reason: null });
  await runAction(f.ctx, 'move-down');
  assert.deepEqual(f.gestures[0], {
    ops: [{ op: 'moveItem', id: CARD, item: 1, to: 2 }],
    label: 'lists.label.move-down',
  });
  // The moved item stays the chosen one, so a second Move down is at the edge.
  assert.deepEqual(f.store.get().copies, [{ id: CARD, item: 2 }]);
  assert.equal(f.store.get().item, 2);
  assert.equal(stateOf(f, 'move-down')?.reason, 'at-edge');
  const copy = fixture(LITERAL, 1);
  await runAction(copy.ctx, 'duplicate');
  assert.deepEqual(copy.gestures[0]?.ops, [{ op: 'duplicateItem', id: CARD, item: 1 }]);
  assert.equal(copy.store.get().item, 2);
  // A deleted item leaves the selection: what is left of the list is not chosen.
  const gone = fixture(LITERAL, 1);
  await runAction(gone.ctx, 'delete');
  assert.deepEqual(gone.gestures[0]?.ops, [{ op: 'removeItem', id: CARD, item: 1 }]);
  assert.deepEqual(gone.store.get().selection, []);
  assert.equal(gone.store.get().item, null);
});

test('an item inside another list is moved by its path and stays chosen at its new place', async () => {
  const f = fixture(ROWS, null);
  f.store.set({
    selection: [ROW],
    copies: [{ id: ROW, item: 4, path: [1, 1] }],
    inspected: inspectOf(ROW, ROWS),
    tree: [node(ROW, 9)],
  });
  await runAction(f.ctx, 'move-down');
  assert.deepEqual(f.gestures[0]?.ops, [{ op: 'moveItem', id: ROW, item: 1, to: 2, path: [1, 1] }]);
  assert.deepEqual(f.store.get().copies, [{ id: ROW, item: 5, path: [1, 2] }]);
  assert.equal(stateOf(f, 'move-down')?.reason, 'at-edge');
});

test('Delete on several chosen items is one request, and none of them stays chosen', async () => {
  const f = fixture(LITERAL, null);
  f.store.set({
    selection: [CARD],
    copies: [
      { id: CARD, item: 0 },
      { id: CARD, item: 2 },
    ],
  });
  assert.deepEqual(stateOf(f, 'delete'), { id: 'delete', enabled: true, reason: null });
  assert.equal(stateOf(f, 'duplicate')?.reason, 'one-only');
  // An action that is off sends nothing.
  await runAction(f.ctx, 'duplicate');
  assert.deepEqual(f.gestures, []);
  await runAction(f.ctx, 'delete');
  assert.deepEqual(f.gestures, [
    {
      ops: [
        { op: 'removeItem', id: CARD, item: 2 },
        { op: 'removeItem', id: CARD, item: 0 },
      ],
      label: 'lists.label.deleteMany',
    },
  ]);
  assert.deepEqual(f.store.get().selection, []);
  assert.deepEqual(f.store.get().copies, []);
});

test('without a chosen copy the list actions are off; the element rules keep the rest', () => {
  const f = fixture(LITERAL, null);
  assert.deepEqual(stateOf(f, 'delete'), { id: 'delete', enabled: false, reason: 'pick-item' });
  assert.equal(stateOf(f, 'cut')?.reason, 'in-expression');
  assert.equal(stateOf(f, 'copy')?.enabled, true);
});

test('a read-only list sends its item ops, which the server refuses with the reason', async () => {
  const f = fixture(PROP, 0);
  await runAction(f.ctx, 'duplicate');
  assert.deepEqual(f.gestures[0]?.ops, [{ op: 'duplicateItem', id: CARD, item: 0 }]);
});

test('the inline text edit of an item reads its string as the before', () => {
  const state = stateWith(CARD, LITERAL, 3, 1, { inspected: inspectOf(CARD, WITH_TEXTS) });
  assert.deepEqual(textTarget(state), { id: CARD, item: 1, before: 'Pro' });
  // No string for that item, no texts at all, or a plain text child of its own: none.
  assert.equal(textTarget({ ...state, item: 2 }), null);
  assert.equal(textTarget(stateWith(CARD, LITERAL, 3, 1)), null);
  const own = { ...state, inspected: inspectOf(CARD, WITH_TEXTS, 'Plans') };
  assert.equal(textTarget(own), null);
  assert.equal(textTarget({ ...state, item: null }), null);
  // The text of a part is its item's data too.
  const part = stateWith(HEADING, { ...WITH_TEXTS, root: false }, 3, 1);
  assert.deepEqual(textTarget(part), { id: HEADING, item: 1, before: 'Pro' });
  // A copy with a path is the item at the end of it.
  const copies: CopyRef[] = [{ id: CARD, item: 0, path: [0] }];
  const pathed = stateWith(CARD, WITH_TEXTS, 3, null, { copies });
  assert.deepEqual(textTarget(pathed), { id: CARD, item: 0, before: 'Free' });
});

test('the note says which item of a data list it is, or why the list is read-only', () => {
  const at = (list: List, copies: number, item: number | null) =>
    noteText(itemTarget(stateWith(CARD, list, copies, item)));
  assert.equal(at(LITERAL, 3, 1), 'lists.note.item');
  assert.equal(at(LITERAL, 3, null), 'lists.note.pick');
  assert.equal(at(LITERAL, 2, 1), 'lists.note.mismatch');
  assert.equal(at(PROP, 3, 1), 'lists.note.prop');
  const imported: List = { kind: 'import', count: null, reason: 'list-not-literal' };
  assert.equal(at(imported, 3, 1), 'lists.note.import');
  assert.equal(noteText(null), null);
  // An item inside another list is named in its own list.
  assert.equal(noteText(itemTarget(rowAt(4, [1, 1]))), 'lists.note.item');
});

test('the note counts the items chosen together', () => {
  const picked: CopyRef[] = [
    { id: CARD, item: 0 },
    { id: CARD, item: 1 },
    { id: CARD, item: 2 },
  ];
  const state = stateWith(CARD, LITERAL, 3, null, { copies: picked });
  assert.equal(noteText(itemTarget(state), null, 3), 'lists.note.many');
  // One chosen item is named as itself, and a mismatch is said before any count.
  assert.equal(noteText(itemTarget(stateWith(CARD, LITERAL, 3, 1)), null, 1), 'lists.note.item');
  const mismatch = stateWith(CARD, LITERAL, 5, null, { copies: picked });
  assert.equal(noteText(itemTarget(mismatch), null, 3), 'lists.note.mismatch');
});

test('a key read from another field of the item is named, as a copy keeps it', () => {
  const keyed = (source: string) => keyFieldOf({ props: [{ name: 'key', kind: 'expr', source }] });
  assert.equal(keyed('plan.id'), 'id');
  assert.equal(keyed(' plan?.slug '), 'slug');
  // A literal `key` field is made unique by Duplicate; an index or a call is no field.
  assert.equal(keyed('plan.key'), null);
  assert.equal(keyed('index'), null);
  assert.equal(keyed('makeKey(plan)'), null);
  assert.equal(
    keyFieldOf({
      props: [{ name: 'key', kind: 'literal', value: { kind: 'string', value: 'a' } }],
    }),
    null,
  );
  assert.equal(keyFieldOf(null), null);
  const target = itemTarget(stateWith(CARD, LITERAL, 3, 1));
  assert.equal(noteText(target, 'id'), 'lists.note.item lists.note.keyField');
  assert.equal(noteText(itemTarget(stateWith(CARD, LITERAL, 3, null)), 'id'), 'lists.note.pick');
});

test('the menu says whether the list actions act on the item or on every item', () => {
  const f = fixture(LITERAL, 1);
  const items = menuItems(actionsFor(f.store.get()), 0, false, true);
  const label = (id: ActionId) => items.find((item) => item.action === id)?.label;
  assert.equal(label('move-up'), 'menu.list.move-up');
  assert.equal(label('delete'), 'menu.list.delete');
  assert.equal(label('copy'), 'menu.copy');
  const plain = menuItems(actionsFor(f.store.get()), 0, false);
  assert.equal(plain.find((item) => item.action === 'delete')?.label, 'menu.delete');
  // A part of an item: the same actions change the template.
  const part = menuItems(actionsFor(f.store.get()), 0, false, false, true);
  const partLabel = (id: ActionId) => part.find((item) => item.action === id)?.label;
  assert.equal(partLabel('delete'), 'menu.part.delete');
  assert.equal(partLabel('duplicate'), 'menu.part.duplicate');
  assert.equal(partLabel('move-down'), 'menu.part.move-down');
  assert.equal(partLabel('copy'), 'menu.copy');
});
