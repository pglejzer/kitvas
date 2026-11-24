// The canvas drop of a file (spec 4c, goal 10): which card the pointer is over, and when a file
// has left the window.

import assert from 'node:assert/strict';
import { test } from 'node:test';
import { MAX_LABEL } from '../../../../../client/channel/structure-protocol.ts';
import {
  ANSWER_MS,
  FILE_LABEL,
  leftWindow,
  rectAt,
} from '../../../../../client/studio/edit/insert/file-drop.ts';
import { storedNote } from '../../../../../client/studio/edit/insert/images.ts';

const CARDS = [
  { left: 0, top: 0, right: 390, bottom: 800 },
  { left: 450, top: 0, right: 1218, bottom: 800 },
];

test('the drag goes to the card the pointer is over', () => {
  assert.equal(rectAt(CARDS, { x: 10, y: 10 }), 0);
  assert.equal(rectAt(CARDS, { x: 500, y: 799 }), 1);
  // Between the cards, and below them, no card has it.
  assert.equal(rectAt(CARDS, { x: 420, y: 100 }), -1);
  assert.equal(rectAt(CARDS, { x: 100, y: 800 }), -1);
  assert.equal(rectAt([], { x: 1, y: 1 }), -1);
});

test('a card owns its left and top edge and not its right and bottom edge', () => {
  assert.equal(rectAt(CARDS, { x: 0, y: 0 }), 0);
  assert.equal(rectAt(CARDS, { x: 390, y: 0 }), -1);
  assert.equal(rectAt(CARDS, { x: 450, y: 0 }), 1);
});

test('a file dragged out of the window is told by the pointer at its edge', () => {
  const size = { width: 1440, height: 900 };
  assert.equal(leftWindow({ x: 0, y: 300 }, size), true);
  assert.equal(leftWindow({ x: 300, y: 0 }, size), true);
  assert.equal(leftWindow({ x: 1440, y: 300 }, size), true);
  assert.equal(leftWindow({ x: 300, y: 900 }, size), true);
  assert.equal(leftWindow({ x: 300, y: 300 }, size), false);
});

test('a file drag has a label the frame can carry back, and a short wait for the answer', () => {
  assert.ok(FILE_LABEL.length > 0 && FILE_LABEL.length <= MAX_LABEL);
  assert.ok(ANSWER_MS >= 100 && ANSWER_MS <= 2000);
});

test('stored files are said by name, or by count', () => {
  // Outside a page every text shows as its key; the note still names what it was given.
  assert.equal(storedNote(['hero.png']), 'upload.stored');
  assert.equal(storedNote(['a.png', 'b.png']), 'upload.storedMany');
  assert.equal(storedNote([]), 'upload.storedMany');
});
