import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  ITEM_REACH,
  type ItemList,
  type ItemRow,
  indexAfter,
  itemSlot,
  listSlot,
  listsOf,
} from '../../../../client/frame/drag/item-slots.ts';
import type { Box } from '../../../../client/frame/drag/slots.ts';

const box = (left: number, top: number, width: number, height: number): Box => ({
  left,
  top,
  width,
  height,
});
const at = (x: number, y: number): { x: number; y: number } => ({ x, y });

/** Three cards side by side, 10 px apart, in a parent with 10 px of padding. */
const CARDS: ItemRow = {
  parent: box(0, 0, 340, 100),
  flow: { axis: 'row', reverse: false },
  copies: [box(10, 10, 100, 80), box(120, 10, 100, 80), box(230, 10, 100, 80)],
};

/** The same three one under another. */
const STACK: ItemRow = {
  parent: box(0, 0, 200, 300),
  flow: { axis: 'column', reverse: false },
  copies: [box(0, 0, 200, 90), box(0, 100, 200, 90), box(0, 200, 200, 90)],
};

test('the index after a drop counts the item as taken out first', () => {
  // Forward: everything between moves one place down.
  assert.equal(indexAfter(0, 2, 'after'), 2);
  assert.equal(indexAfter(0, 2, 'before'), 1);
  // Backward: the place named is the place it gets.
  assert.equal(indexAfter(2, 0, 'before'), 0);
  assert.equal(indexAfter(2, 0, 'after'), 1);
  // Right after the one before it and right before the one after it: where it stands.
  assert.equal(indexAfter(1, 0, 'after'), 1);
  assert.equal(indexAfter(1, 2, 'before'), 1);
});

test('the pointer over the far half of the last copy puts the item last', () => {
  assert.deepEqual(itemSlot(at(300, 50), CARDS, 0), {
    to: 2,
    anchor: 2,
    place: 'after',
    // A little outside the last copy, in the parent's padding.
    line: { x: 335, y: 10, length: 80, axis: 'y' },
  });
});

test('the pointer over the near half of a copy puts the item before it', () => {
  assert.deepEqual(itemSlot(at(250, 50), CARDS, 0), {
    to: 1,
    anchor: 2,
    place: 'before',
    // Half way between the two copies it goes between.
    line: { x: 225, y: 10, length: 80, axis: 'y' },
  });
  assert.equal(itemSlot(at(20, 50), CARDS, 2)?.to, 0);
  assert.equal(itemSlot(at(90, 50), CARDS, 2)?.to, 1);
});

test('the dragged copy is no place: beside its neighbours is where it already is', () => {
  // The first item before the second copy.
  const own = itemSlot(at(130, 50), CARDS, 0);
  assert.equal(own?.to, 0);
  assert.equal(own?.anchor, 1);
  // The second item after the first copy, or over its own box (the nearest other copy decides).
  assert.equal(itemSlot(at(90, 50), CARDS, 1)?.to, 1);
  assert.equal(itemSlot(at(160, 50), CARDS, 1)?.to, 1);
  // Never the dragged copy as the anchor.
  for (let x = 0; x <= 340; x += 10) {
    assert.notEqual(itemSlot(at(x, 50), CARDS, 1)?.anchor, 1, `x ${x}`);
  }
});

test('a column of copies takes the place by the pointer height', () => {
  assert.deepEqual(itemSlot(at(100, 250), STACK, 0), {
    to: 2,
    anchor: 2,
    place: 'after',
    line: { x: 0, y: 295, length: 200, axis: 'x' },
  });
  assert.equal(itemSlot(at(100, 120), STACK, 2)?.to, 1);
  assert.equal(itemSlot(at(100, 10), STACK, 2)?.to, 0);
});

test('in a reversed row the first item of the data is the last one along the row', () => {
  const reversed: ItemRow = {
    parent: CARDS.parent,
    flow: { axis: 'row', reverse: true },
    copies: [box(230, 10, 100, 80), box(120, 10, 100, 80), box(10, 10, 100, 80)],
  };
  // The far left is the end of the data.
  assert.equal(itemSlot(at(20, 50), reversed, 0)?.to, 2);
  assert.equal(itemSlot(at(20, 50), reversed, 0)?.place, 'after');
  assert.equal(itemSlot(at(310, 50), reversed, 2)?.to, 0);
});

test('no place far outside the copies, with one copy, or among hidden ones', () => {
  assert.equal(itemSlot(at(340 + ITEM_REACH + 1, 50), CARDS, 0), null);
  assert.equal(itemSlot(at(100, -ITEM_REACH - 1), CARDS, 0), null);
  // Just outside the parent the nearest copy still decides.
  assert.equal(itemSlot(at(360, 50), CARDS, 0)?.to, 2);
  const one: ItemRow = { ...CARDS, copies: [box(10, 10, 100, 80)] };
  assert.equal(itemSlot(at(50, 50), one, 0), null);
  // A hidden copy has no box to go beside, but keeps its place in the count.
  const gap: ItemRow = {
    ...CARDS,
    copies: [box(10, 10, 100, 80), box(0, 0, 0, 0), box(230, 10, 100, 80)],
  };
  assert.deepEqual(
    [itemSlot(at(240, 50), gap, 0)?.anchor, itemSlot(at(240, 50), gap, 0)?.to],
    [2, 1],
  );
});

// The lists of one item id.

test('an item from another list takes its place among the copies as they are', () => {
  assert.equal(indexAfter(null, 0, 'before'), 0);
  assert.equal(indexAfter(null, 2, 'after'), 3);
  // Every copy is a place to go beside: none of them is the dragged one.
  assert.equal(itemSlot(at(20, 50), CARDS, null)?.to, 0);
  assert.equal(itemSlot(at(160, 50), CARDS, null)?.anchor, 1);
  assert.equal(itemSlot(at(320, 50), CARDS, null)?.to, 3);
});

test('the copies that stand in one copy of the list around them are one list', () => {
  // The rows of three cards: the letter is the card a row stands in.
  const rows = ['a1', 'a2', 'a3', 'b1', 'c1', 'c2'];
  const card = (row: string): string | null => row[0] ?? null;
  assert.deepEqual(listsOf(rows, card), [
    { outer: 'a', copies: ['a1', 'a2', 'a3'] },
    { outer: 'b', copies: ['b1'] },
    { outer: 'c', copies: ['c1', 'c2'] },
  ]);
  // With no list around it, every copy of the id is in the one list.
  assert.deepEqual(listsOf(rows), [{ outer: null, copies: rows }]);
  assert.deepEqual(listsOf([]), []);
  // A copy that stands in no copy of the list around it is in no list.
  const stray = listsOf(['a1', 'x', 'a2'], (row) => (row === 'x' ? null : 'a'));
  assert.deepEqual(stray, [{ outer: 'a', copies: ['a1', 'a2'] }]);
});

const column = { axis: 'column', reverse: false } as const;
/** The rows of the first card: three, one under another. */
const PRO: ItemList = {
  parent: box(0, 0, 200, 150),
  flow: column,
  copies: [box(0, 0, 200, 40), box(0, 50, 200, 40), box(0, 100, 200, 40)],
  prefix: [0],
};
/** The rows of the second card, 100 px to the right: two. */
const STARTER: ItemList = {
  parent: box(300, 0, 200, 150),
  flow: column,
  copies: [box(300, 0, 200, 40), box(300, 50, 200, 40)],
  prefix: [1],
};
/** The first row of the first card is the dragged one. */
const OWN = { list: 0, index: 0 };

test('a slot in the item own list names its list and the path after the item is taken out', () => {
  assert.deepEqual(listSlot(at(100, 130), [PRO, STARTER], OWN), {
    // After the third row: with the first row taken out that is the second place.
    to: 2,
    anchor: 2,
    place: 'after',
    line: { x: 0, y: 145, length: 200, axis: 'x' },
    list: 0,
    path: [0, 2],
    box: PRO.parent,
  });
});

test('a slot in the same list of another parent names that list and the place as it is', () => {
  assert.deepEqual(listSlot(at(400, 10), [PRO, STARTER], OWN), {
    to: 0,
    anchor: 0,
    place: 'before',
    line: { x: 300, y: 0, length: 200, axis: 'x' },
    list: 1,
    path: [1, 0],
    box: STARTER.parent,
  });
  // After its last row: one more than it has.
  assert.deepEqual(listSlot(at(400, 80), [PRO, STARTER], OWN)?.path, [1, 2]);
  // A list with one row takes the item beside that row.
  const single: ItemList = { ...STARTER, copies: [box(300, 0, 200, 40)] };
  assert.deepEqual(listSlot(at(400, 30), [PRO, single], OWN)?.path, [1, 1]);
});

test('an item leaves its own list only past the reach outside it', () => {
  /** A list whose parent begins 10 px right of the first one. */
  const beside: ItemList = { ...STARTER, parent: box(210, 0, 200, 150) };
  // 15 px outside its own list and inside the other one: still its own.
  assert.equal(listSlot(at(215, 60), [PRO, beside], OWN)?.list, 0);
  assert.deepEqual(listSlot(at(215, 60), [PRO, beside], OWN)?.path, [0, 0]);
  // An item that comes from neither list has no list to stay in.
  assert.equal(listSlot(at(215, 60), [PRO, beside], null)?.list, 1);
  // 40 px outside: the other list takes over.
  assert.equal(listSlot(at(240, 60), [PRO, beside], OWN)?.list, 1);
  // The reach is in screen pixels: at a canvas zoom of 50 % it is twice as many frame pixels.
  assert.equal(listSlot(at(240, 60), [PRO, beside], OWN, ITEM_REACH * 2)?.list, 0);
});

test('no slot away from every list, or in a list whose only copy is the dragged one', () => {
  assert.equal(listSlot(at(700, 700), [PRO, STARTER], OWN), null);
  assert.equal(listSlot(at(250, 60), [], null), null);
  const alone: ItemList = { ...PRO, copies: [box(0, 0, 200, 40)] };
  assert.equal(listSlot(at(50, 10), [alone], OWN), null);
});
