import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  type Keyed,
  keyOf,
  patchPlan,
} from '../../../../../../client/studio/edit/props/panel/patch.ts';

const list = (...pairs: [string, string][]): Keyed[] =>
  pairs.map(([key, signature]) => ({ key, signature }));
const none: ReadonlySet<string> = new Set();

test('equal signatures keep the old node', () => {
  const plan = patchPlan(list(['a', '1'], ['b', '2']), list(['a', '1'], ['b', '2']), none);
  assert.deepEqual(plan.steps, [
    { key: 'a', take: 'old' },
    { key: 'b', take: 'old' },
  ]);
});

test('a row whose drawn value changed is never kept', () => {
  const plan = patchPlan(list(['a', '1']), list(['a', '2']), none);
  assert.deepEqual(plan.steps, [{ key: 'a', take: 'new' }]);
  assert.deepEqual(plan.stale, []);
});

test('a pinned key keeps the old node and is reported stale', () => {
  const plan = patchPlan(list(['a', '1']), list(['a', '2']), new Set(['a']));
  assert.deepEqual(plan.steps, [{ key: 'a', take: 'old' }]);
  assert.deepEqual(plan.stale, ['a']);
});

test('a pinned key that did not change is not stale', () => {
  const plan = patchPlan(list(['a', '1']), list(['a', '1']), new Set(['a']));
  assert.deepEqual(plan.stale, []);
});

test('keys only in the old list are dropped, the order follows the new list', () => {
  const plan = patchPlan(
    list(['a', '1'], ['b', '2'], ['c', '3']),
    list(['c', '3'], ['a', '1']),
    none,
  );
  assert.deepEqual(
    plan.steps.map((step) => step.key),
    ['c', 'a'],
  );
});

test('a key only in the new list takes the new node', () => {
  const plan = patchPlan(list(['a', '1']), list(['a', '1'], ['b', '2']), none);
  assert.deepEqual(plan.steps[1], { key: 'b', take: 'new' });
});

test('keyOf takes data-row, then the group, then tag, class and place', () => {
  assert.equal(keyOf({ row: 'style:gap', tag: 'DIV', className: 'k-row' }, 0), 'style:gap');
  assert.equal(keyOf({ group: 'layout', tag: 'SECTION', className: '' }, 1), 'section:layout');
  assert.equal(keyOf({ tag: 'P', className: 'props-hint' }, 2), 'P.props-hint@2');
});
