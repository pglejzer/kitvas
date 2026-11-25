// The action bar's words (redesign spec, goal 12; plan 19, task 4): the element's name, or how many
// are selected; Duplicate and Lock or Unlock as the context menu has them, off with its reason;
// one tab stop whose arrows go round. Outside a page every text shows as its key.

import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  barModel,
  roveIndex,
  selectionName,
  titleOf,
} from '../../../../../client/studio/edit/seltools/action-bar.ts';
import { createStore, type EditorState } from '../../../../../client/studio/edit/store.ts';
import type { StructureEntry } from '../../../../../src/studio/api/edit/structure-schemas.ts';

const ROOT = 'sections/Hero:section';
const BUTTON = `${ROOT}/Button`;
const TEXT = `${ROOT}/Text`;

function entry(id: string, own: Partial<StructureEntry> = {}): StructureEntry {
  return {
    id,
    file: 'src/tsx/sections/Hero.tsx',
    line: 4,
    column: 3,
    tag: id.slice(id.lastIndexOf('/') + 1),
    parent: ROOT,
    hash: '0000000000000001',
    text: null,
    props: [],
    component: null,
    movable: null,
    accepts: true,
    mixed: false,
    interactive: false,
    root: null,
    ...own,
  };
}

function state(selection: string[], more: Partial<EditorState> = {}): EditorState {
  const store = createStore('shop');
  store.set({
    on: true,
    selection,
    tree: [
      { id: BUTTON, parent: ROOT, name: 'Start free trial', count: 1 },
      { id: TEXT, parent: ROOT, name: 'Plans for every team', count: 1 },
    ],
    structure: {
      version: 2,
      folder: '/d/shop/v2',
      etags: {},
      elements: [
        entry(ROOT, { parent: null, root: 'section', movable: 'section-root' }),
        entry(BUTTON, { component: 'Button' }),
        entry(TEXT),
      ],
      sections: [],
    },
    ...more,
  });
  return store.get();
}

test("a kit component is named by the component, a plain element by its layer's name", () => {
  assert.deepEqual(selectionName(state([BUTTON])), { name: 'Button', component: true, count: 1 });
  assert.deepEqual(selectionName(state([TEXT])), {
    name: 'Plans for every team',
    component: false,
    count: 1,
  });
});

test('several selected elements are counted', () => {
  const named = selectionName(state([BUTTON, TEXT]));
  assert.equal(named.count, 2);
  assert.equal(named.component, false);
  assert.equal(named.name, 'seltools.many');
});

test("Duplicate and Lock are the menu's, with the key of the list of shortcuts", () => {
  const model = barModel(state([BUTTON]), false);
  assert.equal(model.duplicate.enabled, true);
  assert.equal(model.duplicate.label, 'menu.duplicate');
  assert.equal(model.duplicate.hint, 'Ctrl+D');
  assert.equal(model.lock.id, 'lock');
  assert.equal(model.lock.enabled, true);
});

test('a locked element offers Unlock', () => {
  const model = barModel(state([BUTTON], { locked: [BUTTON] }), true);
  assert.equal(model.lock.id, 'unlock');
  assert.equal(model.lock.label, 'menu.unlock');
  assert.equal(model.duplicate.hint, 'Cmd+D');
});

test('an action that is off says why, in the words of the menu', () => {
  const model = barModel(state([ROOT]), false);
  assert.equal(model.duplicate.enabled, false);
  assert.equal(model.duplicate.reason, 'menu.reason.section-root');
});

test('a title carries the key when there is one', () => {
  assert.equal(titleOf('Duplicate', null), 'Duplicate');
  assert.equal(titleOf('Duplicate', 'Ctrl+D'), 'seltools.withKey');
});

test('the toolbar arrows go round; Home and End go to the ends; other keys are not its own', () => {
  assert.equal(roveIndex(4, 3, 'ArrowRight'), 0);
  assert.equal(roveIndex(4, 0, 'ArrowLeft'), 3);
  assert.equal(roveIndex(4, 1, 'ArrowRight'), 2);
  assert.equal(roveIndex(4, 2, 'Home'), 0);
  assert.equal(roveIndex(4, 0, 'End'), 3);
  assert.equal(roveIndex(4, 0, 'ArrowUp'), null);
  assert.equal(roveIndex(0, 0, 'ArrowRight'), null);
});
