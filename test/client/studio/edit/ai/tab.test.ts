// The words of a variant's card (spec 4d, goal 2; plan 17, task B; plan 19, task 4): its state line
// while it can be tried, and why it cannot be applied now, which the variant pill's Apply says
// too. Outside a page every text shows as its key.

import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  type CardModel,
  reasonWords,
  stateKeyOf,
} from '../../../../../client/studio/edit/ai/tab.ts';

const ID = 'sections/Hero:section/Stack/Button';

const card = (over: Partial<CardModel> = {}): CardModel => ({
  key: 'r1#0',
  label: 'Roomier',
  number: 1,
  changes: 1,
  chips: [],
  built: { kind: 'ready', ids: [ID], ops: [], dropsText: false, offKit: false },
  outdated: false,
  applied: false,
  blocked: null,
  later: false,
  nameOf: () => 'Button',
  ...over,
});

test('a card that can be tried says whether the canvas shows it now', () => {
  assert.equal(stateKeyOf(card(), true), 'ai.variant.onCanvas');
  assert.equal(stateKeyOf(card(), false), 'ai.variant.hover');
  assert.equal(stateKeyOf(card({ blocked: 'ai.blocked.edit' }), false), null);
});

test('a ready card has no reason; every other one says why it cannot be applied', () => {
  assert.equal(reasonWords(card()), null);
  assert.equal(reasonWords(card({ built: { kind: 'loading', ids: [ID] } })), 'ai.variant.loading');
  assert.equal(reasonWords(card({ built: { kind: 'same', ids: [ID] } })), 'ai.variant.same');
  assert.equal(reasonWords(card({ blocked: 'ai.blocked.viewing' })), 'ai.blocked.viewing');
  assert.equal(reasonWords(card({ outdated: true })), 'ai.stale');
  assert.equal(reasonWords(card({ applied: true })), 'ai.variant.applied');
  const invalid = card({
    built: { kind: 'invalid', ids: [ID], problem: { change: 0, id: ID, reason: 'gone' } },
  });
  assert.equal(reasonWords(invalid), 'ai.variant.invalid ai.variant.problem');
});
