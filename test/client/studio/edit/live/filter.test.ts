// The filter of counts over the Checks list (plan 18, task D): its names, the counts its buttons
// carry, and the choice kept when the list is drawn again.

import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  CHECKS_FILTERS,
  countsOf,
  filterOf,
  keptFilter,
} from '../../../../../client/studio/edit/live/filter.ts';
import { CHECK_FILTERS } from '../../../../../src/studio/pages/draft/notes.ts';

test('the filters are the ones the server draws, in its order', () => {
  assert.deepEqual([...CHECKS_FILTERS], [...CHECK_FILTERS]);
});

test('a filter is read by its name; anything else is All', () => {
  for (const name of CHECKS_FILTERS) assert.equal(filterOf(name), name);
  for (const other of [undefined, null, '', 'ALL', 'waived']) assert.equal(filterOf(other), 'all');
});

test("the counts are the buttons' own; a missing or broken count is 0", () => {
  const counts = countsOf([
    { filter: 'all', count: '5' },
    { filter: 'fix', count: '3' },
    { filter: 'review', count: undefined },
    { filter: 'accepted', count: 'two' },
  ]);
  assert.deepEqual(counts, { all: 5, fix: 3, review: 0, accepted: 0 });
});

test('a choice stays while it has findings to show, else it falls back to All', () => {
  const counts = { all: 4, fix: 2, review: 0, accepted: 2 };
  assert.equal(keptFilter('fix', counts), 'fix');
  assert.equal(keptFilter('accepted', counts), 'accepted');
  assert.equal(keptFilter('review', counts), 'all');
  assert.equal(keptFilter('all', {}), 'all');
  assert.equal(keptFilter('fix', {}), 'all');
});
