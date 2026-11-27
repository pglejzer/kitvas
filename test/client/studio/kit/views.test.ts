import assert from 'node:assert/strict';
import { test } from 'node:test';
import { type Part, shownParts } from '../../../../client/studio/kit/views.ts';

const PARTS: Part[] = [
  { id: 'kit-colors', items: ['--kit-color-ink #1d2025', '--kit-color-accent #b4571a'] },
  { id: 'kit-cat-action', items: ['Button Starts an action or submits a form.'] },
  { id: 'kit-icons', items: ['cart', 'bell', 'credit-card'] },
];

const shown = (current: string | undefined, query: string): string[] =>
  shownParts(PARTS, current, query)
    .parts.map((part, at) => (part.shown ? (PARTS[at]?.id ?? '') : ''))
    .filter((id) => id !== '');

test('without a query the current part shows with everything in it', () => {
  const state = shownParts(PARTS, 'kit-icons', '');
  assert.deepEqual(state.parts, [
    { shown: false, items: [true, true] },
    { shown: false, items: [true] },
    { shown: true, items: [true, true, true] },
  ]);
  assert.equal(state.nothing, false);
  assert.deepEqual(shown('kit-icons', '   '), ['kit-icons'], 'blanks are no query');
});

test('a query shows every part that holds a match, with its matches only', () => {
  const state = shownParts(PARTS, 'kit-colors', 'car');
  assert.deepEqual(state.parts, [
    { shown: false, items: [false, false] },
    { shown: false, items: [false] },
    { shown: true, items: [true, false, true] },
  ]);
  assert.deepEqual(shown('kit-colors', 'a'), ['kit-colors', 'kit-cat-action', 'kit-icons']);
});

test('a thing is found by any of its words, in any case, and by every typed word', () => {
  assert.deepEqual(shown('kit-icons', 'BUTTON'), ['kit-cat-action']);
  assert.deepEqual(shown('kit-icons', 'submits form'), ['kit-cat-action']);
  assert.deepEqual(shown('kit-icons', '#b4571a'), ['kit-colors']);
  assert.deepEqual(shown('kit-icons', 'button cart'), []);
});

test('a query that matches nowhere shows no part and says so', () => {
  const state = shownParts(PARTS, 'kit-colors', 'zzzz');
  assert.equal(state.nothing, true);
  assert.ok(state.parts.every((part) => !part.shown));
});

test('with no current part and no query nothing shows, and nothing is said', () => {
  const state = shownParts(PARTS, undefined, '');
  assert.ok(state.parts.every((part) => !part.shown));
  assert.equal(state.nothing, false);
});
