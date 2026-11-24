import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  askWords,
  type ElementStep,
  idIn,
  MAX_ASK,
  markOf,
  pointAt,
  pointsOf,
  type RestorePreview,
} from '../../../../../client/studio/edit/timeline/points.ts';

const ID = 'sections/Hero:section/Stack/Text';

const step = (version: number, over: Partial<ElementStep> = {}): ElementStep => ({
  version,
  id: ID,
  changed: false,
  unsure: false,
  ...over,
});

test('there is one point per version, oldest first, and the latest is now', () => {
  const points = pointsOf([3, 1, 2, 2], null, null);
  assert.deepEqual(
    points.map((point) => [point.version, point.now, point.shown, point.mark]),
    [
      [1, false, false, 'none'],
      [2, false, false, 'none'],
      [3, true, true, 'none'],
    ],
  );
  assert.deepEqual(pointsOf([], null, null), []);
});

test('the point of the version being viewed is the one shown', () => {
  const shown = pointsOf([1, 2, 3], 2, null).map((point) => point.shown);
  assert.deepEqual(shown, [false, true, false]);
});

test('the marks say where the selected element changed, was matched unsurely, or was absent', () => {
  const steps = [
    step(1, { id: null }),
    step(2, { changed: true, unsure: true }),
    step(3, { changed: true }),
    step(4),
  ];
  const marks = pointsOf([1, 2, 3, 4, 5], null, steps).map((point) => point.mark);
  // Version 5 has no step: nothing is known of it, so nothing is drawn.
  assert.deepEqual(marks, ['absent', 'unsure', 'changed', 'none', 'none']);
});

test('an unsure step that did not change draws no mark', () => {
  assert.equal(markOf(step(1, { unsure: true })), 'none');
  assert.equal(markOf(undefined), 'none');
});

test('a drag is over the nearest point of an evenly spread track', () => {
  assert.equal(pointAt(0, 300, 4), 0);
  assert.equal(pointAt(49, 300, 4), 0);
  assert.equal(pointAt(51, 300, 4), 1);
  assert.equal(pointAt(300, 300, 4), 3);
  assert.equal(pointAt(-40, 300, 4), 0);
  assert.equal(pointAt(900, 300, 4), 3);
  assert.equal(pointAt(120, 300, 1), 0);
  assert.equal(pointAt(120, 0, 3), 0);
  assert.equal(pointAt(120, 300, 0), -1);
});

test('the element can be brought back only from a version it was in', () => {
  const steps = [step(1, { id: null }), step(2, { id: `${ID}.2` }), step(3)];
  assert.equal(idIn(steps, 1), null);
  assert.equal(idIn(steps, 2), `${ID}.2`);
  assert.equal(idIn(steps, 7), null);
  assert.equal(idIn(steps, null), null);
  assert.equal(idIn(null, 2), null);
});

test('the request to Claude names the element, the version, the file and what is missing', () => {
  const preview: RestorePreview = {
    file: 'src/tsx/sections/Hero.tsx',
    old: '<Text>{label}</Text>',
    current: '<Text>Go</Text>',
    missing: ['label', 'glow (a prop of Button)'],
    imports: [],
    ops: null,
  };
  const words = askWords(ID, 2, preview);
  for (const part of [ID, 'version 2', preview.file, 'label, glow (a prop of Button)']) {
    assert.ok(words.includes(part), part);
  }
  const long = askWords(ID, 2, { ...preview, missing: ['x'.repeat(2 * MAX_ASK)] });
  assert.equal(long.length, MAX_ASK);
});
