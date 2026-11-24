// The evidence line of a finding (plan 18, task D): what it measured, read by its values, and its
// message when it measured nothing the card can show.

import assert from 'node:assert/strict';
import { test } from 'node:test';
import { MIN_TARGET } from '../../../../../client/studio/edit/live/colour.ts';
import {
  evidenceName,
  evidenceOf,
  ratioWords,
} from '../../../../../client/studio/edit/live/evidence.ts';

const MESSAGE = 'The finding in words.';
const of = (values: Record<string, string | number> | null) =>
  evidenceOf({ message: MESSAGE, values });

test('a contrast finding shows its ratio against the ratio it needs', () => {
  const contrast = { kind: 'contrast', ratio: 2.93, needed: 4.5 };
  assert.deepEqual(of({ ratio: 2.93, needed: 4.5 }), contrast);
  // A number written as a string counts as the number.
  assert.deepEqual(of({ ratio: '2.93', needed: '4.5' }), contrast);
});

test('a target shows its size against the least size a pointer has to hit', () => {
  const target = { kind: 'target', width: 18, height: 20, min: MIN_TARGET };
  assert.deepEqual(of({ width: 18, height: 20 }), target);
});

test('an overflow shows the content against the width of its box', () => {
  const overflow = { kind: 'overflow', content: 412, width: 390 };
  assert.deepEqual(of({ content: 412, width: 390 }), overflow);
});

test('a mismatch shows the value the build has where the editor showed another', () => {
  const mismatch = { kind: 'mismatch', property: 'gap', expected: '16px', actual: '8px' };
  assert.deepEqual(of({ property: 'gap', expected: '16px', actual: '8px' }), mismatch);
});

test('a value off the kit shows the value and the nearest token, by either name', () => {
  const token = { kind: 'token', value: '#1a1a1a', token: 'color.ink' };
  assert.deepEqual(of({ value: '#1a1a1a', token: 'color.ink' }), token);
  assert.deepEqual(of({ value: '#1a1a1a', nearest: 'color.ink' }), token);
});

test('a heading shows its level, from 1 to 6 only', () => {
  assert.deepEqual(of({ level: 3 }), { kind: 'heading', level: 3 });
  assert.deepEqual(of({ level: '2' }), { kind: 'heading', level: 2 });
  for (const level of [0, 7, 2.5, 'two']) {
    assert.deepEqual(of({ level }), { kind: 'message', message: MESSAGE }, String(level));
  }
});

test('anything else, or half of a pair, is the finding by its message', () => {
  const words = { kind: 'message', message: MESSAGE };
  assert.deepEqual(of(null), words);
  assert.deepEqual(of({}), words);
  assert.deepEqual(of({ ratio: 2.9 }), words);
  assert.deepEqual(of({ width: 18 }), words);
  assert.deepEqual(of({ ratio: 'low', needed: 4.5 }), words);
  assert.deepEqual(of({ property: 'gap', expected: ' ', actual: '8px' }), words);
  assert.deepEqual(of({ value: '#fff' }), words);
});

test('each kind but the message has its short name', () => {
  const names = [
    [of({ ratio: 2, needed: 3 }), 'checks.name.contrast'],
    [of({ width: 1, height: 1 }), 'checks.name.target'],
    [of({ content: 2, width: 1 }), 'checks.name.overflow'],
    [of({ property: 'a', expected: 'b', actual: 'c' }), 'checks.name.mismatch'],
    [of({ value: 'a', token: 'b' }), 'checks.name.token'],
    [of({ level: 1 }), 'checks.name.heading'],
    [of(null), null],
  ] as const;
  for (const [evidence, name] of names) assert.equal(evidenceName(evidence), name, evidence.kind);
});

test('a ratio has at most two decimals and no trailing zeros', () => {
  assert.equal(ratioWords(2.934), '2.93');
  assert.equal(ratioWords(4.5), '4.5');
  assert.equal(ratioWords(3), '3');
});
