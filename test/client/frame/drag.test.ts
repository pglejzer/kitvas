import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  type DragSource,
  parseStructureFrame,
  type StructureFrameMessage,
} from '../../../client/channel/structure-protocol.ts';
import {
  createSession,
  type Family,
  type Press,
  type PressInput,
  passed,
  pressOf,
  type Session,
  samePlace,
  THRESHOLD,
} from '../../../client/frame/drag/session.ts';
import type { Box, Point, Slot } from '../../../client/frame/drag/slots.ts';
import { contains, outermost, type RectItem, rectOf } from '../../../client/frame/page/rect.ts';

const at = (x: number, y: number): Point => ({ x, y });
const box = (left: number, top: number, width: number, height: number): Box => ({
  left,
  top,
  width,
  height,
});

const LINE: Slot = {
  anchor: 'A:main/Card.2',
  place: 'before',
  line: { x: 0, y: 40, length: 200, axis: 'x' },
  box: null,
};
const INSIDE: Slot = { anchor: 'A:main/Stack', place: 'last', line: null, box: box(0, 0, 10, 10) };

type Bench = {
  session: Session;
  posted: StructureFrameMessage[];
  /** What happened around the session, in order. */
  log: string[];
  shown: (Slot | null)[];
  outlines: (Box | null)[];
  previews: { source: DragSource; slot: Slot }[];
  asked: { point: Point; source: DragSource }[];
  set: { slot: Slot | null; scroll: Point; taken: string[]; family: Family };
};

/** The children of `A:main`, in order. */
const ROW = ['A:main/h1', 'A:main/Card', 'A:main/Card.2', 'A:main/Card.3'];

function bench(): Bench {
  const posted: StructureFrameMessage[] = [];
  const log: string[] = [];
  const shown: (Slot | null)[] = [];
  const outlines: (Box | null)[] = [];
  const previews: Bench['previews'] = [];
  const asked: Bench['asked'] = [];
  const set: Bench['set'] = {
    slot: null,
    scroll: at(0, 0),
    taken: [],
    // Nowhere yet: no slot is the dragged element's own place unless a test says where it is.
    family: { parent: null, row: [] },
  };
  const session = createSession({
    channel: 'c1',
    post: (message) => {
      posted.push(message);
      log.push(`post:${message.type}`);
    },
    slot: (point, source) => {
      asked.push({ point, source });
      return set.slot;
    },
    indicate: (slot) => {
      shown.push(slot);
    },
    scroll: () => set.scroll,
    outline: (rect) => {
      outlines.push(rect);
    },
    taken: () => set.taken,
    family: () => set.family,
    started: (source) => {
      log.push(source ? `started:${source.kind}` : 'started:rect');
    },
    ended: () => {
      log.push('ended');
    },
    preview: (source, slot) => {
      previews.push({ source, slot });
      log.push('preview');
    },
  });
  return { session, posted, log, shown, outlines, previews, asked, set };
}

const MOVE: Press = { kind: 'move', ids: ['A:main/Card'] };
const RECT: Press = { kind: 'rect' };

const press = (over: Partial<PressInput>): PressInput => ({
  path: [],
  selection: [],
  movable: () => true,
  siblings: () => [],
  ...over,
});

// The threshold.

test('a press becomes a drag only more than 4 px away, in any direction', () => {
  assert.equal(THRESHOLD, 4);
  assert.equal(passed(at(10, 10), at(14, 10)), false);
  assert.equal(passed(at(10, 10), at(10, 6)), false);
  assert.equal(passed(at(10, 10), at(14.5, 10)), true);
  // 3 and 3 are 4.24 px apart.
  assert.equal(passed(at(10, 10), at(13, 13)), true);
  assert.equal(passed(at(10, 10), at(12, 12)), false);
});

test('a press that stays within the threshold is a click: nothing is sent', () => {
  const b = bench();
  b.set.slot = LINE;
  b.session.press(MOVE, at(100, 100), false);
  b.session.move(at(103, 101));
  assert.equal(b.session.active(), false);
  b.session.release(at(103, 101));
  assert.deepEqual(b.log, []);
  assert.deepEqual(b.shown, []);
  assert.deepEqual(b.posted, []);
});

test('past the threshold a press on a selected element drags it and shows the slot', () => {
  const b = bench();
  b.set.slot = LINE;
  b.session.press(MOVE, at(100, 100), false);
  b.session.move(at(100, 105));
  assert.equal(b.session.active(), true);
  assert.deepEqual(b.log, ['started:move']);
  assert.deepEqual(b.shown, [LINE]);
  assert.deepEqual(b.asked, [
    { point: at(100, 105), source: { kind: 'move', ids: ['A:main/Card'] } },
  ]);
});

// The drop.

test('a drop on a slot posts `drop` with the slot, then previews it', () => {
  const b = bench();
  b.set.slot = LINE;
  b.session.press(MOVE, at(100, 100), false);
  b.session.move(at(100, 120));
  b.session.release(at(100, 130));
  const source = { kind: 'move', ids: ['A:main/Card'] };
  assert.deepEqual(b.posted, [
    { kitvas: 1, channel: 'c1', type: 'drop', source, anchor: 'A:main/Card.2', place: 'before' },
  ]);
  assert.deepEqual(b.previews, [{ source, slot: LINE }]);
  // The indicator leaves, and the write is on its way before the page is touched.
  assert.equal(b.shown.at(-1), null);
  assert.deepEqual(b.log, ['started:move', 'ended', 'post:drop', 'preview']);
  assert.equal(b.session.active(), false);
  // The slot is the one under the point of the release.
  assert.deepEqual(b.asked.at(-1)?.point, at(100, 130));
});

test('a drop on no slot posts nothing and moves nothing', () => {
  const b = bench();
  b.session.press(MOVE, at(100, 100), false);
  b.session.move(at(100, 120));
  b.session.release(at(100, 130));
  assert.deepEqual(b.posted, []);
  assert.deepEqual(b.previews, []);
  assert.deepEqual(b.log, ['started:move', 'ended']);
  assert.equal(b.session.active(), false);
});

test('a slot next to the dragged element itself is no slot', () => {
  const b = bench();
  b.set.slot = { ...LINE, anchor: 'A:main/Card' };
  b.session.press(MOVE, at(100, 100), false);
  b.session.move(at(100, 120));
  assert.deepEqual(b.shown, [null]);
  b.session.release(at(100, 120));
  assert.deepEqual(b.posted, []);
});

test('before its next sibling and after its previous one is where an element already is', () => {
  const family: Family = { parent: 'A:main', row: ROW };
  const card = ['A:main/Card'];
  assert.equal(samePlace(card, { anchor: 'A:main/Card.2', place: 'before' }, family), true);
  assert.equal(samePlace(card, { anchor: 'A:main/h1', place: 'after' }, family), true);
  assert.equal(samePlace(card, { anchor: 'A:main/Card.3', place: 'before' }, family), false);
  assert.equal(samePlace(card, { anchor: 'A:main/Card.2', place: 'after' }, family), false);
  assert.equal(samePlace(card, { anchor: 'A:main/h1', place: 'before' }, family), false);
  // First and last in its own parent only while it is that.
  assert.equal(samePlace(['A:main/h1'], { anchor: 'A:main', place: 'first' }, family), true);
  assert.equal(samePlace(['A:main/Card.3'], { anchor: 'A:main', place: 'last' }, family), true);
  assert.equal(samePlace(card, { anchor: 'A:main', place: 'first' }, family), false);
  assert.equal(samePlace(card, { anchor: 'A:main', place: 'last' }, family), false);
  assert.equal(samePlace(['A:main/h1'], { anchor: 'B:footer', place: 'first' }, family), false);
  // A run of siblings stands between the one before its first and the one after its last.
  const run = ['A:main/Card', 'A:main/Card.2'];
  assert.equal(samePlace(run, { anchor: 'A:main/Card.3', place: 'before' }, family), true);
  assert.equal(samePlace(run, { anchor: 'A:main/h1', place: 'after' }, family), true);
  assert.equal(samePlace(run, { anchor: 'A:main/h1', place: 'before' }, family), false);
  // Elements that are no run of neighbours have no one place.
  const apart = ['A:main/Card', 'A:main/Card.3'];
  assert.equal(samePlace(apart, { anchor: 'A:main/h1', place: 'after' }, family), false);
  assert.equal(samePlace(['B:x'], { anchor: 'A:main/h1', place: 'after' }, family), false);
});

test('a drop where the element already stands posts nothing and moves nothing', () => {
  const b = bench();
  // `A:main/Card` stands right before `A:main/Card.2`.
  b.set.slot = LINE;
  b.set.family = { parent: 'A:main', row: ROW };
  b.session.press(MOVE, at(100, 100), false);
  b.session.move(at(100, 120));
  // The indicator still shows the slot while the pointer is over it.
  assert.deepEqual(b.shown, [LINE]);
  b.session.release(at(100, 120));
  assert.deepEqual(b.posted, []);
  assert.deepEqual(b.previews, []);
  assert.deepEqual(b.log, ['started:move', 'ended']);
});

test('one source object is used for every slot of a drag', () => {
  const b = bench();
  b.session.press(MOVE, at(0, 0), false);
  b.session.move(at(0, 10));
  b.session.move(at(0, 20));
  b.session.release(at(0, 30));
  assert.equal(b.asked.length, 3);
  assert.ok(b.asked.every((ask) => ask.source === b.asked[0]?.source));
});

test('every posted drop is a message the studio accepts', () => {
  const b = bench();
  b.set.slot = INSIDE;
  b.session.press({ kind: 'move', ids: ['A:main/Card', 'A:main/Card.2'] }, at(0, 0), false);
  b.session.move(at(0, 9));
  b.session.release(at(0, 9));
  b.session.begin({ kind: 'insert', label: 'Button' }, at(0, 0));
  b.session.release(at(5, 5));
  assert.equal(b.posted.length, 2);
  for (const message of b.posted) assert.deepEqual(parseStructureFrame(message, 'c1'), message);
});

// Esc.

test('Esc during a drag removes the indicator and the release that follows sends nothing', () => {
  const b = bench();
  b.set.slot = LINE;
  b.session.press(MOVE, at(100, 100), false);
  b.session.move(at(100, 120));
  b.session.cancel();
  assert.equal(b.session.active(), false);
  assert.equal(b.shown.at(-1), null);
  assert.deepEqual(b.log, ['started:move', 'ended']);
  // The pointer is still down: it moves on and lets go over a slot.
  b.session.move(at(100, 140));
  b.session.release(at(100, 140));
  assert.deepEqual(b.posted, []);
  assert.deepEqual(b.previews, []);
  assert.deepEqual(b.log, ['started:move', 'ended']);
});

test('Esc during a rectangle removes it and selects nothing', () => {
  const b = bench();
  b.set.taken = ['A:main/Card'];
  b.session.press(RECT, at(10, 10), false);
  b.session.move(at(60, 60));
  b.session.cancel();
  assert.equal(b.outlines.at(-1), null);
  b.session.release(at(60, 60));
  assert.deepEqual(b.posted, []);
});

test('Esc before the threshold forgets the press', () => {
  const b = bench();
  b.session.press(MOVE, at(10, 10), false);
  b.session.cancel();
  b.session.move(at(60, 60));
  assert.equal(b.session.active(), false);
  assert.deepEqual(b.log, []);
});

// Siblings and a mixed selection.

test('a press outside the selection draws a rectangle', () => {
  assert.deepEqual(pressOf(press({ path: ['A:main/h1', 'A:main'], selection: ['A:main/p'] })), {
    kind: 'rect',
  });
  assert.deepEqual(pressOf(press({ path: [], selection: ['A:main/p'] })), { kind: 'rect' });
  assert.deepEqual(pressOf(press({ path: ['A:main'], selection: [] })), { kind: 'rect' });
});

test('a press on a selected element moves it, also when a child of it was pressed', () => {
  const input = press({ path: ['A:main/Card/Text', 'A:main/Card', 'A:main'] });
  assert.deepEqual(pressOf({ ...input, selection: ['A:main/Card'] }), {
    kind: 'move',
    ids: ['A:main/Card'],
  });
});

test('selected neighbouring siblings move together, in document order', () => {
  const row = ['A:main/h1', 'A:main/Card', 'A:main/Card.2', 'A:main/Card.3'];
  const pressed = pressOf(
    press({
      path: ['A:main/Card.2', 'A:main'],
      selection: ['A:main/Card.3', 'A:main/Card.2', 'A:main/Card'],
      siblings: (id) => {
        assert.equal(id, 'A:main/Card.2');
        return row;
      },
    }),
  );
  assert.deepEqual(pressed, {
    kind: 'move',
    ids: ['A:main/Card', 'A:main/Card.2', 'A:main/Card.3'],
  });
});

test('a mixed selection moves only the element under the pointer', () => {
  const row = ['A:main/h1', 'A:main/Card', 'A:main/Card.2', 'A:main/Card.3'];
  const path = ['A:main/Card', 'A:main'];
  // Another parent.
  const elsewhere = pressOf(
    press({ path, selection: ['A:main/Card', 'B:footer/p'], siblings: () => row }),
  );
  assert.deepEqual(elsewhere, { kind: 'move', ids: ['A:main/Card'] });
  // The same parent, with an element between them.
  const apart = pressOf(
    press({ path, selection: ['A:main/Card', 'A:main/Card.3'], siblings: () => row }),
  );
  assert.deepEqual(apart, { kind: 'move', ids: ['A:main/Card'] });
  // Siblings, but one of them cannot move.
  const stuck = pressOf(
    press({
      path,
      selection: ['A:main/Card', 'A:main/Card.2'],
      siblings: () => row,
      movable: (id) => id !== 'A:main/Card.2',
    }),
  );
  assert.deepEqual(stuck, { kind: 'move', ids: ['A:main/Card'] });
});

test('a selected element that cannot move is not dragged: the press draws a rectangle', () => {
  const pressed = pressOf(
    press({ path: ['A:main/h1', 'A:main'], selection: ['A:main'], movable: () => false }),
  );
  assert.deepEqual(pressed, { kind: 'rect' });
});

// The rectangle.

test('the rectangle is the box between two corners, whichever way the pointer went', () => {
  assert.deepEqual(rectOf(at(10, 20), at(50, 80)), box(10, 20, 40, 60));
  assert.deepEqual(rectOf(at(50, 80), at(10, 20)), box(10, 20, 40, 60));
  assert.deepEqual(rectOf(at(50, 20), at(10, 80)), box(10, 20, 40, 60));
});

test('a box is inside only when all of it is; a box without a size never is', () => {
  const rect = box(0, 0, 100, 100);
  assert.equal(contains(rect, box(0, 0, 100, 100)), true);
  assert.equal(contains(rect, box(10, 10, 20, 20)), true);
  assert.equal(contains(rect, box(90, 10, 20, 20)), false);
  assert.equal(contains(rect, box(-1, 10, 20, 20)), false);
  assert.equal(contains(rect, box(10, 90, 20, 20)), false);
  assert.equal(contains(rect, box(10, 10, 0, 0)), false);
  // A line of text may have no width yet a height.
  assert.equal(contains(rect, box(10, 10, 0, 12)), true);
});

/** main > (h1, card > (title, text), aside) */
const PAGE: RectItem[] = [
  { id: 'A:main', box: box(0, 0, 400, 400), parent: -1 },
  { id: 'A:main/h1', box: box(10, 10, 380, 40), parent: 0 },
  { id: 'A:main/Card', box: box(10, 60, 200, 200), parent: 0 },
  { id: 'A:main/Card/Heading', box: box(20, 70, 180, 30), parent: 2 },
  { id: 'A:main/Card/Text', box: box(20, 110, 180, 30), parent: 2 },
  { id: 'A:main/aside', box: box(220, 60, 170, 200), parent: 0 },
];

test('the rectangle takes the outermost elements that lie fully inside it', () => {
  // Around the card: the card, not its heading and text, and not the page around it.
  assert.deepEqual(outermost(PAGE, box(5, 55, 210, 210), 200), ['A:main/Card']);
  // Around the card and the aside: both, in document order.
  assert.deepEqual(outermost(PAGE, box(5, 55, 390, 210), 200), ['A:main/Card', 'A:main/aside']);
  // Around everything: only the outermost one.
  assert.deepEqual(outermost(PAGE, box(-5, -5, 500, 500), 200), ['A:main']);
});

test('inside an element the rectangle does not cover, its children are taken one by one', () => {
  assert.deepEqual(outermost(PAGE, box(15, 65, 190, 80), 200), [
    'A:main/Card/Heading',
    'A:main/Card/Text',
  ]);
  // Half over the heading only: nothing lies fully inside.
  assert.deepEqual(outermost(PAGE, box(15, 65, 100, 20), 200), []);
});

test('an id is taken once, an odd id never, and never more than the limit', () => {
  const list: RectItem[] = [
    { id: 'A:ul', box: box(0, 0, 100, 400), parent: -1 },
    { id: 'A:ul/$/li', box: box(0, 0, 100, 20), parent: 0 },
    { id: 'A:ul/$/li', box: box(0, 20, 100, 20), parent: 0 },
    { id: null, box: box(0, 40, 100, 40), parent: 0 },
    { id: 'A:ul/b', box: box(0, 40, 50, 20), parent: 3 },
    { id: 'A:ul/c', box: box(0, 60, 50, 20), parent: 3 },
  ];
  const rect = box(0, 0, 100, 90);
  assert.deepEqual(outermost(list, rect, 200), ['A:ul/$/li', 'A:ul/b', 'A:ul/c']);
  assert.deepEqual(outermost(list, rect, 2), ['A:ul/$/li', 'A:ul/b']);
});

test('a press elsewhere draws the rectangle and its release posts what it took', () => {
  const b = bench();
  b.set.taken = ['A:main/Card', 'A:main/aside'];
  b.session.press(RECT, at(50, 50), false);
  b.session.move(at(52, 52));
  assert.deepEqual(b.outlines, []);
  b.session.move(at(20, 10));
  assert.deepEqual(b.log, ['started:rect']);
  assert.deepEqual(b.outlines, [box(20, 10, 30, 40)]);
  b.session.release(at(10, 10));
  assert.equal(b.outlines.at(-1), null);
  assert.deepEqual(b.posted, [
    { kitvas: 1, channel: 'c1', type: 'rect', ids: ['A:main/Card', 'A:main/aside'], add: false },
  ]);
  assert.deepEqual(parseStructureFrame(b.posted[0] ?? {}, 'c1'), b.posted[0]);
  // No slot was ever asked for, and no element moved.
  assert.deepEqual(b.asked, []);
  assert.deepEqual(b.previews, []);
});

test('with Shift held at the press the rectangle adds to the selection', () => {
  const b = bench();
  b.set.taken = ['A:main/h1'];
  b.session.press(RECT, at(0, 0), true);
  b.session.move(at(30, 30));
  b.session.release(at(30, 30));
  assert.deepEqual(b.posted, [
    { kitvas: 1, channel: 'c1', type: 'rect', ids: ['A:main/h1'], add: true },
  ]);
});

test('the rectangle keeps its first corner on the page while the page scrolls', () => {
  const b = bench();
  b.set.scroll = at(0, 100);
  b.session.press(RECT, at(50, 50), false);
  b.session.move(at(80, 80));
  assert.deepEqual(b.outlines.at(-1), box(50, 50, 30, 30));
  // Scrolled 60 px further down: the first corner is 60 px higher in the viewport.
  b.set.scroll = at(0, 160);
  b.session.move(at(80, 80));
  assert.deepEqual(b.outlines.at(-1), box(50, -10, 30, 90));
});

// A drag the page forwards.

test('a forwarded insert drag starts at once and its drop posts `drop` with the slot', () => {
  const b = bench();
  const source: DragSource = { kind: 'insert', label: 'Button' };
  b.set.slot = INSIDE;
  b.session.begin(source, at(1, 1));
  // No threshold: the page already saw the pointer move.
  assert.equal(b.session.active(), true);
  assert.deepEqual(b.shown, [INSIDE]);
  b.set.slot = LINE;
  b.session.move(at(30, 40));
  assert.deepEqual(b.shown, [INSIDE, LINE]);
  b.session.release(at(30, 42));
  assert.deepEqual(b.posted, [
    { kitvas: 1, channel: 'c1', type: 'drop', source, anchor: 'A:main/Card.2', place: 'before' },
  ]);
  // The placeholder goes where the element will be.
  assert.deepEqual(b.previews, [{ source, slot: LINE }]);
  assert.deepEqual(b.log, ['started:insert', 'ended', 'post:drop', 'preview']);
});

test('a forwarded drag that ends on no slot, or is cancelled, posts nothing', () => {
  const b = bench();
  b.session.begin({ kind: 'insert', label: 'Card' }, at(1, 1));
  b.session.release(at(500, 500));
  b.set.slot = LINE;
  b.session.begin({ kind: 'insert', label: 'Card' }, at(1, 1));
  b.session.cancel();
  b.session.release(at(1, 1));
  assert.deepEqual(b.posted, []);
  assert.deepEqual(b.previews, []);
  assert.deepEqual(b.log, ['started:insert', 'ended', 'started:insert', 'ended']);
});

test('a forwarded drag takes over from a press in the frame', () => {
  const b = bench();
  b.set.slot = LINE;
  b.session.press(MOVE, at(0, 0), false);
  b.session.move(at(0, 20));
  b.session.begin({ kind: 'insert', label: 'Badge' }, at(5, 5));
  assert.deepEqual(b.log, ['started:move', 'ended', 'started:insert']);
  b.session.release(at(5, 5));
  assert.deepEqual(
    b.posted.map((message) => message.type),
    ['drop'],
  );
  assert.deepEqual(b.previews[0]?.source, { kind: 'insert', label: 'Badge' });
});
