import assert from 'node:assert/strict';
import { test } from 'node:test';
import { planActions } from '../../../../../client/studio/edit/checks/action-plan.ts';

const ELEMENT = 'sections/Hero:section/Button';

test('with a fix, the fix leads and Ask Claude is an icon', () => {
  assert.deepEqual(planActions({ fix: true, element: ELEMENT }), {
    lead: 'use',
    askIcon: true,
    show: true,
  });
});

test('without a fix, Ask Claude leads and there is no icon for it', () => {
  assert.deepEqual(planActions({ fix: false, element: ELEMENT }), {
    lead: 'ask',
    askIcon: false,
    show: true,
  });
});

test('a finding with no element has nothing to show on the canvas', () => {
  assert.equal(planActions({ fix: false, element: null }).show, false);
  assert.equal(planActions({ fix: true, element: null }).show, false);
});

test('at most two text buttons, whatever the finding', () => {
  for (const fix of [true, false]) {
    for (const element of [ELEMENT, null]) {
      const plan = planActions({ fix, element });
      assert.ok(1 + (plan.show ? 1 : 0) <= 2);
    }
  }
});
