import assert from 'node:assert/strict';
import { test } from 'node:test';
import { type FitStep, pickStep } from '../../../../../client/studio/canvas/fit/steps.ts';

const gaps =
  (list: readonly number[]) =>
  (step: FitStep): number =>
    list[step] ?? 0;

test('the first step with room wins', () => {
  assert.equal(pickStep(gaps([40, 0, 0, 0])), 0);
  assert.equal(pickStep(gaps([5, 30, 0, 0])), 1);
  assert.equal(pickStep(gaps([-80, -20, 14, 0])), 2);
});

test('with no room at any step the last step stays', () => {
  assert.equal(pickStep(gaps([-80, -40, -20, 4])), 3);
});

test('a gap of exactly the minimum is enough, and the minimum can be changed', () => {
  assert.equal(pickStep(gaps([12, 0, 0, 0])), 0);
  assert.equal(pickStep(gaps([11, 12, 0, 0])), 1);
  assert.equal(pickStep(gaps([11, 20, 0, 0]), 24), 3);
  assert.equal(pickStep(gaps([11, 20, 0, 0]), 20), 1);
});

test('steps are measured in order and no further than the one that fits', () => {
  const asked: FitStep[] = [];
  pickStep((step) => {
    asked.push(step);
    return step === 1 ? 50 : 0;
  });
  assert.deepEqual(asked, [0, 1]);
});
