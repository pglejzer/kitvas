// Where the selected element is over the stage (redesign spec, goal 12; plan 19, task 4): the
// union of the located copies in the stage's pixels; away at once on a movement and back 150 ms
// after the last one; away while a gesture lasts; asked again on each return. A fake clock.

import assert from 'node:assert/strict';
import { test } from 'node:test';
import type { FrameBox } from '../../../../../client/channel/canvas-protocol.ts';
import {
  type AnchorTarget,
  anchorTargets,
  type Clock,
  createAnchor,
  FIRST_REQUEST,
  MAX_LOCATED,
  RETURN_MS,
} from '../../../../../client/studio/edit/seltools/anchor.ts';

const ID = 'sections/Plans:section/Grid/Card';
const OTHER = 'sections/Plans:section/Grid/Card/Button';

function fakeClock() {
  let now = 0;
  const timers: { at: number; run: () => void; on: boolean }[] = [];
  const clock: Clock = {
    after(ms, run) {
      const timer = { at: now + ms, run, on: true };
      timers.push(timer);
      return () => {
        timer.on = false;
      };
    },
  };
  function tick(ms: number): void {
    const end = now + ms;
    for (;;) {
      const due = timers.filter((one) => one.on && one.at <= end).sort((a, b) => a.at - b.at)[0];
      if (!due) break;
      now = due.at;
      due.on = false;
      due.run();
    }
    now = end;
  }
  return { clock, tick };
}

function harness(cardThere = true) {
  const { clock, tick } = fakeClock();
  const asked: { target: AnchorTarget; request: number }[] = [];
  let told = 0;
  const anchor = createAnchor({
    clock,
    locate: (target, request) => {
      if (!cardThere) return false;
      asked.push({ target, request });
      return true;
    },
    // The card stands 100 px right of and 50 px under the stage's corner, at 100 %.
    toStage: (box) => ({ ...box, x: box.x + 100, y: box.y + 50 }),
  });
  anchor.onChange(() => {
    told += 1;
  });
  /** The card answers every `locate` of the last round with `box`. */
  function answer(count: number, box: (index: number) => FrameBox | null): void {
    for (const [index, one] of asked.slice(-count).entries()) {
      anchor.located(one.request, box(index));
    }
  }
  return { anchor, asked, tick, answer, told: () => told };
}

const BOX: FrameBox = { x: 10, y: 20, width: 120, height: 40 };

test('one element is located and its box is in the stage pixels', () => {
  const h = harness();
  h.anchor.follow([{ id: ID }]);
  assert.deepEqual(h.asked, [{ target: { id: ID }, request: FIRST_REQUEST }]);
  assert.equal(h.anchor.box(), null);
  h.answer(1, () => BOX);
  assert.deepEqual(h.anchor.box(), { x: 110, y: 70, width: 120, height: 40 });
});

test('several elements: the union of the boxes found, at most 8 asked', () => {
  const h = harness();
  const targets = Array.from({ length: 10 }, (_, item): AnchorTarget => ({ id: ID, item }));
  h.anchor.follow(targets);
  assert.equal(h.asked.length, MAX_LOCATED);
  // The second copy is not in the card at this width: it counts for nothing.
  h.answer(MAX_LOCATED, (index) =>
    index === 1 ? null : { x: 10 + index * 10, y: 20, width: 10, height: 10 + index },
  );
  assert.deepEqual(h.anchor.box(), { x: 110, y: 70, width: 80, height: 17 });
});

test('nothing found, or no card to ask: no box', () => {
  const h = harness();
  h.anchor.follow([{ id: ID }]);
  h.answer(1, () => null);
  assert.equal(h.anchor.box(), null);
  const none = harness(false);
  none.anchor.follow([{ id: ID }]);
  assert.equal(none.anchor.box(), null);
});

test("an answer to another request (the canvas's zoom to selection) is not the anchor's", () => {
  const h = harness();
  h.anchor.follow([{ id: ID }]);
  h.anchor.located(1, BOX);
  h.anchor.located(FIRST_REQUEST + 5, BOX);
  assert.equal(h.anchor.box(), null);
  h.answer(1, () => BOX);
  assert.notEqual(h.anchor.box(), null);
});

test('two movements 100 ms apart: away at once, back once, 150 ms after the second', () => {
  const h = harness();
  h.anchor.follow([{ id: ID }]);
  h.answer(1, () => BOX);
  const told = h.told();
  h.anchor.moved();
  assert.equal(h.anchor.box(), null);
  assert.equal(h.told(), told + 1);
  h.tick(100);
  h.anchor.moved();
  h.tick(100);
  // 200 ms after the first, 100 after the second: still away, nothing asked.
  assert.equal(h.anchor.box(), null);
  assert.equal(h.asked.length, 1);
  h.tick(RETURN_MS - 100 - 1);
  assert.equal(h.asked.length, 1);
  h.tick(1);
  // Back: where the element is now is asked once; the old place is not shown meanwhile.
  assert.equal(h.asked.length, 2);
  assert.equal(h.anchor.box(), null);
  h.answer(1, () => ({ ...BOX, y: 80 }));
  assert.deepEqual(h.anchor.box(), { x: 110, y: 130, width: 120, height: 40 });
  h.tick(1000);
  assert.equal(h.asked.length, 2);
});

test('a gesture keeps the tools away while it lasts; they come back 150 ms after it ends', () => {
  const h = harness();
  h.anchor.follow([{ id: ID }]);
  h.answer(1, () => BOX);
  h.anchor.hold('text', true);
  h.anchor.moved();
  h.tick(1000);
  assert.equal(h.anchor.box(), null);
  assert.equal(h.asked.length, 1);
  h.anchor.hold('handle', true);
  h.anchor.hold('text', false);
  h.tick(1000);
  // The handle is still held.
  assert.equal(h.asked.length, 1);
  h.anchor.hold('handle', false);
  h.tick(RETURN_MS - 1);
  assert.equal(h.asked.length, 1);
  h.tick(1);
  assert.equal(h.asked.length, 2);
  h.answer(1, () => BOX);
  assert.notEqual(h.anchor.box(), null);
});

test('a gesture that ends twice, or never began, changes nothing', () => {
  const h = harness();
  h.anchor.follow([{ id: ID }]);
  h.answer(1, () => BOX);
  h.anchor.hold('drag', false);
  assert.notEqual(h.anchor.box(), null);
});

test('a new selection while away is asked on the return, its old place forgotten', () => {
  const h = harness();
  h.anchor.follow([{ id: ID }]);
  h.answer(1, () => BOX);
  h.anchor.moved();
  h.anchor.follow([{ id: OTHER }]);
  assert.equal(h.asked.length, 1);
  h.tick(RETURN_MS);
  assert.deepEqual(h.asked.at(-1)?.target, { id: OTHER });
  assert.equal(h.anchor.box(), null);
});

test('a build asks again and keeps the place until the answer, so nothing flickers', () => {
  const h = harness();
  h.anchor.follow([{ id: ID }]);
  h.answer(1, () => BOX);
  h.anchor.again();
  assert.equal(h.asked.length, 2);
  assert.notEqual(h.anchor.box(), null);
  h.answer(1, () => ({ ...BOX, x: 30 }));
  assert.equal(h.anchor.box()?.x, 130);
  // A late answer of the round before is dropped.
  h.anchor.located(FIRST_REQUEST, BOX);
  assert.equal(h.anchor.box()?.x, 130);
});

test('another selection forgets the old place at once', () => {
  const h = harness();
  h.anchor.follow([{ id: ID }]);
  h.answer(1, () => BOX);
  h.anchor.follow([{ id: OTHER }]);
  assert.equal(h.anchor.box(), null);
  h.anchor.follow([]);
  assert.equal(h.anchor.box(), null);
});

test('the copies to locate: the chosen copies of a list item, else the element, at most 8', () => {
  assert.deepEqual(anchorTargets({ selection: [ID], copies: [{ id: ID, item: 2 }] }), [
    { id: ID, item: 2 },
  ]);
  assert.deepEqual(anchorTargets({ selection: [ID, OTHER, ID], copies: [] }), [
    { id: ID },
    { id: OTHER },
  ]);
  const copies = Array.from({ length: 12 }, (_, item) => ({ id: ID, item }));
  assert.equal(anchorTargets({ selection: [ID, OTHER], copies }).length, MAX_LOCATED);
});
