// Data list items on the draft page (plan 16, task D): which copy is picked, what the list
// actions send and when they are off, the inline text edit's `before`, the note, and the routing
// of Move, Duplicate and Delete through the actions, the keys and the menu.

import assert from 'node:assert/strict';
import { test } from 'node:test';
import type { TreeNode } from '../../../../../client/channel/edit-protocol.ts';
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
  itemTarget,
  listOps,
  listReason,
  noteText,
  pickedItem,
  selectBody,
  textTarget,
} from '../../../../../client/studio/edit/structure/lists.ts';
import { menuItems } from '../../../../../client/studio/edit/structure/menu.ts';
import { STYLE_PROPERTIES } from '../../../../../src/edit/index.ts';
import type { EditOutcome, Inspect } from '../../../../../src/studio/api/edit/edit-schemas.ts';
import type { StructureEntry } from '../../../../../src/studio/api/edit/structure-schemas.ts';

const FILE = 'src/tsx/sections/Pricing.tsx';
const CARD = 'sections/Pricing:section/Stack/Card';
const HEADING = `${CARD}/Heading`;
const HASH = '0123456789abcdef';
const ETAG = `"${'a'.repeat(27)}"`;

type List = NonNullable<Inspect['list']>;

const LITERAL: List = { kind: 'literal', count: 3, reason: null };
const PROP: List = { kind: 'prop', count: null, reason: 'list-not-literal' };
/** The inspect's list once it carries the item texts (not yet in the schema's type). */
const WITH_TEXTS = { ...LITERAL, texts: ['Free', 'Pro', null] };

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

/** The selection is `id`, inspected with `list`, rendered `copies` times; `item` is picked. */
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
    inspected: inspectOf(id, list),
    tree: [node(id, copies)],
    item,
    ...more,
  });
  return store.get();
}

test('the selection is a list item with the picked copy, the count and no mismatch', () => {
  const target = itemTarget(stateWith(CARD, LITERAL, 3, 1));
  assert.deepEqual(target, { id: CARD, list: LITERAL, item: 1, count: 3, mismatch: false });
  assert.equal(itemTarget(stateWith(CARD, LITERAL, 3, null))?.item, null);
  // One copy needs no pick.
  const one: List = { kind: 'literal', count: 1, reason: null };
  assert.equal(itemTarget(stateWith(CARD, one, 1, null))?.item, 0);
  // A copy past the end is no pick, and more copies than items is a mismatch.
  assert.equal(itemTarget(stateWith(CARD, LITERAL, 3, 4))?.item, null);
  assert.equal(itemTarget(stateWith(CARD, LITERAL, 6, 1))?.mismatch, true);
  // A read-only list counts the copies the frame renders.
  assert.equal(itemTarget(stateWith(CARD, PROP, 4, 2))?.count, 4);
});

test('no list item: no list, another element inspected, or several selected', () => {
  assert.equal(itemTarget(stateWith(CARD, null, 3, 1)), null);
  assert.equal(itemTarget(stateWith(CARD, LITERAL, 3, 1, { inspected: null })), null);
  const other = stateWith(CARD, LITERAL, 3, 1, { inspected: inspectOf(HEADING, LITERAL) });
  assert.equal(itemTarget(other), null);
  assert.equal(itemTarget(stateWith(CARD, LITERAL, 3, 1, { selection: [CARD, HEADING] })), null);
});

test('a plain pick of the selected element names its copy; shift and other ids do not', () => {
  assert.equal(pickedItem([CARD], { id: CARD, add: false, item: 2 }), 2);
  assert.equal(pickedItem([CARD], { id: CARD, add: false }), null);
  assert.equal(pickedItem([CARD], { id: CARD, add: true, item: 2 }), null);
  assert.equal(pickedItem([HEADING], { id: CARD, add: false, item: 2 }), null);
  assert.equal(pickedItem([CARD, HEADING], { id: CARD, add: false, item: 2 }), null);
  assert.equal(pickedItem([], { id: null, add: false }), null);
});

test('the select message carries the picked copy for one element only', () => {
  assert.deepEqual(selectBody(stateWith(CARD, LITERAL, 3, 1)), {
    type: 'select',
    ids: [CARD],
    item: 1,
  });
  assert.deepEqual(selectBody(stateWith(CARD, LITERAL, 3, null)), { type: 'select', ids: [CARD] });
  const two = stateWith(CARD, LITERAL, 3, 1, { selection: [CARD, HEADING] });
  assert.deepEqual(selectBody(two), { type: 'select', ids: [CARD, HEADING] });
});

test('the list actions are off at the edges, without a pick and on a mismatch', () => {
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

test('the list ops name the item, and the moved or new item is picked after them', () => {
  const target = itemTarget(stateWith(CARD, LITERAL, 3, 1));
  assert.ok(target !== null);
  const of = (action: ActionId) => listOps(target, action);
  assert.deepEqual(of('move-up'), {
    ops: [{ op: 'moveItem', id: CARD, item: 1, to: 0 }],
    item: 0,
  });
  assert.deepEqual(of('move-down'), {
    ops: [{ op: 'moveItem', id: CARD, item: 1, to: 2 }],
    item: 2,
  });
  assert.deepEqual(of('duplicate'), {
    ops: [{ op: 'duplicateItem', id: CARD, item: 1 }],
    item: 2,
  });
  assert.deepEqual(of('delete'), { ops: [{ op: 'removeItem', id: CARD, item: 1 }], item: null });
  assert.equal(of('copy'), null);
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
    inspected: inspectOf(CARD, list),
    tree: [node(CARD, 3)],
    item,
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
  // The moved item stays picked, so a second Move down is at the edge.
  assert.equal(f.store.get().item, 2);
  assert.equal(stateOf(f, 'move-down')?.reason, 'at-edge');
  const copy = fixture(LITERAL, 1);
  await runAction(copy.ctx, 'duplicate');
  assert.deepEqual(copy.gestures[0]?.ops, [{ op: 'duplicateItem', id: CARD, item: 1 }]);
  assert.equal(copy.store.get().item, 2);
  const gone = fixture(LITERAL, 1);
  await runAction(gone.ctx, 'delete');
  assert.deepEqual(gone.gestures[0]?.ops, [{ op: 'removeItem', id: CARD, item: 1 }]);
  assert.equal(gone.store.get().item, null);
});

test('without a picked copy the list actions are off; the element rules keep the rest', () => {
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
});

test('the menu says the list actions act on the item', () => {
  const f = fixture(LITERAL, 1);
  const items = menuItems(actionsFor(f.store.get()), 0, false, true);
  const label = (id: ActionId) => items.find((item) => item.action === id)?.label;
  assert.equal(label('move-up'), 'menu.list.move-up');
  assert.equal(label('delete'), 'menu.list.delete');
  assert.equal(label('copy'), 'menu.copy');
  const plain = menuItems(actionsFor(f.store.get()), 0, false);
  assert.equal(plain.find((item) => item.action === 'delete')?.label, 'menu.delete');
});
