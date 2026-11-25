// A variant tried before it is offered (spec 4d, goal 2; plan 17, task B): pointing at or focusing
// a card previews its edits at its request's width and measures its elements; the answer becomes
// the card's check; leaving takes the preview back; a drag holds it back; a card being applied
// leaves its preview to the history and the build.

import assert from 'node:assert/strict';
import { test } from 'node:test';
import type { PreviewChange } from '../../../../../client/channel/edit-protocol.ts';
import type { LiveFact } from '../../../../../client/channel/live-protocol.ts';
import {
  createVariantPreview,
  measuringFrame,
  type Previewable,
  previewChanges,
  problemsOf,
  showsLater,
} from '../../../../../client/studio/edit/ai/preview.ts';
import type { Frame } from '../../../../../client/studio/frames.ts';
import type { EditOp } from '../../../../../src/edit/index.ts';

const ID = 'sections/Hero:section/Stack/Button';

const STYLE: EditOp = {
  op: 'setStyle',
  id: ID,
  className: 'cta',
  property: 'padding',
  value: { token: '--kit-space-md' },
  before: null,
  newRule: false,
};
const PROP: EditOp = {
  op: 'setProp',
  id: ID,
  name: 'variant',
  value: { kind: 'string', value: 'solid' },
  before: null,
  after: null,
};
const TEXT: EditOp = { op: 'setText', id: ID, value: 'Buy', before: 'Buy now' };

const CONTRAST: LiveFact = {
  id: ID,
  rule: 'contrast',
  severity: 'fix',
  values: { ratio: 2.1, needed: 4.5 },
};
const TARGET: LiveFact = {
  id: ID,
  rule: 'target-size',
  severity: 'review',
  values: { width: 20, height: 20 },
};

function harness(variants: Record<string, Previewable>) {
  const known = new Map(Object.entries(variants));
  const calls: string[] = [];
  const shows: { changes: PreviewChange[]; width: number | null }[] = [];
  const measured: { ids: string[]; width: number | null }[] = [];
  const shown: (string | null)[] = [];
  const allowed = { value: true };
  let requests = 0;
  const preview = createVariantPreview({
    show: (changes, width) => {
      calls.push('show');
      shows.push({ changes, width });
    },
    hide: () => {
      calls.push('hide');
    },
    measure: (ids, width) => {
      calls.push('measure');
      measured.push({ ids, width });
      requests += 1;
      return requests;
    },
    allowed: () => allowed.value,
    find: (key) => known.get(key) ?? null,
    shown: (key) => {
      shown.push(key);
    },
    checked: () => undefined,
  });
  return { preview, known, calls, shows, measured, shown, allowed };
}

test("pointing at a card previews it at its request's width and measures its elements", () => {
  const h = harness({ a: { ops: [STYLE], ids: [ID], width: 768 } });
  h.preview.point('a');
  assert.deepEqual(h.calls, ['show', 'measure']);
  assert.deepEqual(h.shows[0], {
    changes: [{ id: ID, kind: 'style', property: 'padding', value: 'var(--kit-space-md)' }],
    width: 768,
  });
  assert.deepEqual(h.measured[0], { ids: [ID], width: 768 });
  assert.deepEqual(h.shown, ['a']);
  assert.deepEqual(h.preview.check('a'), { state: 'running' });
  h.preview.facts(1, [TARGET, CONTRAST]);
  assert.deepEqual(h.preview.check('a'), {
    state: 'done',
    problems: [
      { severity: 'fix', message: 'live.fact.contrast' },
      { severity: 'review', message: 'live.fact.target' },
    ],
  });
  h.preview.point(null);
  assert.deepEqual(h.calls, ['show', 'measure', 'hide']);
  assert.deepEqual(h.shown, ['a', null]);
  assert.equal(h.preview.current(), null);
});

test("no problem is the check sign; an answer to another request is not the card's", () => {
  const h = harness({ a: { ops: [STYLE], ids: [ID], width: null } });
  h.preview.point('a');
  h.preview.facts(42, [CONTRAST]);
  assert.deepEqual(h.preview.check('a'), { state: 'running' });
  h.preview.facts(1, []);
  assert.deepEqual(h.preview.check('a'), { state: 'done', problems: [] });
});

test('leaving a card before its answer drops the running check', () => {
  const h = harness({ a: { ops: [STYLE], ids: [ID], width: null } });
  h.preview.point('a');
  h.preview.point(null);
  assert.equal(h.preview.check('a'), undefined);
  h.preview.facts(1, [CONTRAST]);
  assert.equal(h.preview.check('a'), undefined);
});

test('nothing is previewed during a drag; the card previews once the drag ended', () => {
  const h = harness({ a: { ops: [STYLE], ids: [ID], width: null } });
  h.allowed.value = false;
  h.preview.point('a');
  assert.deepEqual(h.calls, []);
  h.allowed.value = true;
  h.preview.refresh();
  assert.deepEqual(h.calls, ['show', 'measure']);
  // A drag that starts while it shows takes it back.
  h.allowed.value = false;
  h.preview.refresh();
  assert.deepEqual(h.calls, ['show', 'measure', 'hide']);
});

test('a card whose edits show only after the build is not measured: its checks come then', () => {
  const h = harness({ b: { ops: [PROP], ids: [ID], width: null } });
  h.preview.point('b');
  assert.deepEqual(h.calls, []);
  assert.deepEqual(h.preview.check('b'), { state: 'after' });
  assert.equal(showsLater([PROP]), true);
  assert.equal(showsLater([STYLE, TEXT]), false);
  assert.deepEqual(previewChanges([PROP, TEXT]), [{ id: ID, kind: 'text', value: 'Buy' }]);
});

test('the pointer wins over the focus; the focused card shows when the pointer leaves', () => {
  const h = harness({
    a: { ops: [STYLE], ids: [ID], width: null },
    b: { ops: [TEXT], ids: [ID], width: null },
  });
  h.preview.focus('a');
  h.preview.point('b');
  h.preview.point(null);
  assert.deepEqual(h.shown, ['a', 'b', 'a']);
  const once = ['show', 'measure'];
  assert.deepEqual(h.calls, [...once, 'hide', ...once, 'hide', ...once]);
});

test('a card being applied keeps its preview: the history and the build take it over', () => {
  const h = harness({ a: { ops: [STYLE], ids: [ID], width: null } });
  h.preview.point('a');
  h.preview.handOver('a');
  assert.deepEqual(h.calls, ['show', 'measure']);
  assert.deepEqual(h.shown, ['a', null]);
  // Nothing is shown again until the pointer comes back.
  h.preview.refresh();
  assert.deepEqual(h.calls, ['show', 'measure']);
});

test('a preview the frames lost is shown again while the card is still wanted', () => {
  const h = harness({ a: { ops: [STYLE], ids: [ID], width: null } });
  h.preview.lost();
  assert.deepEqual(h.calls, []);
  h.preview.point('a');
  h.preview.lost();
  assert.deepEqual(h.calls, ['show', 'measure', 'show', 'measure']);
  assert.equal(h.preview.current(), 'a');
});

test('a card that is no longer ready ends its preview when the cards are drawn again', () => {
  const h = harness({ a: { ops: [STYLE], ids: [ID], width: null } });
  h.preview.point('a');
  h.known.delete('a');
  h.preview.refresh();
  assert.deepEqual(h.calls, ['show', 'measure', 'hide']);
  assert.deepEqual(h.shown, ['a', null]);
});

test('new files forget every check', () => {
  const h = harness({ a: { ops: [STYLE], ids: [ID], width: null } });
  h.preview.point('a');
  h.preview.facts(1, []);
  h.preview.reset();
  assert.equal(h.preview.check('a'), undefined);
});

test('a held card wins over the pointed and the focused one, and stays when the pointer leaves', () => {
  const h = harness({
    a: { ops: [STYLE], ids: [ID], width: null },
    b: { ops: [TEXT], ids: [ID], width: null },
  });
  h.preview.focus('b');
  h.preview.hold('a');
  assert.deepEqual(h.shown, ['b', 'a']);
  h.preview.point('b');
  h.preview.point(null);
  // Neither the pointer coming nor going takes the held card off the canvas.
  assert.deepEqual(h.shown, ['b', 'a']);
  assert.equal(h.preview.current(), 'a');
  assert.equal(h.preview.held(), 'a');
  // Let go, the focused card shows again.
  h.preview.hold(null);
  assert.deepEqual(h.shown, ['b', 'a', 'b']);
  assert.equal(h.preview.held(), null);
});

test('holding the card already held changes nothing', () => {
  const h = harness({ a: { ops: [STYLE], ids: [ID], width: null } });
  h.preview.hold('a');
  h.preview.hold('a');
  assert.deepEqual(h.calls, ['show', 'measure']);
});

test('a card that cannot be shown is not held', () => {
  const h = harness({});
  h.preview.hold('a');
  assert.equal(h.preview.held(), null);
  assert.deepEqual(h.calls, []);
});

test('a drag holds a held card back; it shows again after, still held', () => {
  const h = harness({ a: { ops: [STYLE], ids: [ID], width: null } });
  h.preview.hold('a');
  h.allowed.value = false;
  h.preview.refresh();
  assert.equal(h.preview.current(), null);
  assert.equal(h.preview.held(), 'a');
  h.allowed.value = true;
  h.preview.refresh();
  assert.equal(h.preview.current(), 'a');
});

test('a build under a held card shows it again', () => {
  const h = harness({ a: { ops: [STYLE], ids: [ID], width: null } });
  h.preview.hold('a');
  h.preview.lost();
  assert.deepEqual(h.calls, ['show', 'measure', 'show', 'measure']);
  assert.equal(h.preview.current(), 'a');
});

test('new files under a held card end the hold once it is not ready, and it does not come back', () => {
  const h = harness({ a: { ops: [STYLE], ids: [ID], width: null } });
  const variant = h.known.get('a');
  h.preview.hold('a');
  h.preview.reset();
  // The elements are read again: the card is not ready for a moment.
  h.known.delete('a');
  h.preview.refresh();
  assert.equal(h.preview.held(), null);
  assert.deepEqual(h.shown, ['a', null]);
  if (variant) h.known.set('a', variant);
  h.preview.refresh();
  assert.equal(h.preview.current(), null);
});

test('applying the held card lets it go and leaves its preview to the history', () => {
  const h = harness({ a: { ops: [STYLE], ids: [ID], width: null } });
  h.preview.hold('a');
  h.preview.handOver('a');
  assert.equal(h.preview.held(), null);
  assert.deepEqual(h.calls, ['show', 'measure']);
  assert.deepEqual(h.shown, ['a', null]);
  h.preview.refresh();
  assert.deepEqual(h.calls, ['show', 'measure']);
});

test("a card's warnings: the fixes first, each words once, never the build's mismatch", () => {
  const mismatch: LiveFact = { id: ID, rule: 'mismatch', severity: 'review', values: {} };
  assert.deepEqual(problemsOf([TARGET, CONTRAST, CONTRAST, mismatch]), [
    { severity: 'fix', message: 'live.fact.contrast' },
    { severity: 'review', message: 'live.fact.target' },
  ]);
});

test('the card that measures is the first that shows the preview, the edit card first', () => {
  const frameOf = (channel: string, width: number): Frame => ({
    role: 'current',
    channel,
    element: { width: String(width) } as unknown as HTMLIFrameElement,
    ready: true,
  });
  const narrow = frameOf('narrow', 390);
  const wide = frameOf('wide', 1280);
  const widthOf = (frame: Frame): number => Number(frame.element.width);
  assert.equal(measuringFrame([narrow, wide], widthOf, 768), wide);
  assert.equal(measuringFrame([narrow, wide], widthOf, null), narrow);
  assert.equal(measuringFrame([narrow], widthOf, 1600), narrow);
  assert.equal(measuringFrame([narrow, wide], undefined, 768), narrow);
  assert.equal(measuringFrame([], widthOf, null), undefined);
});
