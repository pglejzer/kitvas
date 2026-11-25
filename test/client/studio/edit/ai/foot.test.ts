// The Claude tab's foot (plan 18, task D): which chosen variant Apply acts on, and when it can.

import assert from 'node:assert/strict';
import { test } from 'node:test';
import { chosenOf } from '../../../../../client/studio/edit/ai/foot.ts';
import type { CardModel } from '../../../../../client/studio/edit/ai/tab.ts';

const card = (over: Partial<CardModel> = {}): CardModel => ({
  key: 'r1:1',
  label: 'Roomier',
  number: 1,
  changes: 2,
  chips: [],
  built: { kind: 'ready', ids: [], ops: [], dropsText: false, offKit: false },
  outdated: false,
  applied: false,
  blocked: null,
  later: false,
  nameOf: (id) => id,
  ...over,
});
const drawn = (model: CardModel, index = 1) => new Map([[model.key, { model, index }]]);

test('the chosen card is the one Apply acts on, by its number in its answer', () => {
  assert.deepEqual(chosenOf('r1:1', drawn(card())), {
    key: 'r1:1',
    number: 2,
    label: 'Roomier',
    ready: true,
  });
});

test('nothing is chosen when no card is, or the chosen one is gone, applied or out of date', () => {
  assert.equal(chosenOf(null, drawn(card())), null);
  assert.equal(chosenOf('r2:0', drawn(card())), null);
  assert.equal(chosenOf('r1:1', drawn(card({ applied: true }))), null);
  assert.equal(chosenOf('r1:1', drawn(card({ outdated: true }))), null);
});

test('a chosen card that is not built, or that something blocks, cannot be applied yet', () => {
  const loading = card({ built: { kind: 'loading', ids: [] } });
  assert.equal(chosenOf('r1:1', drawn(loading))?.ready, false);
  const blocked = card({ blocked: 'ai.blocked.edit' });
  assert.equal(chosenOf('r1:1', drawn(blocked))?.ready, false);
});
