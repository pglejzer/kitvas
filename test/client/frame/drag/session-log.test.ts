// What the drag session tells the gesture log (ADR 0066): every change of state, and why each
// gesture ended. The session's own rules are in `test/client/frame/drag.test.ts`.

import assert from 'node:assert/strict';
import { test } from 'node:test';
import type { GestureLog } from '../../../../client/frame/drag/gesture/gesture-log.ts';
import { createSession, type Press, type Session } from '../../../../client/frame/drag/session.ts';
import type { ListSlot } from '../../../../client/frame/drag/slots/item-slots.ts';
import type { Point, Slot } from '../../../../client/frame/drag/slots/slots.ts';

const at = (x: number, y: number): Point => ({ x, y });

const LINE: Slot = {
  anchor: 'A:main/Card.2',
  place: 'before',
  line: { x: 0, y: 40, length: 200, axis: 'x' },
  box: null,
};
const PLAN = 'A:main/Stack/Card';
/** Before the first copy: the dragged second item becomes the first. */
const FIRST: ListSlot = {
  to: 0,
  anchor: 0,
  place: 'before',
  line: { x: 4, y: 0, length: 120, axis: 'y' },
  list: 0,
  path: [0],
  box: { left: 0, top: 0, width: 400, height: 120 },
};

const MOVE: Press = { kind: 'move', ids: ['A:main/Card'], pick: null };
const RECT: Press = { kind: 'rect' };
const ITEM: Press = {
  kind: 'item',
  id: PLAN,
  item: 1,
  from: [1],
  pick: { id: PLAN, item: 1, path: [1] },
};

type Bench = {
  session: Session;
  /** What the log heard, in order: `step <state>`, `step <state> <why>`, `end <why> kept|lost`. */
  heard: string[];
  set: { slot: Slot | null; itemSlot: ListSlot | null; row: string[] };
};

function bench(): Bench {
  const heard: string[] = [];
  const set: Bench['set'] = { slot: null, itemSlot: null, row: [] };
  const log: GestureLog = {
    step: (state, why) => {
      heard.push(why === undefined ? `step ${state}` : `step ${state} ${why}`);
    },
    end: (why, kept) => {
      heard.push(`end ${why} ${kept ? 'kept' : 'lost'}`);
    },
    steps: () => [],
  };
  const session = createSession({
    channel: 'c1',
    post: () => undefined,
    scale: () => 1,
    slot: () => set.slot,
    itemSlot: () => ({ slot: set.itemSlot, lists: [] }),
    indicate: () => undefined,
    scroll: () => at(0, 0),
    outline: () => undefined,
    taken: () => ({ boxes: [], picks: () => [] }),
    family: () => ({ parent: 'A:main', row: set.row }),
    started: () => undefined,
    ended: () => undefined,
    preview: () => undefined,
    previewItem: () => undefined,
    log,
  });
  return { session, heard, set };
}

/** A press, a move past the threshold and a release there. */
function drag(b: Bench, press: Press): void {
  b.session.press(press, at(0, 0), false);
  b.session.move(at(0, 20));
  b.session.release(at(0, 20));
}

test('a drag that ends with its drop: pressed, drag, released and kept', () => {
  const b = bench();
  b.set.slot = LINE;
  drag(b, MOVE);
  assert.deepEqual(b.heard, ['step pressed', 'step drag', 'end released kept']);
});

test('a drop on no slot, and one where the element stands, end with nothing written', () => {
  const none = bench();
  drag(none, MOVE);
  assert.deepEqual(none.heard, ['step pressed', 'step drag', 'end no-slot lost']);
  const same = bench();
  same.set.slot = LINE;
  // The dragged card stands right before the slot's anchor.
  same.set.row = ['A:main/Card', 'A:main/Card.2'];
  drag(same, MOVE);
  assert.deepEqual(same.heard, ['step pressed', 'step drag', 'end same-place lost']);
});

test('a click is kept; a press let go far away with no move heard is not', () => {
  const click = bench();
  click.session.press(MOVE, at(10, 10), false);
  click.session.release(at(12, 11));
  assert.deepEqual(click.heard, ['step pressed', 'end released kept']);
  // No `pointermove` came between the press and the release, 70 px apart.
  const lost = bench();
  lost.session.press(MOVE, at(10, 10), false);
  lost.session.release(at(10, 80));
  assert.deepEqual(lost.heard, ['step pressed', 'end no-move lost']);
});

test('a cancel says why, for a press as for a drag; with nothing running it says nothing', () => {
  const b = bench();
  b.session.cancel('escape');
  assert.deepEqual(b.heard, []);
  b.session.press(MOVE, at(0, 0), false);
  b.session.cancel('blur');
  b.session.press(MOVE, at(0, 0), false);
  b.session.move(at(0, 20));
  b.session.cancel('capture-lost');
  b.session.cancel('capture-lost');
  // Without a reason it was the browser that cancelled the pointer.
  b.session.press(RECT, at(0, 0), false);
  b.session.move(at(0, 20));
  b.session.cancel();
  assert.deepEqual(b.heard, [
    'step pressed',
    'end blur lost',
    'step pressed',
    'step drag',
    'end capture-lost lost',
    'step pressed',
    'step rect',
    'end cancelled lost',
  ]);
});

test('a press or a forwarded drag over a gesture that never ended ends it as new-press', () => {
  const b = bench();
  b.session.press(MOVE, at(0, 0), false);
  b.session.move(at(0, 20));
  b.session.press(MOVE, at(5, 5), false);
  b.session.begin({ kind: 'insert', label: 'Card' }, at(1, 1));
  assert.deepEqual(b.heard, [
    'step pressed',
    'step drag',
    'end new-press lost',
    'step pressed',
    'end new-press lost',
    'step drag',
  ]);
});

test('a note is a step in the state the gesture is in, and the gesture goes on', () => {
  const b = bench();
  // With nothing running there is nothing to note.
  b.session.note('swapped');
  b.session.press(MOVE, at(0, 0), false);
  b.session.note('swapped');
  b.set.slot = LINE;
  b.session.move(at(0, 20));
  b.session.note('swapped');
  assert.equal(b.session.active(), true);
  b.session.release(at(0, 20));
  assert.deepEqual(b.heard, [
    'step pressed',
    'step pressed swapped',
    'step drag',
    'step drag swapped',
    'end released kept',
  ]);
});

test('a list item: kept with its reorder, not kept on its own place or on none', () => {
  const b = bench();
  b.set.itemSlot = FIRST;
  drag(b, ITEM);
  b.set.itemSlot = { ...FIRST, to: 1, anchor: 2, path: [1] };
  drag(b, ITEM);
  b.set.itemSlot = null;
  drag(b, ITEM);
  assert.deepEqual(b.heard, [
    'step pressed',
    'step item',
    'end released kept',
    'step pressed',
    'step item',
    'end same-place lost',
    'step pressed',
    'step item',
    'end no-slot lost',
  ]);
});

test('a rectangle that is let go is kept, whatever it took', () => {
  const b = bench();
  drag(b, RECT);
  assert.deepEqual(b.heard, ['step pressed', 'step rect', 'end released kept']);
});
