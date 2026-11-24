import assert from 'node:assert/strict';
import { test } from 'node:test';
import type { LiveFact } from '../../../../client/channel/live-protocol.ts';
import {
  type BoxSample,
  boxFacts,
  contrastFact,
  keepWorst,
  mismatchFact,
  targetFact,
} from '../../../../client/frame/live/measure.ts';

const ID = 'sections/Hero:section/p';
const GREY = { r: 119, g: 119, b: 119, a: 1 };
const WHITE = { r: 255, g: 255, b: 255, a: 1 };

const box = (patch: Partial<BoxSample> = {}): BoxSample => ({
  clientWidth: 200,
  clientHeight: 40,
  scrollWidth: 200,
  scrollHeight: 40,
  overflowX: 'visible',
  overflowY: 'visible',
  text: true,
  truncates: false,
  ...patch,
});

test('text below AA is a fix with its ratio, the ratio it needs and both colours', () => {
  assert.deepEqual(contrastFact(ID, { color: GREY, background: WHITE, px: 16, weight: 400 }), {
    id: ID,
    rule: 'contrast',
    severity: 'fix',
    values: {
      ratio: 4.47,
      needed: 4.5,
      color: 'rgb(119, 119, 119)',
      background: 'rgb(255, 255, 255)',
    },
  });
});

test('the same grey passes as large text, and so does text that meets AA', () => {
  assert.equal(contrastFact(ID, { color: GREY, background: WHITE, px: 24, weight: 400 }), null);
  assert.equal(contrastFact(ID, { color: GREY, background: WHITE, px: 19, weight: 700 }), null);
  const ink = { r: 29, g: 32, b: 37, a: 1 };
  assert.equal(contrastFact(ID, { color: ink, background: WHITE, px: 13, weight: 400 }), null);
});

test('an interactive element under 24 by 24 px is a target to review', () => {
  assert.deepEqual(targetFact(ID, { width: 20.04, height: 40 }), {
    id: ID,
    rule: 'target-size',
    severity: 'review',
    values: { width: 20, height: 40 },
  });
  assert.equal(targetFact(ID, { width: 24, height: 24 }), null);
});

test('content wider than a box it spills out of is an overflow', () => {
  assert.deepEqual(boxFacts(ID, box({ scrollWidth: 260 })), [
    { id: ID, rule: 'overflow', severity: 'review', values: { width: 200, content: 260 } },
  ]);
  // A pixel of rounding is not a finding.
  assert.deepEqual(boxFacts(ID, box({ scrollWidth: 201 })), []);
});

test('text cut by an overflow that hides is clipped, unless it is cut on purpose', () => {
  assert.deepEqual(boxFacts(ID, box({ overflowX: 'hidden', scrollWidth: 260 })), [
    { id: ID, rule: 'clipped', severity: 'review', values: { width: 200, height: 40 } },
  ]);
  assert.equal(boxFacts(ID, box({ overflowY: 'clip', scrollHeight: 90 })).length, 1);
  const cut = { overflowX: 'hidden', scrollWidth: 260 };
  assert.deepEqual(boxFacts(ID, box({ ...cut, truncates: true })), []);
  assert.deepEqual(boxFacts(ID, box({ ...cut, text: false })), []);
  // A box that scrolls shows all of it.
  assert.deepEqual(boxFacts(ID, box({ overflowX: 'auto', scrollWidth: 260 })), []);
});

test('a box of a pixel or less is a visually hidden label, never a finding', () => {
  const hidden = box({ clientWidth: 1, clientHeight: 1, scrollWidth: 80, overflowX: 'hidden' });
  assert.deepEqual(boxFacts(ID, hidden), []);
});

test('the build is held against what the editor showed, white space aside', () => {
  assert.deepEqual(mismatchFact(ID, 'padding', '24px', '16px'), {
    id: ID,
    rule: 'mismatch',
    severity: 'review',
    values: { property: 'padding', expected: '24px', actual: '16px' },
  });
  assert.equal(mismatchFact(ID, 'padding', '24px  8px', ' 24px 8px'), null);
});

test('one fact per element and rule is kept, the worst contrast, and per property for builds', () => {
  const contrast = (ratio: number, id = ID): LiveFact => ({
    id,
    rule: 'contrast',
    severity: 'fix',
    values: { ratio, needed: 4.5 },
  });
  const other = 'sections/Hero:section/h1';
  const padding = mismatchFact(ID, 'padding', '24px', '16px');
  const gap = mismatchFact(ID, 'gap', '8px', '4px');
  assert.ok(padding && gap);
  const kept = keepWorst([contrast(4.1), contrast(2.2), contrast(3.3, other), padding, gap]);
  assert.deepEqual(
    kept.map((fact) => [fact.id, fact.rule, fact.values.ratio ?? fact.values.property]),
    [
      [ID, 'contrast', 2.2],
      [other, 'contrast', 3.3],
      [ID, 'mismatch', 'padding'],
      [ID, 'mismatch', 'gap'],
    ],
  );
});
