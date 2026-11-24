import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  ITEM_REACH,
  type ItemRow,
  indexAfter,
  itemSlot,
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
