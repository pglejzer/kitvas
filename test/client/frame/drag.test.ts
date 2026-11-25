import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  type CopyRef,
  type EditFrameMessage,
  parseEditFrame,
} from '../../../client/channel/edit-protocol.ts';
import type { DragSource } from '../../../client/channel/structure-protocol.ts';
import type { ListSlot } from '../../../client/frame/drag/item-slots.ts';
import {
  createSession,
  type Family,
  type ItemSource,
  type Press,
  passed,
  type Session,
  samePath,
  samePlace,
  THRESHOLD,
} from '../../../client/frame/drag/session.ts';
import type { Box, Point, Slot } from '../../../client/frame/drag/slots.ts';

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
  box: box(0, 0, 200, 400),
};
const INSIDE: Slot = { anchor: 'A:main/Stack', place: 'last', line: null, box: box(0, 0, 10, 10) };

/** The copies of one list item share this id. */
const PLAN = 'A:main/Stack/Card';
/** The box of the element the plans sit in. */
const STACK = box(0, 0, 400, 120);
/** Before the first copy: the dragged second item becomes the first. */
const FIRST: ListSlot = {
  to: 0,
  anchor: 0,
  place: 'before',
  line: { x: 4, y: 0, length: 120, axis: 'y' },
  list: 0,
  path: [0],
  box: STACK,
};

type Bench = {
  session: Session;
  posted: EditFrameMessage[];
  /** What happened around the session, in order. */
  log: string[];
  shown: (Slot | null)[];
  /** The lists outlined with each slot shown. */
  around: (readonly Box[] | undefined)[];
  outlines: { rect: Box | null; boxes: readonly Box[] }[];
  previews: { source: DragSource; slot: Slot }[];
  itemPreviews: { source: ItemSource; slot: ListSlot }[];
  asked: { point: Point; source: DragSource }[];
  set: {
    slot: Slot | null;
    itemSlot: ListSlot | null;
    lists: Box[];
    scroll: Point;
    taken: { picks: CopyRef[]; boxes: Box[] };
    family: Family;
    scale: number;
  };
};

/** The children of `A:main`, in order. */
const ROW = ['A:main/h1', 'A:main/Card', 'A:main/Card.2', 'A:main/Card.3'];

function bench(): Bench {
  const posted: EditFrameMessage[] = [];
  const log: string[] = [];
  const shown: (Slot | null)[] = [];
  const around: Bench['around'] = [];
  const outlines: Bench['outlines'] = [];
  const previews: Bench['previews'] = [];
  const itemPreviews: Bench['itemPreviews'] = [];
  const asked: Bench['asked'] = [];
  const set: Bench['set'] = {
    slot: null,
    itemSlot: null,
    lists: [STACK],
    scroll: at(0, 0),
    taken: { picks: [], boxes: [] },
    // Nowhere yet: no slot is the dragged element's own place unless a test says where it is.
    family: { parent: null, row: [] },
    scale: 1,
  };
  const session = createSession({
    channel: 'c1',
    post: (message) => {
      posted.push(message);
      log.push(`post:${message.type}`);
    },
    scale: () => set.scale,
    slot: (point, source) => {
      asked.push({ point, source });
      return set.slot;
    },
    itemSlot: () => ({ slot: set.itemSlot, lists: set.lists }),
    indicate: (slot, lists) => {
      shown.push(slot);
      around.push(lists);
    },
    scroll: () => set.scroll,
    outline: (rect, boxes) => {
      outlines.push({ rect, boxes });
    },
    taken: () => ({ boxes: set.taken.boxes, picks: () => set.taken.picks }),
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
    previewItem: (source, slot) => {
      itemPreviews.push({ source, slot });
      log.push('previewItem');
    },
  });
  return { session, posted, log, shown, around, outlines, previews, itemPreviews, asked, set };
}

/** A press on a selected element: nothing to pick. */
const MOVE: Press = { kind: 'move', ids: ['A:main/Card'], pick: null };
/** The same element while it is not selected: the drag picks it. */
const UNSELECTED: Press = { kind: 'move', ids: ['A:main/Card'], pick: { id: 'A:main/Card' } };
const RECT: Press = { kind: 'rect' };
/** A press on the second copy of a list item. */
const ITEM: Press = {
  kind: 'item',
  id: PLAN,
  item: 1,
  from: [1],
  pick: { id: PLAN, item: 1, path: [1] },
};

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

test('the threshold is 4 px on the screen, whatever the canvas zoom is', () => {
  // The canvas at 50 %: one pixel on the screen is two of the frame.
  assert.equal(passed(at(10, 10), at(17, 10), 2), false);
  assert.equal(passed(at(10, 10), at(18.5, 10), 2), true);
  // At 200 % half a frame pixel is one on the screen.
  assert.equal(passed(at(10, 10), at(12.5, 10), 0.5), true);
  const b = bench();
  b.set.scale = 2;
  b.session.press(MOVE, at(100, 100), false);
  b.session.move(at(100, 106));
  assert.equal(b.session.active(), false);
  b.session.move(at(100, 109));
  assert.equal(b.session.active(), true);
});

test('a press that stays within the threshold is a click: nothing is sent', () => {
  const b = bench();
  b.set.slot = LINE;
  b.session.press(UNSELECTED, at(100, 100), false);
  b.session.move(at(103, 101));
  assert.equal(b.session.active(), false);
  b.session.release(at(103, 101));
  assert.deepEqual(b.log, []);
  assert.deepEqual(b.shown, []);
  // Not even the pick: the click that follows is the editor's to take.
  assert.deepEqual(b.posted, []);
});

test('past the threshold a press on a selected element drags it and shows the slot', () => {
  const b = bench();
  b.set.slot = LINE;
  b.session.press(MOVE, at(100, 100), false);
  b.session.move(at(100, 105));
  assert.equal(b.session.active(), true);
  assert.equal(b.session.drawing(), false);
  // It is selected already: no pick.
  assert.deepEqual(b.log, ['started:move']);
  assert.deepEqual(b.shown, [LINE]);
  assert.deepEqual(b.asked, [
    { point: at(100, 105), source: { kind: 'move', ids: ['A:main/Card'] } },
  ]);
});

test('a drag of an element that is not selected picks it first, then drags', () => {
  const b = bench();
  b.set.slot = LINE;
  b.session.press(UNSELECTED, at(100, 100), false);
  b.session.move(at(100, 105));
  assert.deepEqual(b.log, ['post:pick', 'started:move']);
  const pick = { kitvas: 1, channel: 'c1', type: 'pick', id: 'A:main/Card', add: false };
  assert.deepEqual(b.posted, [{ ...pick, double: false }]);
  assert.deepEqual(parseEditFrame(b.posted[0] ?? {}, 'c1'), b.posted[0]);
  // Once: the moves that follow only look for the slot.
  b.session.move(at(100, 140));
  assert.equal(b.posted.length, 1);
  b.session.release(at(100, 140));
  assert.deepEqual(
    b.posted.map((message) => message.type),
    ['pick', 'drop'],
  );
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

test('every posted message is one the studio accepts', () => {
  const b = bench();
  b.set.slot = INSIDE;
  b.set.itemSlot = FIRST;
  const picks = [{ id: 'A:main/h1' }, { id: PLAN, item: 4, path: [1, 1] }];
  b.set.taken = { picks, boxes: [box(0, 0, 10, 10), box(0, 20, 10, 10)] };
  const run: Press = { kind: 'move', ids: ['A:main/Card', 'A:main/Card.2'], pick: null };
  b.session.press(run, at(0, 0), false);
  b.session.move(at(0, 9));
  b.session.release(at(0, 9));
  b.session.begin({ kind: 'insert', label: 'Button' }, at(0, 0));
  b.session.release(at(5, 5));
  b.session.press(ITEM, at(0, 0), false);
  b.session.move(at(0, 9));
  b.session.release(at(0, 9));
  b.session.press(RECT, at(0, 0), true);
  b.session.move(at(0, 9));
  b.session.release(at(0, 9));
  assert.deepEqual(
    b.posted.map((message) => message.type),
    ['drop', 'drop', 'pick', 'reorder', 'rect'],
  );
  for (const message of b.posted) assert.deepEqual(parseEditFrame(message, 'c1'), message);
});

// A list item.

test('a list item drags among its lists: its copy is picked, the line shows the place', () => {
  const b = bench();
  b.set.itemSlot = FIRST;
  b.set.lists = [STACK, box(0, 200, 400, 120)];
  b.session.press(ITEM, at(100, 100), false);
  b.session.move(at(100, 103));
  assert.equal(b.session.active(), false);
  b.session.move(at(60, 100));
  assert.equal(b.session.active(), true);
  assert.deepEqual(b.log, ['post:pick', 'started:item']);
  const pick = { kitvas: 1, channel: 'c1', type: 'pick', id: PLAN, item: 1, path: [1] };
  assert.deepEqual(b.posted, [{ ...pick, add: false, double: false }]);
  // The line, with the box of the list that takes the item around it.
  assert.deepEqual(b.shown, [{ anchor: PLAN, place: 'before', line: FIRST.line, box: STACK }]);
  // Every list the item can go to is outlined from the start.
  assert.deepEqual(b.around, [[STACK, box(0, 200, 400, 120)]]);
  // Only places among the copies: the slots of an element drag are never asked for.
  assert.deepEqual(b.asked, []);
});

test('with no place under the pointer the lists stay outlined, with no line', () => {
  const b = bench();
  b.session.press(ITEM, at(100, 100), false);
  b.session.move(at(100, 110));
  assert.deepEqual(b.shown, [null]);
  assert.deepEqual(b.around, [[STACK]]);
});

test('a dropped list item posts `reorder` with its path and the new one, then previews', () => {
  const b = bench();
  b.set.itemSlot = FIRST;
  b.session.press(ITEM, at(100, 100), false);
  b.session.move(at(60, 100));
  b.session.release(at(10, 100));
  assert.deepEqual(b.posted.at(-1), {
    kitvas: 1,
    channel: 'c1',
    type: 'reorder',
    id: PLAN,
    from: [1],
    to: [0],
  });
  const source = { kind: 'item', id: PLAN, item: 1, from: [1] };
  assert.deepEqual(b.itemPreviews, [{ source, slot: FIRST }]);
  assert.equal(b.shown.at(-1), null);
  assert.deepEqual(b.log, ['post:pick', 'started:item', 'ended', 'post:reorder', 'previewItem']);
  // An item never moves as an element.
  assert.deepEqual(b.previews, []);
});

test('an item dropped in the same list of another parent posts the path it has there', () => {
  const b = bench();
  /** The third row of the first card. */
  const row = 'A:main/Stack/Card/Row';
  const pressed: Press = {
    kind: 'item',
    id: row,
    item: 2,
    from: [0, 2],
    pick: { id: row, item: 2, path: [0, 2] },
  };
  // The first place among the rows of the second card.
  b.set.itemSlot = { ...FIRST, list: 1, path: [1, 0] };
  b.session.press(pressed, at(100, 100), false);
  b.session.move(at(300, 100));
  b.session.release(at(300, 100));
  const reorder = { kitvas: 1, channel: 'c1', type: 'reorder', id: row, from: [0, 2], to: [1, 0] };
  assert.deepEqual(b.posted.at(-1), reorder);
  assert.deepEqual(parseEditFrame(reorder, 'c1'), reorder);
  // The same number in another list is another place.
  assert.equal(samePath([0, 2], [1, 2]), false);
  assert.equal(samePath([0, 2], [0, 2]), true);
  assert.equal(samePath([2], [0, 2]), false);
});

test('a list item dropped on its own place, or on none, writes nothing', () => {
  const own = bench();
  own.set.itemSlot = { ...FIRST, to: 1, anchor: 2, path: [1] };
  own.session.press(ITEM, at(100, 100), false);
  own.session.move(at(100, 110));
  // The line still shows where it would go.
  assert.equal(own.shown.length, 1);
  own.session.release(at(100, 110));
  assert.deepEqual(own.log, ['post:pick', 'started:item', 'ended']);
  assert.deepEqual(own.itemPreviews, []);

  const none = bench();
  none.session.press(ITEM, at(100, 100), false);
  none.session.move(at(100, 110));
  assert.deepEqual(none.shown, [null]);
  none.session.release(at(900, 900));
  assert.deepEqual(none.log, ['post:pick', 'started:item', 'ended']);
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

test('Esc during an item drag removes the line and reorders nothing', () => {
  const b = bench();
  b.set.itemSlot = FIRST;
  b.session.press(ITEM, at(100, 100), false);
  b.session.move(at(60, 100));
  b.session.cancel();
  assert.equal(b.shown.at(-1), null);
  // The lists' outlines leave with the line.
  assert.equal(b.around.at(-1), undefined);
  b.session.release(at(10, 100));
  assert.deepEqual(b.log, ['post:pick', 'started:item', 'ended']);
});

test('Esc during a rectangle removes it and selects nothing', () => {
  const b = bench();
  b.set.taken = { picks: [{ id: 'A:main/Card' }], boxes: [box(0, 0, 10, 10)] };
  b.session.press(RECT, at(10, 10), false);
  b.session.move(at(60, 60));
  assert.equal(b.session.drawing(), true);
  b.session.cancel();
  assert.equal(b.session.drawing(), false);
  assert.deepEqual(b.outlines.at(-1), { rect: null, boxes: [] });
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

// The rectangle. What a press does (`pressOf`) is in `drag/press.test.ts`.

test('a press on the root draws the rectangle, outlines what it would take and posts it', () => {
  const b = bench();
  const boxes = [box(10, 60, 200, 200), box(220, 60, 170, 200)];
  const picks = [{ id: 'A:main/Card' }, { id: 'A:main/aside' }];
  b.set.taken = { picks, boxes };
  b.session.press(RECT, at(50, 50), false);
  b.session.move(at(52, 52));
  assert.deepEqual(b.outlines, []);
  b.session.move(at(20, 10));
  assert.deepEqual(b.log, ['started:rect']);
  assert.deepEqual(b.outlines, [{ rect: box(20, 10, 30, 40), boxes }]);
  b.session.release(at(10, 10));
  assert.deepEqual(b.outlines.at(-1), { rect: null, boxes: [] });
  assert.deepEqual(b.posted, [{ kitvas: 1, channel: 'c1', type: 'rect', picks, add: false }]);
  assert.deepEqual(b.log, ['started:rect', 'ended', 'post:rect']);
  // No slot was ever asked for, and no element moved.
  assert.deepEqual(b.asked, []);
  assert.deepEqual(b.previews, []);
});

test('a rectangle posts every copy it took, each with its place and its path', () => {
  const b = bench();
  const row = 'A:main/Stack/Card/Row';
  // Three rows of the second card, of the nineteen rows that carry the id.
  const picks = [
    { id: row, item: 6, path: [1, 0] },
    { id: row, item: 7, path: [1, 1] },
    { id: row, item: 8, path: [1, 2] },
  ];
  b.set.taken = { picks, boxes: [box(0, 0, 9, 9), box(0, 10, 9, 9), box(0, 20, 9, 9)] };
  b.session.press(RECT, at(0, 0), false);
  b.session.move(at(30, 30));
  b.session.release(at(30, 30));
  const rect = { kitvas: 1, channel: 'c1', type: 'rect', picks, add: false };
  assert.deepEqual(b.posted, [rect]);
  assert.deepEqual(parseEditFrame(rect, 'c1'), rect);
});

test('Ctrl held: a rectangle that adds', () => {
  const b = bench();
  b.set.taken = { picks: [{ id: 'A:main/h1' }], boxes: [box(0, 0, 20, 20)] };
  // `drag.ts` passes Shift, Ctrl or Cmd as the one flag; `pressOf` made the press a rectangle.
  b.session.press(RECT, at(0, 0), true);
  b.session.move(at(30, 30));
  b.session.release(at(30, 30));
  assert.deepEqual(b.posted, [
    { kitvas: 1, channel: 'c1', type: 'rect', picks: [{ id: 'A:main/h1' }], add: true },
  ]);
});

test('a rectangle that took nothing still posts: the selection is cleared', () => {
  const b = bench();
  b.session.press(RECT, at(0, 0), false);
  b.session.move(at(30, 30));
  b.session.release(at(30, 30));
  assert.deepEqual(b.posted, [{ kitvas: 1, channel: 'c1', type: 'rect', picks: [], add: false }]);
});

test('the rectangle keeps its first corner on the page while the page scrolls', () => {
  const b = bench();
  b.set.scroll = at(0, 100);
  b.session.press(RECT, at(50, 50), false);
  b.session.move(at(80, 80));
  assert.deepEqual(b.outlines.at(-1)?.rect, box(50, 50, 30, 30));
  // Scrolled 60 px further down: the first corner is 60 px higher in the viewport.
  b.set.scroll = at(0, 160);
  b.session.move(at(80, 80));
  assert.deepEqual(b.outlines.at(-1)?.rect, box(50, -10, 30, 90));
});

test('a new press ends a rectangle that was never let go', () => {
  const b = bench();
  b.session.press(RECT, at(0, 0), false);
  b.session.move(at(30, 30));
  b.session.press(MOVE, at(5, 5), false);
  assert.equal(b.session.drawing(), false);
  assert.deepEqual(b.outlines.at(-1), { rect: null, boxes: [] });
  assert.deepEqual(b.log, ['started:rect', 'ended']);
  assert.deepEqual(b.posted, []);
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
