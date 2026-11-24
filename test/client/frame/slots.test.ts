import assert from 'node:assert/strict';
import { test } from 'node:test';
import type { FrameEntry } from '../../../client/channel/structure-protocol.ts';
import {
  type Box,
  chooseSlot,
  flowOf,
  placeIndicator,
  type Slot,
  type SlotChild,
  type SlotNode,
  type SlotParent,
  type SlotSource,
  slotFrom,
  trackCount,
} from '../../../client/frame/slots.ts';

const box = (left: number, top: number, width: number, height: number): Box => ({
  left,
  top,
  width,
  height,
});
const child = (id: string, at: Box): SlotChild => ({ id, box: at });

const entry = (id: string, over: Partial<FrameEntry> = {}): FrameEntry => ({
  id,
  movable: true,
  accepts: true,
  mixed: false,
  interactive: false,
  root: null,
  ...over,
});
const entriesOf = (...list: FrameEntry[]): Map<string, FrameEntry> =>
  new Map(list.map((item) => [item.id, item]));

const node = (id: string, at: Box, over: Partial<SlotNode> = {}): SlotNode => ({
  id,
  box: at,
  flow: { axis: 'column', reverse: false },
  text: false,
  children: [],
  ...over,
});

const source = (over: Partial<SlotSource> = {}): SlotSource => ({
  dragged: new Set(),
  interactive: false,
  slot: null,
  ...over,
});

/** The part of a slot the write uses. */
const where = (slot: Slot | null): [string, string] | null =>
  slot ? [slot.anchor, slot.place] : null;

// A column stack with 10 px of padding and 20 px gaps.
const COLUMN: SlotParent = {
  id: 'S:stack',
  box: box(0, 0, 200, 300),
  axis: 'column',
  children: [
    child('S:stack/a', box(10, 10, 180, 80)),
    child('S:stack/b', box(10, 110, 180, 80)),
    child('S:stack/c', box(10, 210, 180, 80)),
  ],
};

const ROW_BOXES = [box(10, 10, 80, 40), box(110, 10, 80, 40), box(210, 10, 80, 40)] as const;
const ROW: SlotParent = {
  id: 'S:row',
  box: box(0, 0, 300, 60),
  axis: 'row',
  children: [
    child('S:row/a', ROW_BOXES[0]),
    child('S:row/b', ROW_BOXES[1]),
    child('S:row/c', ROW_BOXES[2]),
  ],
};
// The same boxes: the first child in the code is the one at the right.
const REVERSED: SlotParent = {
  ...ROW,
  reverse: true,
  children: [
    child('S:row/a', ROW_BOXES[2]),
    child('S:row/b', ROW_BOXES[1]),
    child('S:row/c', ROW_BOXES[0]),
  ],
};

const SECTION = entry('S:stack', { movable: false, root: 'section' });

test('a flex parent flows along its direction, reversed with -reverse', () => {
  assert.deepEqual(flowOf({ display: 'flex', flexDirection: 'row' }), {
    axis: 'row',
    reverse: false,
  });
  assert.deepEqual(flowOf({ display: 'inline-flex' }), { axis: 'row', reverse: false });
  assert.deepEqual(flowOf({ display: 'flex', flexDirection: 'row-reverse' }), {
    axis: 'row',
    reverse: true,
  });
  assert.deepEqual(flowOf({ display: 'flex', flexDirection: 'column' }), {
    axis: 'column',
    reverse: false,
  });
  assert.deepEqual(flowOf({ display: 'flex', flexDirection: 'column-reverse' }), {
    axis: 'column',
    reverse: true,
  });
});

test('block flow is a column, whatever the other values say', () => {
  const flow = flowOf({ display: 'block', flexDirection: 'row-reverse', direction: 'rtl' });
  assert.deepEqual(flow, { axis: 'column', reverse: false });
});

test('a row runs the other way in a right-to-left parent', () => {
  const rtl = { display: 'flex', direction: 'rtl' };
  assert.deepEqual(flowOf({ ...rtl, flexDirection: 'row' }), { axis: 'row', reverse: true });
  assert.deepEqual(flowOf({ ...rtl, flexDirection: 'row-reverse' }), {
    axis: 'row',
    reverse: false,
  });
  assert.deepEqual(flowOf({ ...rtl, flexDirection: 'column' }), {
    axis: 'column',
    reverse: false,
  });
});

test('a grid flows across when its rows hold several columns, else down', () => {
  const columns = { display: 'grid', gridAutoFlow: 'row', gridTemplateColumns: '95px 95px' };
  assert.equal(flowOf(columns).axis, 'row');
  assert.equal(flowOf({ display: 'grid', gridTemplateColumns: '200px' }).axis, 'column');
  assert.equal(flowOf({ display: 'grid', gridTemplateColumns: 'none' }).axis, 'column');
  const dense = '[a] 100px [b] minmax(10px, 1fr) 100px';
  const named = { display: 'inline-grid', gridAutoFlow: 'row dense', gridTemplateColumns: dense };
  assert.equal(flowOf(named).axis, 'row');
});

test('a grid that flows by column goes across, or down when it has several rows', () => {
  const byColumn = { display: 'grid', gridAutoFlow: 'column' };
  assert.equal(flowOf({ ...byColumn, gridTemplateRows: 'none' }).axis, 'row');
  assert.equal(flowOf({ ...byColumn, gridTemplateRows: '50px' }).axis, 'row');
  assert.equal(flowOf({ ...byColumn, gridTemplateRows: '50px 50px' }).axis, 'column');
});

test('tracks are counted without line names, a function being one track', () => {
  assert.equal(trackCount(''), 0);
  assert.equal(trackCount('none'), 0);
  assert.equal(trackCount('100px'), 1);
  assert.equal(trackCount('[full-start] 100px [content] minmax(0px, 1fr) [full-end]'), 2);
  assert.equal(trackCount('10px  20px\t30px'), 3);
});

test('a column stack gives before and after by the pointer height on the nearest child', () => {
  assert.deepEqual(slotFrom({ x: 100, y: 120 }, COLUMN), {
    anchor: 'S:stack/b',
    place: 'before',
    // Half way through the gap above it, as wide as the child.
    line: { x: 10, y: 100, length: 180, axis: 'x' },
    box: null,
  });
  assert.deepEqual(slotFrom({ x: 100, y: 180 }, COLUMN), {
    anchor: 'S:stack/b',
    place: 'after',
    line: { x: 10, y: 200, length: 180, axis: 'x' },
    box: null,
  });
  // The x never matters in a column.
  assert.deepEqual(where(slotFrom({ x: 5, y: 60 }, COLUMN)), ['S:stack/a', 'after']);
});

test('a row stack gives before and after by the pointer x', () => {
  assert.deepEqual(slotFrom({ x: 120, y: 30 }, ROW), {
    anchor: 'S:row/b',
    place: 'before',
    line: { x: 100, y: 10, length: 40, axis: 'y' },
    box: null,
  });
  assert.deepEqual(slotFrom({ x: 180, y: 55 }, ROW), {
    anchor: 'S:row/b',
    place: 'after',
    line: { x: 200, y: 10, length: 40, axis: 'y' },
    box: null,
  });
});

test('row-reverse swaps before and after, and the line stays under the pointer', () => {
  assert.deepEqual(slotFrom({ x: 120, y: 30 }, REVERSED), {
    anchor: 'S:row/b',
    place: 'after',
    line: { x: 100, y: 10, length: 40, axis: 'y' },
    box: null,
  });
  assert.deepEqual(slotFrom({ x: 180, y: 30 }, REVERSED), {
    anchor: 'S:row/b',
    place: 'before',
    line: { x: 200, y: 10, length: 40, axis: 'y' },
    box: null,
  });
});

test('a grid of two columns gives slots inside the row the pointer is on', () => {
  const style = { display: 'grid', gridAutoFlow: 'row', gridTemplateColumns: '95px 95px' };
  const grid: SlotParent = {
    id: 'S:grid',
    box: box(0, 0, 220, 220),
    ...flowOf(style),
    children: [
      child('S:grid/a', box(10, 10, 95, 95)),
      child('S:grid/b', box(115, 10, 95, 95)),
      child('S:grid/c', box(10, 115, 95, 95)),
      child('S:grid/d', box(115, 115, 95, 95)),
    ],
  };
  assert.deepEqual(slotFrom({ x: 130, y: 150 }, grid), {
    anchor: 'S:grid/d',
    place: 'before',
    // Between `c` and `d`, as high as the second row only.
    line: { x: 110, y: 115, length: 95, axis: 'y' },
    box: null,
  });
  assert.deepEqual(where(slotFrom({ x: 190, y: 40 }, grid)), ['S:grid/b', 'after']);
  // The left padding of the second row is no start of the grid: `c` is not the first child.
  assert.deepEqual(slotFrom({ x: 5, y: 150 }, grid), {
    anchor: 'S:grid/c',
    place: 'before',
    line: { x: 5, y: 115, length: 95, axis: 'y' },
    box: null,
  });
});

test('the padding before the first child and after the last gives first and last', () => {
  assert.deepEqual(slotFrom({ x: 100, y: 4 }, COLUMN), {
    anchor: 'S:stack',
    place: 'first',
    line: { x: 10, y: 5, length: 180, axis: 'x' },
    box: COLUMN.box,
  });
  assert.deepEqual(slotFrom({ x: 100, y: 296 }, COLUMN), {
    anchor: 'S:stack',
    place: 'last',
    line: { x: 10, y: 295, length: 180, axis: 'x' },
    box: COLUMN.box,
  });
  // In a reversed row the first child of the code is at the right.
  assert.deepEqual(slotFrom({ x: 296, y: 30 }, REVERSED), {
    anchor: 'S:row',
    place: 'first',
    line: { x: 295, y: 10, length: 40, axis: 'y' },
    box: REVERSED.box,
  });
  assert.deepEqual(where(slotFrom({ x: 3, y: 30 }, REVERSED)), ['S:row', 'last']);
});

test('a parent that offers no place of its own gives only before and after', () => {
  assert.deepEqual(where(slotFrom({ x: 100, y: 4 }, COLUMN, false)), ['S:stack/a', 'before']);
  assert.deepEqual(where(slotFrom({ x: 100, y: 296 }, COLUMN, false)), ['S:stack/c', 'after']);
  assert.equal(slotFrom({ x: 100, y: 50 }, { ...COLUMN, children: [] }, false), null);
});

test('an empty Card takes the drop as its last child, shown as its box', () => {
  const card = node('S:stack/Card', box(20, 100, 160, 100));
  const stack = node('S:stack', box(0, 0, 200, 300), { children: [child(card.id, card.box)] });
  const entries = entriesOf(entry(card.id), SECTION);
  assert.deepEqual(chooseSlot({ x: 100, y: 150 }, [card, stack], source(), entries), {
    anchor: 'S:stack/Card',
    place: 'last',
    line: null,
    box: card.box,
  });
});

test('near the edge of a container the drop goes beside it', () => {
  const card = node('S:stack/Card', box(20, 100, 160, 100));
  const stack = node('S:stack', box(0, 0, 200, 300), { children: [child(card.id, card.box)] });
  const entries = entriesOf(entry(card.id), SECTION);
  const at = (y: number) => where(chooseSlot({ x: 100, y }, [card, stack], source(), entries));
  assert.deepEqual(at(103), ['S:stack/Card', 'before']);
  assert.deepEqual(at(197), ['S:stack/Card', 'after']);
});

test('there is no slot into an Input, only beside it', () => {
  const input = node('S:stack/Input', box(20, 100, 160, 40));
  const stack = node('S:stack', box(0, 0, 200, 300), { children: [child(input.id, input.box)] });
  const entries = entriesOf(entry(input.id, { accepts: false, interactive: true }), SECTION);
  const at = (y: number) => where(chooseSlot({ x: 100, y }, [input, stack], source(), entries));
  assert.deepEqual(at(110), ['S:stack/Input', 'before']);
  assert.deepEqual(at(130), ['S:stack/Input', 'after']);
  // With no parent to stand beside it in, there is no slot at all.
  assert.equal(chooseSlot({ x: 100, y: 120 }, [input], source(), entries), null);
});

test('an element that holds only text takes nothing inside', () => {
  const button = node('S:stack/Button', box(20, 100, 160, 40), { text: true });
  const stack = node('S:stack', box(0, 0, 200, 300), { children: [child(button.id, button.box)] });
  const entries = entriesOf(entry(button.id, { interactive: true }), SECTION);
  const slot = chooseSlot({ x: 100, y: 130 }, [button, stack], source(), entries);
  assert.deepEqual(where(slot), ['S:stack/Button', 'after']);
});

test('there is no slot inside the dragged element or its descendants', () => {
  const inner = node('S:stack/Card/Text', box(10, 10, 180, 40), { text: true });
  const card = node('S:stack/Card', box(0, 0, 200, 140), {
    children: [child(inner.id, inner.box)],
  });
  const other = child('S:stack/Text', box(0, 160, 200, 100));
  const stack = node('S:stack', box(0, 0, 200, 300), {
    children: [child(card.id, card.box), other],
  });
  const entries = entriesOf(entry(inner.id), entry(card.id), entry(other.id), SECTION);
  const dragged = source({ dragged: new Set([card.id]) });
  // Over the dragged card and its text: the slot is in the stack, never beside the card itself.
  const over = chooseSlot({ x: 100, y: 30 }, [inner, card, stack], dragged, entries);
  assert.deepEqual(where(over), ['S:stack', 'first']);
  const below = chooseSlot({ x: 100, y: 250 }, [stack], dragged, entries);
  assert.deepEqual(where(below), ['S:stack/Text', 'after']);
});

test('an only child dragged over itself leaves its parent as an empty one', () => {
  const inner = node('S:stack/Card/Text', box(10, 10, 180, 40), { text: true });
  const card = node('S:stack/Card', box(0, 0, 200, 140), {
    children: [child(inner.id, inner.box)],
  });
  const stack = node('S:stack', box(0, 0, 200, 300), { children: [child(card.id, card.box)] });
  const entries = entriesOf(entry(inner.id), entry(card.id), SECTION);
  const dragged = source({ dragged: new Set([inner.id]) });
  const slot = chooseSlot({ x: 100, y: 30 }, [inner, card, stack], dragged, entries);
  assert.deepEqual(where(slot), ['S:stack/Card', 'last']);
});

test('there is no slot between the children of a mixed parent', () => {
  const bold = node('S:stack/p/b', box(20, 15, 40, 20), { text: true });
  const italic = child('S:stack/p/i', box(80, 15, 40, 20));
  const paragraph = node('S:stack/p', box(10, 10, 180, 40), {
    flow: { axis: 'row', reverse: false },
    children: [child(bold.id, bold.box), italic],
  });
  const stack = node('S:stack', box(0, 0, 200, 300), {
    children: [child(paragraph.id, paragraph.box), child('S:stack/p.2', box(10, 60, 180, 40))],
  });
  const entries = entriesOf(
    entry(bold.id),
    entry(italic.id),
    entry(paragraph.id, { mixed: true }),
    entry('S:stack/p.2'),
    SECTION,
  );
  // Over the bold word: the nearest allowed place is beside the whole paragraph.
  const onWord = chooseSlot({ x: 40, y: 25 }, [bold, paragraph, stack], source(), entries);
  assert.deepEqual(where(onWord), ['S:stack/p', 'before']);
  // Between the two words, and in the paragraph's own padding.
  const between = chooseSlot({ x: 70, y: 35 }, [paragraph, stack], source(), entries);
  assert.deepEqual(where(between), ['S:stack/p', 'after']);
  // A mixed element with nothing around it that takes the drop gives nothing.
  assert.equal(chooseSlot({ x: 70, y: 30 }, [paragraph], source(), entries), null);
});

test('an interactive element is never dropped inside another', () => {
  const card = node('S:stack/a/Card', box(20, 60, 160, 100));
  const link = node('S:stack/a', box(10, 50, 180, 120), {
    children: [child(card.id, card.box)],
  });
  const stack = node('S:stack', box(0, 0, 200, 300), { children: [child(link.id, link.box)] });
  const entries = entriesOf(entry(card.id), entry(link.id, { interactive: true }), SECTION);
  const chain = [card, link, stack];
  const button = source({ dragged: new Set(['S:stack/Button']), interactive: true });
  assert.deepEqual(where(chooseSlot({ x: 100, y: 100 }, chain, button, entries)), [
    'S:stack/a',
    'before',
  ]);
  // A plain element goes into the card inside the link.
  assert.deepEqual(where(chooseSlot({ x: 100, y: 100 }, chain, source(), entries)), [
    'S:stack/a/Card',
    'last',
  ]);
});

test('there is no slot beside or inside an element written in an expression', () => {
  const items = [box(10, 10, 180, 40), box(10, 50, 180, 40), box(10, 90, 180, 40)];
  const item = node('S:stack/ul/li', items[1] ?? box(0, 0, 0, 0));
  const list = node('S:stack/ul', box(10, 10, 180, 120), {
    children: items.map((at) => child(item.id, at)),
  });
  const stack = node('S:stack', box(0, 0, 200, 300), { children: [child(list.id, list.box)] });
  const entries = entriesOf(entry(item.id, { movable: false }), entry(list.id), SECTION);
  const slot = chooseSlot({ x: 100, y: 60 }, [item, list, stack], source(), entries);
  assert.deepEqual(where(slot), ['S:stack/ul', 'before']);
  // Over the list's own gap the nearest child is still a mapped item.
  const gap = chooseSlot({ x: 100, y: 100 }, [list, stack], source(), entries);
  assert.deepEqual(where(gap), ['S:stack/ul', 'after']);
});

test('nothing moves into a slot or out of it, but its own elements move inside it', () => {
  const heading = node('S:Card/Stack/Heading', box(20, 20, 100, 20), { text: true });
  const badge = child('S:Card/Stack/Badge', box(20, 44, 60, 20));
  const title = node('S:Card/Stack', box(10, 10, 180, 60), {
    children: [child(heading.id, heading.box), badge],
  });
  const card = node('S:Card', box(0, 0, 200, 200), { children: [child(title.id, title.box)] });
  const entries = entriesOf(
    entry(heading.id),
    entry(badge.id),
    entry(title.id, { movable: false, root: 'slot' }),
    entry(card.id, { movable: false, root: 'section' }),
  );
  const chain = [heading, title, card];
  assert.equal(chooseSlot({ x: 60, y: 26 }, chain, source(), entries), null);
  const own = source({ dragged: new Set([badge.id]), slot: title.id });
  assert.deepEqual(where(chooseSlot({ x: 60, y: 26 }, chain, own, entries)), [
    'S:Card/Stack/Heading',
    'before',
  ]);
  // Out of the slot: the card's own children are no place for it.
  const out = chooseSlot({ x: 100, y: 150 }, [card], own, entries);
  assert.equal(out, null);
});

test('an element the structure does not list gives no slot', () => {
  const unknown = node('App:main', box(0, 0, 200, 300));
  assert.equal(chooseSlot({ x: 100, y: 100 }, [unknown], source(), new Map()), null);
  assert.equal(chooseSlot({ x: 100, y: 100 }, [], source(), new Map()), null);
});

test('the indicator is a 2 px line centred on the slot, or the box, inside the overlay', () => {
  // The overlay's corner is 200 px above the viewport: the page is scrolled.
  const host = { x: 0, y: -200 };
  const upright: Slot = {
    anchor: 'S:row/b',
    place: 'before',
    line: { x: 100, y: 10, length: 40, axis: 'y' },
    box: null,
  };
  assert.deepEqual(placeIndicator(upright, host), {
    line: box(99, 210, 2, 40),
    box: null,
  });
  const flat: Slot = { ...upright, line: { x: 10, y: 100, length: 180, axis: 'x' } };
  assert.deepEqual(placeIndicator(flat, host).line, box(10, 299, 180, 2));
  const card = box(20, 100, 160, 100);
  const inside: Slot = { anchor: 'S:Card', place: 'last', line: null, box: card };
  assert.deepEqual(placeIndicator(inside, host), { line: null, box: box(20, 300, 160, 100) });
});
