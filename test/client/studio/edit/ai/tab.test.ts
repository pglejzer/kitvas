// The AI tab's form hint (spec 4d, goal 2; plan 17, task B): what a request will be about, or why
// none can be made now.

import assert from 'node:assert/strict';
import { test } from 'node:test';
import { formHint } from '../../../../../client/studio/edit/ai/tab.ts';

test('the hint names the selection a request is about', () => {
  assert.deepEqual(formHint({ selected: 1, blocked: null }), { key: 'ai.forOne', params: {} });
  assert.deepEqual(formHint({ selected: 3, blocked: null }), {
    key: 'ai.forMany',
    params: { n: 3 },
  });
});

test('with nothing selected, or an older version shown, the hint says why nothing is sent', () => {
  assert.equal(formHint({ selected: 0, blocked: null }).key, 'ai.noSelection');
  assert.equal(formHint({ selected: 2, blocked: 'ai.viewing' }).key, 'ai.viewing');
});
