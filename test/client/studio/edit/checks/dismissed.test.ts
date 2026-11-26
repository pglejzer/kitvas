import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  type CardInfo,
  dismissLayout,
  insertionIndex,
} from '../../../../../client/studio/edit/checks/dismissed.ts';
import type { Waiver } from '../../../../../src/studio/api/waivers/waiver-schemas.ts';

const waiver = (rule: string, element: string | null): Waiver => ({
  rule,
  element,
  reason: 'Fine as it is',
  version: 1,
  at: '2026-11-26T10:00:00.000Z',
});

const card = (rule: string, element: string, tone: 'fix' | 'review' | null): CardInfo => ({
  key: { rule, element },
  tone,
});

const cards = [
  card('a11y/label', 'E1', 'fix'),
  card('ds/raw-color', 'E2', 'review'),
  card('ui/line-length', 'E3', 'review'),
  card('ds/raw-size', 'E4', 'review'),
];

test('nothing dismissed: every group keeps its cards and none is hidden', () => {
  const layout = dismissLayout(cards, []);
  assert.deepEqual(layout.dismissed, [false, false, false, false]);
  assert.deepEqual(layout.counts, { fix: 1, review: 3, accepted: 0 });
  assert.deepEqual(layout.shown, { fix: true, review: true, accepted: false });
});

test('one dismissed of several: its group is one less, the dismissed count one more', () => {
  const layout = dismissLayout(cards, [waiver('ds/raw-color', 'E2')]);
  assert.deepEqual(layout.dismissed, [false, true, false, false]);
  assert.deepEqual(layout.counts, { fix: 1, review: 2, accepted: 1 });
  assert.deepEqual(layout.shown, { fix: true, review: true, accepted: true });
});

test('the last card of a group dismissed: the group is hidden', () => {
  const layout = dismissLayout(cards, [waiver('a11y/label', 'E1')]);
  assert.deepEqual(layout.counts, { fix: 0, review: 3, accepted: 1 });
  assert.deepEqual(layout.shown, { fix: false, review: true, accepted: true });
});

test('a restore: the waiver gone, the card counts in its group again', () => {
  const waivers = [waiver('ds/raw-color', 'E2'), waiver('ds/raw-size', 'E4')];
  assert.equal(dismissLayout(cards, waivers).counts.review, 1);
  const restored = dismissLayout(cards, [waiver('ds/raw-size', 'E4')]);
  assert.deepEqual(restored.counts, { fix: 1, review: 2, accepted: 1 });
});

test('a waiver for a finding that is not in the list changes nothing', () => {
  const layout = dismissLayout(cards, [waiver('ds/raw-color', 'E99'), waiver('x/y', null)]);
  assert.deepEqual(layout.counts, { fix: 1, review: 3, accepted: 0 });
  assert.deepEqual(layout.dismissed, [false, false, false, false]);
});

test('a card the server drew as dismissed stays dismissed, with or without a waiver', () => {
  const drawn = [...cards, card('ds/raw-color', 'E5', null)];
  const layout = dismissLayout(drawn, []);
  assert.equal(layout.dismissed[4], true);
  assert.deepEqual(layout.counts, { fix: 1, review: 3, accepted: 1 });
});

test('all dismissed: both groups hide', () => {
  const all = cards.map((one) => waiver(one.key?.rule ?? '', one.key?.element ?? null));
  const layout = dismissLayout(cards, all);
  assert.deepEqual(layout.shown, { fix: false, review: false, accepted: true });
  assert.equal(layout.counts.accepted, 4);
});

test('a restored card goes back by its number', () => {
  assert.equal(insertionIndex([1, 3, 4], 2), 1);
  assert.equal(insertionIndex([2, 3], 1), 0);
  assert.equal(insertionIndex([1, 2], 5), 2);
  assert.equal(insertionIndex([], 1), 0);
});
