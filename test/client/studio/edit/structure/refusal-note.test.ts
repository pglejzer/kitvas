// The note over the canvas (ADR 0065): which refused edit is said there, and the words' key. The
// note itself is drawn on a page; in Node there is none, and showing it does nothing.

import assert from 'node:assert/strict';
import { test } from 'node:test';
import type { Gesture, Refused } from '../../../../../client/studio/edit/store.ts';
import {
  hideNote,
  NOTE_MS,
  reasonKey,
  saidOverCanvas,
  sayDone,
  sayReason,
  showNote,
} from '../../../../../client/studio/edit/structure/refusal-note.ts';
import { remapGesture } from '../../../../../client/studio/edit/sync/remap.ts';
import type { EditOp, Refusal } from '../../../../../src/edit/index.ts';

const CARD = 'sections/Pricing:section/Stack/Card';
const ROW = `${CARD}/ul/li`;

const refusedOf = (ops: EditOp[], reason: Refusal = 'in-expression', index = 0): Refused => ({
  gesture: { ops, label: 'A change' },
  index,
  reason,
});

const REMOVE: EditOp = { op: 'removeElement', id: CARD };
const MOVE_ITEM: EditOp = {
  op: 'moveItem',
  id: ROW,
  item: 0,
  to: 1,
  path: [2, 0],
  toPath: [0, 1],
};
const INSERT: EditOp = {
  op: 'insertElement',
  anchor: CARD,
  place: 'after',
  source: '<Text>Hi</Text>',
};
const SET_STYLE: EditOp = {
  op: 'setStyle',
  id: CARD,
  className: 'card',
  property: 'padding',
  value: { raw: '12px' },
  before: null,
  newRule: true,
};

test('a refused key, menu action, drop or reordered item is said over the canvas', () => {
  assert.equal(saidOverCanvas(refusedOf([REMOVE]), null), true);
  assert.equal(saidOverCanvas(refusedOf([MOVE_ITEM], 'not-list-item'), null), true);
  assert.equal(saidOverCanvas(refusedOf([INSERT], 'not-accepted'), null), true);
  // The second op of a gesture was the one refused.
  assert.equal(saidOverCanvas(refusedOf([REMOVE, MOVE_ITEM], 'list-item-gone', 1), null), true);
});

test('a refusal the properties panel shows at its own row is not said twice', () => {
  const prop: EditOp = {
    op: 'setProp',
    id: CARD,
    name: 'tone',
    value: { kind: 'string', value: 'accent' },
    before: null,
    after: null,
  };
  const text: EditOp = { op: 'setText', id: CARD, value: 'Pro', before: 'Free' };
  const addClass: EditOp = { op: 'addClass', id: CARD, className: 'card' };
  assert.equal(saidOverCanvas(refusedOf([prop], 'computed'), null), false);
  assert.equal(saidOverCanvas(refusedOf([text], 'no-text'), null), false);
  assert.equal(saidOverCanvas(refusedOf([SET_STYLE], 'nested'), null), false);
  // The class a style edit adds first belongs to that style's row.
  assert.equal(saidOverCanvas(refusedOf([addClass, SET_STYLE], 'no-classname'), null), false);
});

test('the same refusal with its ids renamed after another change is no new one', () => {
  const before = refusedOf([REMOVE]);
  const renamed: Gesture = remapGesture(before.gesture, { [CARD]: `${CARD}.2` });
  assert.notEqual(renamed, before.gesture);
  assert.equal(saidOverCanvas({ ...before, gesture: renamed }, before), false);
  // Another reason, another op of the gesture, or another gesture is one.
  assert.equal(saidOverCanvas({ ...before, reason: 'not-found' }, before), true);
  assert.equal(saidOverCanvas({ ...before, index: 1 }, before), true);
  assert.equal(saidOverCanvas(refusedOf([REMOVE]), before), true);
});

test('the words of a reason are those of the menu, and a refusal stays five seconds', () => {
  assert.equal(reasonKey('in-expression'), 'menu.reason.in-expression');
  assert.equal(reasonKey('pick-item'), 'menu.reason.pick-item');
  assert.equal(reasonKey('not-list-item'), 'menu.reason.not-list-item');
  assert.equal(NOTE_MS, 5000);
});

test('without a page there is no note to show, and nothing breaks', () => {
  assert.doesNotThrow(() => sayReason(undefined, 'at-edge'));
  assert.doesNotThrow(() => sayDone(undefined, 'Deleted from all 3 items of the list.'));
  assert.doesNotThrow(() => showNote(undefined, 'lost', 'The element is gone.', null));
  assert.doesNotThrow(() => hideNote(undefined, 'lost'));
});
