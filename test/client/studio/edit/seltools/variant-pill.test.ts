// The variant pill's rules (redesign spec, goal 11; plan 19, task 4): it opens on the first ready
// variant and holds it on the canvas; previous and next go round; pointing at another card moves
// it; a variant that is not ready is named with its card's reason and held by no one; Discard
// closes it until the selection changes; an out-of-date or applied request has no pill.

import assert from 'node:assert/strict';
import { test } from 'node:test';
import type { VariantRef } from '../../../../../client/studio/edit/ai/control.ts';
import {
  PILL_START,
  type PillInput,
  type PillMemory,
  type PillOutcome,
  pillDiscarded,
  pillOf,
  pillStepped,
  reasonOf,
} from '../../../../../client/studio/edit/seltools/variant-pill.ts';

const ref = (request: string, index: number, ready = true, reason: string | null = null) => ({
  key: `${request}#${index}`,
  request,
  index,
  label: `Variant ${index}`,
  ready,
  reason,
});

const BUTTON = 'sections/Hero:section/Button';
const TEXT = 'sections/Hero:section/Text';
const TWO: VariantRef[] = [ref('r1', 0), ref('r1', 1)];

const input = (over: Partial<PillInput> = {}): PillInput => ({
  open: true,
  selection: BUTTON,
  refs: TWO,
  shown: null,
  ...over,
});

/** The pill after each input in turn, the canvas showing what the pill held. */
function run(steps: readonly Partial<PillInput>[], from: PillMemory = PILL_START): PillOutcome {
  let memory = from;
  let out: PillOutcome = { memory, view: null, hold: null };
  for (const step of steps) {
    out = pillOf(memory, input(step));
    memory = out.memory;
  }
  return out;
}

test('the pill opens on the first ready variant and holds it on the canvas', () => {
  const refs = [ref('r1', 0, false, 'Reading the elements…'), ref('r1', 1), ref('r1', 2)];
  const out = pillOf(PILL_START, input({ refs }));
  assert.equal(out.view?.index, 1);
  assert.equal(out.view?.count, 3);
  assert.equal(out.hold, 'r1#1');
});

test('with no variant ready it names the first, holds nothing, and says why', () => {
  const refs = [ref('r1', 0, false, 'Reading the elements…'), ref('r1', 1, false)];
  const out = pillOf(PILL_START, input({ refs }));
  assert.equal(out.view?.index, 0);
  assert.equal(out.view?.reason, 'Reading the elements…');
  assert.equal(out.hold, null);
});

test('previous and next go round the ends, and the step is not undone by the canvas', () => {
  const first = pillOf(PILL_START, input({ shown: null }));
  // The canvas now shows what the pill held.
  const held = pillOf(first.memory, input({ shown: { request: 'r1', index: 0 } }));
  const back = pillStepped(held.memory, 2, -1);
  assert.equal(back.index, 1);
  // The canvas still shows variant 0 until the hold moves: the pill stays on 1.
  const stepped = pillOf(back, input({ shown: { request: 'r1', index: 0 } }));
  assert.equal(stepped.view?.index, 1);
  assert.equal(stepped.hold, 'r1#1');
  assert.equal(pillStepped(stepped.memory, 2, 1).index, 0);
});

test('pointing at another card of the request in the tab moves the pill to it', () => {
  const out = run([
    { shown: null },
    { shown: { request: 'r1', index: 0 } },
    { shown: { request: 'r1', index: 1 } },
  ]);
  assert.equal(out.view?.index, 1);
  assert.equal(out.hold, 'r1#1');
  // A card of another request is not the pill's.
  const other = pillOf(out.memory, input({ shown: { request: 'r9', index: 0 } }));
  assert.equal(other.view?.index, 1);
});

test('Discard closes the pill for that selection; another selection and back opens it again', () => {
  const open = run([{}]);
  const discarded = pillDiscarded(open.memory);
  const same = pillOf(discarded, input());
  assert.equal(same.view, null);
  assert.equal(same.hold, null);
  // Still the same selection a moment later: still no pill.
  const later = pillOf(same.memory, input());
  assert.equal(later.view, null);
  const away = pillOf(later.memory, input({ selection: TEXT, refs: [] }));
  assert.equal(away.view, null);
  const again = pillOf(away.memory, input());
  assert.equal(again.view?.index, 0);
  assert.equal(again.hold, 'r1#0');
});

test('a newer answer for the same selection brings the pill back after a Discard', () => {
  const discarded = pillDiscarded(run([{}]).memory);
  const newer = pillOf(discarded, input({ refs: [ref('r2', 0)] }));
  assert.equal(newer.view?.ref.request, 'r2');
});

test('no pill and no hold when it may not show, or when the request is out of date or applied', () => {
  const open = run([{}]);
  // The lens is not Design, or Edit is off: `open` is false.
  assert.deepEqual(pillOf(open.memory, input({ open: false })).hold, null);
  assert.equal(pillOf(open.memory, input({ open: false })).view, null);
  // `variantsFor` answers none for a request that is out of date or applied.
  assert.equal(pillOf(open.memory, input({ refs: [] })).view, null);
});

test('another selection starts at its own first ready variant', () => {
  const stepped = pillStepped(run([{}]).memory, 2, 1);
  const other = pillOf(stepped, input({ selection: TEXT, refs: [ref('r3', 0), ref('r3', 1)] }));
  assert.equal(other.view?.index, 0);
});

test("the card's reason rides beside the control's fields", () => {
  const words = 'Go back to now to try it.';
  assert.equal(reasonOf(ref('r1', 0, false, words)), words);
  const bare: VariantRef = { key: 'r1#0', request: 'r1', index: 0, label: 'A', ready: false };
  assert.equal(reasonOf(bare), null);
});
