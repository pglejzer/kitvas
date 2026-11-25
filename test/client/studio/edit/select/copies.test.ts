// The copies of a selection (ADR 0065): what a click, a click with the add key and the rectangle
// choose, what the store keeps of it, and what the frame is told.

import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  type CopyRef,
  MAX_COPIES,
  MAX_SELECTED,
  parseEditStudio,
} from '../../../../../client/channel/edit-protocol.ts';
import {
  type Chosen,
  chosenCopy,
  copiesAfter,
  pickSelection,
  rectSelection,
  sameChosen,
  sameCopy,
  selectBody,
} from '../../../../../client/studio/edit/select/copies.ts';
import { createStore } from '../../../../../client/studio/edit/store.ts';

const CHANNEL = 'abcdefghijklmnop';
const CARD = 'sections/Pricing:section/Stack/Card';
const ROW = `${CARD}/ul/li`;
const TITLE = 'sections/Pricing:section/h2';
const NONE: Chosen = { selection: [], copies: [] };

/** A feature row: its place among all the rows of the page, and its plan and place in it. */
const row = (item: number, path: number[]): CopyRef => ({ id: ROW, item, path });

test('a click selects the copy it was on; the add key adds a copy and takes one out', () => {
  const one = pickSelection(NONE, { id: ROW, add: false, item: 3, path: [1, 0] });
  assert.deepEqual(one, { selection: [ROW], copies: [row(3, [1, 0])] });
  const two = pickSelection(one, { id: ROW, add: true, item: 4, path: [1, 1] });
  const three = pickSelection(two, { id: ROW, add: true, item: 5, path: [1, 2] });
  assert.deepEqual(three, {
    selection: [ROW],
    copies: [row(3, [1, 0]), row(4, [1, 1]), row(5, [1, 2])],
  });
  // On a chosen copy the add key takes that copy out, and the others stay.
  const back = pickSelection(three, { id: ROW, add: true, item: 4, path: [1, 1] });
  assert.deepEqual(back, { selection: [ROW], copies: [row(3, [1, 0]), row(5, [1, 2])] });
  // An id with no chosen copy left goes out of the selection.
  assert.deepEqual(pickSelection(one, { id: ROW, add: true, item: 3, path: [1, 0] }), NONE);
  // A plain click selects the one copy again.
  assert.deepEqual(pickSelection(three, { id: ROW, add: false, item: 0, path: [0, 0] }), {
    selection: [ROW],
    copies: [row(0, [0, 0])],
  });
});

test('the add key adds another element, on its copy or as itself', () => {
  const one = pickSelection(NONE, { id: ROW, add: false, item: 3, path: [1, 0] });
  const more = pickSelection(one, { id: TITLE, add: true });
  assert.deepEqual(more, { selection: [ROW, TITLE], copies: [row(3, [1, 0])] });
  // An element selected as itself leaves whole, and the copies of the others stay.
  assert.deepEqual(pickSelection(more, { id: TITLE, add: true }), one);
  const whole: Chosen = { selection: [ROW], copies: [] };
  assert.deepEqual(pickSelection(whole, { id: ROW, add: true, item: 2, path: [0, 2] }), NONE);
  // An element that shows one copy has no copy to name.
  assert.deepEqual(pickSelection(NONE, { id: TITLE, add: false }), {
    selection: [TITLE],
    copies: [],
  });
});

test('a click on nothing clears the selection, unless the add key is held', () => {
  const one = pickSelection(NONE, { id: ROW, add: false, item: 3, path: [1, 0] });
  assert.deepEqual(pickSelection(one, { id: null, add: false }), NONE);
  assert.equal(pickSelection(one, { id: null, add: true }), one);
});

test('a click never selects more than a select message carries', () => {
  const ids = Array.from({ length: MAX_SELECTED }, (_, index) => `${CARD}.${index + 2}`);
  const full: Chosen = { selection: ids, copies: [] };
  assert.equal(pickSelection(full, { id: TITLE, add: true }), full);
  const rows = Array.from({ length: MAX_COPIES }, (_, item) => row(item, [0, item]));
  const many: Chosen = { selection: [ROW], copies: rows };
  const next = { id: ROW, add: true, item: MAX_COPIES, path: [0, MAX_COPIES] };
  assert.equal(pickSelection(many, next), many);
});

test('two refs name one copy by its place among the copies, else by its path', () => {
  assert.equal(sameCopy(row(3, [1, 0]), row(3, [1, 0])), true);
  assert.equal(sameCopy(row(3, [1, 0]), row(4, [1, 1])), false);
  assert.equal(sameCopy(row(3, [1, 0]), { id: ROW, item: 3 }), true);
  assert.equal(sameCopy({ id: ROW, path: [1, 0] }, row(3, [1, 0])), true);
  assert.equal(sameCopy({ id: ROW, path: [1, 0] }, { id: ROW, path: [1, 1] }), false);
  // Nothing in common to compare by.
  assert.equal(sameCopy({ id: ROW, path: [1, 0] }, { id: ROW, item: 3 }), false);
  // A ref that names no copy is every copy of its element, and of no other.
  assert.equal(sameCopy({ id: ROW }, row(3, [1, 0])), true);
  assert.equal(sameCopy({ id: TITLE }, row(3, [1, 0])), false);
});

test('a rectangle selects the copies it took, in the order the frame gave', () => {
  const picks = [row(0, [0, 0]), row(1, [0, 1]), row(2, [0, 2])];
  assert.deepEqual(rectSelection(NONE, picks, false), { selection: [ROW], copies: picks });
  // What was selected before goes.
  const before: Chosen = { selection: [TITLE], copies: [] };
  assert.deepEqual(rectSelection(before, picks, false), { selection: [ROW], copies: picks });
  // A copy the frame names twice is there once.
  assert.deepEqual(rectSelection(NONE, [...picks, row(1, [0, 1])], false).copies, picks);
  // An element with one copy is selected as itself.
  const card: CopyRef = { id: CARD, item: 1, path: [1] };
  assert.deepEqual(rectSelection(NONE, [{ id: TITLE }, card], false), {
    selection: [TITLE, CARD],
    copies: [card],
  });
});

test('a rectangle that took nothing clears the selection, unless it adds', () => {
  const before: Chosen = { selection: [ROW], copies: [row(0, [0, 0])] };
  assert.deepEqual(rectSelection(before, [], false), NONE);
  assert.deepEqual(rectSelection(before, [], true), before);
});

test('with the add key the rectangle adds to the selection', () => {
  const before: Chosen = { selection: [TITLE, ROW], copies: [row(5, [1, 2])] };
  const card: CopyRef = { id: CARD, item: 0, path: [0] };
  const added = rectSelection(before, [row(0, [0, 0]), row(5, [1, 2]), card], true);
  assert.deepEqual(added, {
    selection: [TITLE, ROW, CARD],
    copies: [row(5, [1, 2]), row(0, [0, 0]), card],
  });
  // An element selected as itself stays so: it is every copy already.
  const whole: Chosen = { selection: [ROW], copies: [] };
  assert.deepEqual(rectSelection(whole, [row(0, [0, 0])], true), whole);
});

test('a rectangle never selects more than a select message carries', () => {
  const ids = Array.from({ length: MAX_SELECTED + 5 }, (_, index) => ({
    id: `${CARD}.${index + 2}`,
  }));
  assert.equal(rectSelection(NONE, ids, false).selection.length, MAX_SELECTED);
  const rows = Array.from({ length: MAX_COPIES + 5 }, (_, item) => row(item, [0, item]));
  assert.equal(rectSelection(NONE, rows, false).copies.length, MAX_COPIES);
});

test('two selections are the same when their elements and copies are', () => {
  const a: Chosen = { selection: [ROW], copies: [row(3, [1, 0])] };
  assert.equal(sameChosen(a, { selection: [ROW], copies: [row(3, [1, 0])] }), true);
  assert.equal(sameChosen(a, { selection: [ROW], copies: [row(3, [1, 1])] }), false);
  assert.equal(sameChosen(a, { selection: [ROW], copies: [{ id: ROW, item: 3 }] }), false);
  assert.equal(sameChosen(a, { selection: [ROW], copies: [] }), false);
  assert.equal(sameChosen(a, { selection: [ROW, TITLE], copies: [row(3, [1, 0])] }), false);
});

test('the one chosen copy is that of one selected element with one copy chosen', () => {
  assert.deepEqual(chosenCopy([ROW], [row(3, [1, 0])]), row(3, [1, 0]));
  assert.equal(chosenCopy([ROW], [row(3, [1, 0]), row(4, [1, 1])]), null);
  assert.equal(chosenCopy([ROW, TITLE], [row(3, [1, 0])]), null);
  assert.equal(chosenCopy([ROW], []), null);
  assert.equal(chosenCopy([], []), null);
});

test('the store keeps the copies of selected elements only, and works the item out', () => {
  const store = createStore('demo');
  store.set({ selection: [ROW], copies: [row(3, [1, 0]), { id: TITLE, item: 1 }, { id: ROW }] });
  assert.deepEqual(store.get().copies, [row(3, [1, 0])]);
  assert.equal(store.get().item, 3);
  // Two chosen copies, or two selected elements: no one item.
  store.set({ selection: [ROW], copies: [row(3, [1, 0]), row(4, [1, 1])] });
  assert.equal(store.get().item, null);
  store.set({ selection: [ROW, TITLE], copies: [row(3, [1, 0])] });
  assert.equal(store.get().item, null);
  assert.deepEqual(store.get().copies, [row(3, [1, 0])]);
});

test('a selection set alone is the elements themselves: no copies', () => {
  const store = createStore('demo');
  store.set({ selection: [ROW], copies: [row(3, [1, 0])] });
  store.set({ selection: [ROW] });
  assert.deepEqual(store.get().copies, []);
  assert.equal(store.get().item, null);
});

test('copies set again as they are stay the same array, so nothing hears a change', () => {
  const store = createStore('demo');
  store.set({ selection: [ROW], copies: [row(3, [1, 0])] });
  const before = store.get().copies;
  store.set({ selection: [ROW], copies: [row(3, [1, 0])] });
  assert.equal(store.get().copies, before);
  // A patch that names neither leaves both alone.
  store.set({ hovered: TITLE });
  assert.equal(store.get().copies, before);
  assert.equal(store.get().item, 3);
});

test('after an edit the copies follow their elements, and those of a gone element are dropped', () => {
  const other = `${CARD}.2/ul/li`;
  const copies = [row(3, [1, 0]), { id: TITLE, item: 1 }];
  const kept = copiesAfter(copies, { [ROW]: other }, (id) => id === TITLE);
  assert.deepEqual(kept, [{ id: other, item: 3, path: [1, 0] }]);
  // Nothing renamed, nothing gone: the same refs.
  const same = copiesAfter(copies, {}, () => false);
  assert.deepEqual(same, copies);
  assert.equal(same[0], copies[0]);
});

test('the select message names the place of each chosen copy the frame can find', () => {
  const chosen: Chosen = { selection: [ROW], copies: [row(3, [1, 0]), row(4, [1, 1])] };
  const body = selectBody(chosen);
  assert.deepEqual(body, {
    type: 'select',
    ids: [ROW],
    copies: [
      { id: ROW, item: 3 },
      { id: ROW, item: 4 },
    ],
  });
  // The frame's parser takes it as it is.
  assert.deepEqual(parseEditStudio({ ...body }, CHANNEL), {
    kitvas: 1,
    channel: CHANNEL,
    ...body,
  });
  // No copy named: every copy is outlined, and the message carries no `copies`.
  assert.deepEqual(selectBody({ selection: [ROW, TITLE], copies: [] }), {
    type: 'select',
    ids: [ROW, TITLE],
  });
  // A copy known by its path only cannot be found by the frame.
  assert.deepEqual(selectBody({ selection: [ROW], copies: [{ id: ROW, path: [1, 0] }] }), {
    type: 'select',
    ids: [ROW],
  });
});
