import assert from 'node:assert/strict';
import { test } from 'node:test';
import { MAX_SELECTED } from '../../../../../client/channel/edit-protocol.ts';
import { rectSelection } from '../../../../../client/studio/edit/select/rect.ts';

const CARD = 'sections/Plans:section/Card';
const ASIDE = 'sections/Plans:section/aside';
const TITLE = 'sections/Plans:section/h2';

test('a rectangle selects what it took, in the order the frame gave', () => {
  assert.deepEqual(rectSelection([], [CARD, ASIDE], false), [CARD, ASIDE]);
  // What was selected before goes.
  assert.deepEqual(rectSelection([TITLE], [CARD, ASIDE], false), [CARD, ASIDE]);
  assert.deepEqual(rectSelection([CARD, TITLE], [ASIDE, CARD], false), [ASIDE, CARD]);
});

test('a rectangle that took nothing clears the selection', () => {
  assert.deepEqual(rectSelection([CARD, ASIDE], [], false), []);
  assert.deepEqual(rectSelection([], [], false), []);
});

test('with Shift, Ctrl or Cmd held the rectangle adds to the selection', () => {
  assert.deepEqual(rectSelection([TITLE], [CARD, ASIDE], true), [TITLE, CARD, ASIDE]);
  // One that is selected already keeps its place and is there once.
  assert.deepEqual(rectSelection([CARD, TITLE], [ASIDE, CARD], true), [CARD, TITLE, ASIDE]);
  // Nothing taken: the selection stays as it is.
  assert.deepEqual(rectSelection([CARD, TITLE], [], true), [CARD, TITLE]);
});

test('an id the frame names twice is selected once', () => {
  assert.deepEqual(rectSelection([], [CARD, CARD, ASIDE], false), [CARD, ASIDE]);
});

test('the selection never grows past what a select message carries', () => {
  const many = Array.from({ length: MAX_SELECTED }, (_, index) => `${CARD}.${index + 2}`);
  assert.equal(rectSelection([], many, false).length, MAX_SELECTED);
  const more = rectSelection([TITLE, ASIDE], many, true);
  assert.equal(more.length, MAX_SELECTED);
  // The ones already selected stay; the last ones taken do not fit.
  assert.deepEqual(more.slice(0, 3), [TITLE, ASIDE, `${CARD}.2`]);
  assert.equal(more.includes(`${CARD}.${MAX_SELECTED + 1}`), false);
});
