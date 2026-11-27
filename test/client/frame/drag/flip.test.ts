import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  type Box,
  EASING,
  type Entry,
  FADE_MS,
  MAX_MOVING,
  MOTION_MS,
  type MotionFacts,
  type MotionPlan,
  motionKind,
  planMotion,
  prefersLessMotion,
  type Step,
  startBox,
  stepTo,
  stepTransform,
} from '../../../../client/frame/drag/motion/flip.ts';

const box = (left: number, top: number, width: number, height: number): Box => ({
  left,
  top,
  width,
  height,
});

const step = (x: number, y: number, sx: number, sy: number): Step => ({ x, y, sx, sy });

const entry = (
  first: Box | undefined,
  last: Box,
  parent = -1,
  kind: Entry['kind'] = 'full',
): Entry => ({ parent, first, last, kind });

const facts = (fields: Partial<MotionFacts> = {}): MotionFacts => ({
  display: 'block',
  replaced: false,
  transformable: true,
  transformed: false,
  pinned: false,
  ...fields,
});

/** `target` under `played`, by an element laid out at `origin` (origin at its corner). */
function apply(played: Step, origin: Box, target: Box): Box {
  return {
    left: origin.left + played.sx * (target.left - origin.left) + played.x,
    top: origin.top + played.sy * (target.top - origin.top) + played.y,
    width: target.width * played.sx,
    height: target.height * played.sy,
  };
}

/** Where the entry at `index` shows when the motion starts: its own step, then its parents'. */
function seenAtStart(entries: Entry[], plan: MotionPlan, index: number): Box {
  const steps = new Map(plan.moves.map((move) => [move.index, move.step]));
  let shown = entries[index]?.last ?? box(0, 0, 0, 0);
  for (let at = index; at >= 0; at = entries[at]?.parent ?? -1) {
    const played = steps.get(at);
    const laid = entries[at]?.last;
    if (played && laid) shown = apply(played, laid, shown);
  }
  return shown;
}

function assertNear(actual: Box, expected: Box, label: string): void {
  for (const side of ['left', 'top', 'width', 'height'] as const) {
    assert.ok(Math.abs(actual[side] - expected[side]) < 1e-9, `${label} ${side}`);
  }
}

const movedIndexes = (entries: Entry[]): number[] =>
  planMotion(entries).moves.map((move) => move.index);

test('the motion follows the kit: 240 ms, ease-out, a 140 ms fade for less motion', () => {
  assert.equal(MOTION_MS, 240);
  assert.equal(FADE_MS, 140);
  assert.equal(EASING, 'ease-out');
});

test('block boxes slide and resize, inline boxes only slide, others are carried', () => {
  assert.equal(motionKind(facts()), 'full');
  assert.equal(motionKind(facts({ display: 'flex' })), 'full');
  assert.equal(motionKind(facts({ display: 'grid' })), 'full');
  assert.equal(motionKind(facts({ display: 'list-item' })), 'full');
  assert.equal(motionKind(facts({ display: 'table-row' })), 'full');
  assert.equal(motionKind(facts({ display: 'inline-block' })), 'move');
  assert.equal(motionKind(facts({ display: 'inline-flex' })), 'move');
  assert.equal(motionKind(facts({ display: 'inline', replaced: true })), 'move');
  assert.equal(motionKind(facts({ display: 'inline' })), 'none');
  assert.equal(motionKind(facts({ display: 'none' })), 'none');
  assert.equal(motionKind(facts({ display: 'contents' })), 'none');
  assert.equal(motionKind(facts({ transformed: true })), 'none');
  assert.equal(motionKind(facts({ pinned: true })), 'none');
  assert.equal(motionKind(facts({ transformable: false })), 'none');
});

test('a sliding-only element starts at its old corner with its new size', () => {
  const first = box(10, 20, 100, 40);
  const last = box(50, 60, 140, 30);
  assert.deepEqual(startBox(first, last, 'full'), first);
  assert.deepEqual(startBox(first, last, 'move'), box(10, 20, 140, 30));
});

test('a step goes from the new box back to the old one; under half a pixel it is none', () => {
  assert.equal(stepTo(box(0, 0, 100, 40), box(0, 0, 100, 40)), undefined);
  assert.equal(stepTo(box(0, 0, 100, 40), box(0.3, -0.4, 100.2, 40)), undefined);
  assert.deepEqual(stepTo(box(0, 100, 100, 50), box(0, 0, 100, 50)), step(0, -100, 1, 1));
  assert.deepEqual(stepTo(box(0, 0, 200, 100), box(0, 0, 100, 50)), step(0, 0, 0.5, 0.5));
  assert.deepEqual(stepTo(box(0, 0, 0, 10), box(5, 0, 30, 10)), step(5, 0, 1, 1));
  assert.deepEqual(stepTo(box(0, 0, 1000, 10), box(0, 0, 1, 10)), step(0, 0, 0.02, 1));
});

test('a moved element gets one step back to where it was', () => {
  const plan = planMotion([entry(box(0, 0, 100, 50), box(0, 100, 100, 50))]);
  assert.deepEqual(plan, {
    moves: [{ index: 0, step: step(0, -100, 1, 1) }],
    fades: [],
    crowded: false,
  });
});

test('a child that moved with its parent needs no step of its own', () => {
  const entries = [
    entry(box(0, 0, 100, 100), box(0, 50, 100, 100)),
    entry(box(10, 10, 20, 20), box(10, 60, 20, 20), 0),
  ];
  assert.deepEqual(movedIndexes(entries), [0]);
});

test('a child that stayed while its parent moved gets the opposite step', () => {
  const entries = [
    entry(box(0, 0, 100, 200), box(0, 50, 100, 200)),
    entry(box(10, 60, 20, 20), box(10, 60, 20, 20), 0),
  ];
  const plan = planMotion(entries);
  assert.deepEqual(plan.moves[1], { index: 1, step: step(0, 50, 1, 1) });
  assertNear(seenAtStart(entries, plan, 1), box(10, 60, 20, 20), 'child');
});

test('an inline child of a resized parent keeps its size: the parent scale is undone', () => {
  const entries = [
    entry(box(0, 0, 200, 100), box(0, 0, 100, 100)),
    entry(box(10, 10, 40, 20), box(10, 10, 40, 20), 0, 'move'),
  ];
  const plan = planMotion(entries);
  assert.deepEqual(plan.moves, [
    { index: 0, step: step(0, 0, 2, 1) },
    { index: 1, step: step(-5, 0, 0.5, 1) },
  ]);
  assertNear(seenAtStart(entries, plan, 1), box(10, 10, 40, 20), 'inline child');
});

test('through any nesting, every element starts exactly where it was seen', () => {
  const entries = [
    entry(box(0, 0, 300, 300), box(100, 50, 150, 320)),
    entry(box(20, 20, 100, 100), box(120, 70, 80, 120), 0),
    entry(box(30, 40, 50, 20), box(200, 200, 60, 20), 1, 'move'),
    entry(box(5, 400, 30, 30), box(5, 420, 30, 30), -1, 'move'),
    entry(box(130, 80, 10, 10), box(150, 90, 12, 12), 1),
    entry(box(131, 81, 4, 4), box(151, 91, 4, 4), 4, 'none'),
    entry(box(132, 82, 2, 2), box(152, 92, 4, 4), 5),
  ];
  const plan = planMotion(entries);
  assert.equal(plan.crowded, false);
  assert.deepEqual(plan.fades, []);
  assert.deepEqual(movedIndexes(entries), [0, 1, 2, 3, 4, 6]);
  for (const [index, item] of entries.entries()) {
    if (item.kind === 'none' || !item.first) continue;
    const expected = startBox(item.first, item.last, item.kind);
    assertNear(seenAtStart(entries, plan, index), expected, `entry ${index}`);
  }
});

test('an element without a motion of its own is carried by its parents', () => {
  const entries = [
    entry(box(0, 0, 100, 100), box(0, 40, 100, 100)),
    entry(box(10, 10, 20, 10), box(10, 50, 20, 10), 0, 'none'),
    entry(box(12, 12, 5, 5), box(12, 52, 5, 5), 1),
  ];
  assert.deepEqual(movedIndexes(entries), [0]);
});

test('new elements fade in, once for a new element and everything new inside it', () => {
  const entries = [
    entry(undefined, box(0, 0, 100, 100)),
    entry(undefined, box(10, 10, 20, 20), 0),
    entry(box(0, 0, 0, 0), box(0, 200, 50, 50)),
    entry(box(0, 0, 10, 10), box(0, 0, 0, 0)),
    entry(undefined, box(0, 0, 0, 0)),
  ];
  assert.deepEqual(planMotion(entries), { moves: [], fades: [0, 2], crowded: false });
});

test('too many moving parts make the plan crowded', () => {
  const moved = (count: number): Entry[] =>
    Array.from({ length: count }, (_, index) =>
      entry(box(0, index * 10, 10, 10), box(0, index * 10 + 5, 10, 10)),
    );
  assert.equal(planMotion(moved(MAX_MOVING)).crowded, false);
  assert.equal(planMotion(moved(MAX_MOVING + 1)).crowded, true);
});

test('a step is written as one CSS transform, with no -0 and a few decimals', () => {
  assert.equal(stepTransform(step(0, -100, 1, 1)), 'translate(0px, -100px) scale(1, 1)');
  assert.equal(
    stepTransform(step(-0.0001, 12.34567, 0.333333333, 2)),
    'translate(0px, 12.346px) scale(0.33333, 2)',
  );
});

test('less motion applies only when the viewer asks for it', () => {
  assert.equal(prefersLessMotion(undefined), false);
  assert.equal(
    prefersLessMotion(() => ({ matches: false })),
    false,
  );
  const asked: string[] = [];
  const match = (query: string) => {
    asked.push(query);
    return { matches: true };
  };
  assert.equal(prefersLessMotion(match), true);
  assert.deepEqual(asked, ['(prefers-reduced-motion: reduce)']);
});
