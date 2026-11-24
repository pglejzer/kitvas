import assert from 'node:assert/strict';
import { test } from 'node:test';
import { EDITOR_STATE, heavier, specificity } from '../../../../client/frame/live/specificity.ts';

test('ids, then classes, attributes and pseudo-classes, then types and pseudo-elements', () => {
  assert.deepEqual(specificity('#main'), [1, 0, 0]);
  assert.deepEqual(specificity('.a.b[data-x="1"]:hover'), [0, 4, 0]);
  assert.deepEqual(specificity('ul li::before'), [0, 0, 3]);
  assert.deepEqual(specificity('nav > a.link ~ span'), [0, 1, 3]);
  assert.deepEqual(specificity('*'), [0, 0, 0]);
});

test("the editor's own state rule weighs one class and one pseudo-class", () => {
  assert.deepEqual(specificity('.button:hover'), EDITOR_STATE);
  assert.deepEqual(specificity('.button[data-kv-force~="hover"]'), EDITOR_STATE);
  // Tailwind's escaped class counts once.
  assert.deepEqual(specificity('.md\\:hover\\:bg-ink:hover'), EDITOR_STATE);
});

test("a kit's state rule with :not(:disabled) outweighs the editor's", () => {
  const kit = specificity('.kit-button--outline[data-kv-force~="hover"]:not(:disabled)');
  assert.deepEqual(kit, [0, 3, 0]);
  assert.equal(heavier(kit, EDITOR_STATE), true);
  assert.equal(heavier(EDITOR_STATE, EDITOR_STATE), false);
});

test(':is, :not and :has weigh their heaviest argument; :where weighs nothing', () => {
  assert.deepEqual(specificity(':is(.a, #b) span'), [1, 0, 1]);
  assert.deepEqual(specificity('a:not(.x, .y.z)'), [0, 2, 1]);
  assert.deepEqual(specificity(':where(#b .c) .d'), [0, 1, 0]);
  assert.deepEqual(specificity('li:nth-child(2n of .on)'), [0, 2, 1]);
  assert.deepEqual(specificity('[title="a, b (c)"]'), [0, 1, 0]);
});
