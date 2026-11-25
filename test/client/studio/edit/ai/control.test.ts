// The ports of the tools on the canvas (plan 19, task 0): the Claude tab's control, the way to the
// ask bar and the variant pill's step. Each is off until its owner says how.

import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  type AiControl,
  aiControl,
  setAiControl,
} from '../../../../../client/studio/edit/ai/control.ts';
import { focusAsk, setAskFocus } from '../../../../../client/studio/edit/ask/focus.ts';
import { setVariantStep, stepVariant } from '../../../../../client/studio/edit/seltools/step.ts';

test('there is no control until the Claude tab sets one, and none again once it is taken away', () => {
  assert.equal(aiControl(), null);
  const control: AiControl = {
    send: async () => true,
    improve: async () => false,
    variantsFor: () => [],
    show: () => {},
    apply: async () => false,
    onChange: () => () => {},
  };
  setAiControl(control);
  assert.equal(aiControl(), control);
  setAiControl(null);
  assert.equal(aiControl(), null);
});

test('with no ask bar the key does nothing; with one, the bar says whether it took the cursor', () => {
  assert.equal(focusAsk(), false);
  let asked = 0;
  setAskFocus(() => {
    asked += 1;
    return asked === 1;
  });
  assert.equal(focusAsk(), true);
  // The bar is off the second time (nothing selected, say): the key stays the page's.
  assert.equal(focusAsk(), false);
  assert.equal(asked, 2);
  setAskFocus(null);
  assert.equal(focusAsk(), false);
});

test('with no variant pill an arrow is free; with one, it steps by the way it was pressed', () => {
  assert.equal(stepVariant(1), false);
  const steps: number[] = [];
  setVariantStep((by) => {
    steps.push(by);
    return true;
  });
  assert.equal(stepVariant(-1), true);
  assert.equal(stepVariant(1), true);
  assert.deepEqual(steps, [-1, 1]);
  setVariantStep(null);
  assert.equal(stepVariant(-1), false);
});
