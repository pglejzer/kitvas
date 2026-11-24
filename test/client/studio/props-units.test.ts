import assert from 'node:assert/strict';
import { test } from 'node:test';
import { scrubSteps, scrubText, scrubValue } from '../../../client/studio/edit/props-scrub.ts';
import {
  allowsNegative,
  convertLength,
  lengthPx,
  lengthValue,
  readLength,
  unitsFor,
} from '../../../client/studio/edit/props-units.ts';
import { tokensFor } from '../../../client/studio/edit/steps.ts';
import type { TokenOption } from '../../../src/edit/index.ts';

const space = (name: string, css: string): TokenOption => ({
  var: `--kit-space-${name}`,
  path: `space.${name}`,
  type: 'dimension',
  css,
});
const SCALE = tokensFor(
  [space('xs', '4px'), space('sm', '8px'), space('md', '0.75rem'), space('lg', '1rem')],
  'gap',
);

test('a raw length takes px, rem or %, and auto only for width and height', () => {
  assert.deepEqual(unitsFor('padding-top'), ['px', 'rem', '%']);
  assert.deepEqual(unitsFor('width'), ['px', 'rem', '%', 'auto']);
  assert.deepEqual(unitsFor('height'), ['px', 'rem', '%', 'auto']);
  assert.deepEqual(lengthValue('padding-top', '13', 'px'), { raw: '13px' });
  assert.deepEqual(lengthValue('width', '50', '%'), { raw: '50%' });
  assert.deepEqual(lengthValue('gap', '1.25', 'rem'), { raw: '1.25rem' });
  assert.deepEqual(lengthValue('width', '', 'auto'), { raw: 'auto', mark: false });
  assert.equal(lengthValue('padding', '', 'auto'), null);
  assert.equal(lengthValue('padding', '4', 'em'), null);
  assert.equal(lengthValue('padding', 'big', 'px'), null);
  assert.equal(lengthValue('padding', '1e3', 'px'), null);
});

test('only a margin may be negative', () => {
  assert.equal(allowsNegative('margin-top'), true);
  assert.equal(allowsNegative('padding-top'), false);
  assert.deepEqual(lengthValue('margin-left', '-8', 'px'), { raw: '-8px' });
  assert.equal(lengthValue('padding-left', '-8', 'px'), null);
});

test('a length reads back as amount and unit, a bare zero as px', () => {
  assert.deepEqual(readLength(' 12px '), { amount: 12, unit: 'px' });
  assert.deepEqual(readLength('1.5REM'), { amount: 1.5, unit: 'rem' });
  assert.deepEqual(readLength('0'), { amount: 0, unit: 'px' });
  assert.equal(readLength('auto'), 'auto');
  for (const other of ['12', '1em', 'calc(1px + 2px)', 'var(--kit-space-md)', '']) {
    assert.equal(readLength(other), null, other);
  }
  assert.equal(lengthPx('1rem'), 16);
  assert.equal(lengthPx('50%'), null);
  assert.equal(convertLength(24, 'px', 'rem'), 1.5);
  assert.equal(convertLength(0.1 + 0.2, 'rem', 'px'), 4.8);
  assert.equal(convertLength(50, '%', 'px'), 50);
});

test('a drag steps once per 8 px, right up and left down', () => {
  assert.equal(scrubSteps(7), 0);
  assert.equal(scrubSteps(8), 1);
  assert.equal(scrubSteps(25), 3);
  assert.equal(scrubSteps(-9), -1);
});

test('a scrub moves along the scale and stops at its ends', () => {
  const at = (start: string | null, steps: number) =>
    scrubValue({ tokens: SCALE, start, steps, raw: false, min: 0 });
  assert.deepEqual(at('var(--kit-space-sm)', 1), { token: '--kit-space-md' });
  assert.deepEqual(at('var(--kit-space-sm)', -1), { token: '--kit-space-xs' });
  assert.deepEqual(at('var(--kit-space-xs)', 10), { token: '--kit-space-lg' });
  assert.deepEqual(at('var(--kit-space-sm)', -10), { token: '--kit-space-xs' });
  // A computed value between tokens goes to the first token past it.
  assert.deepEqual(at('10px', 1), { token: '--kit-space-md' });
  assert.equal(at('var(--kit-space-sm)', 0), null);
  assert.equal(scrubValue({ tokens: [], start: null, steps: 2, raw: false, min: 0 }), null);
});

test('with Shift a scrub moves in raw px from the start, never under the minimum', () => {
  const raw = (start: string | null, steps: number, min: number | null) =>
    scrubValue({ tokens: SCALE, start, steps, raw: true, min });
  assert.deepEqual(raw('var(--kit-space-md)', 3, 0), { raw: '15px' });
  assert.deepEqual(raw('10px', -4, 0), { raw: '6px' });
  assert.deepEqual(raw('2px', -5, 0), { raw: '0px' });
  assert.deepEqual(raw('2px', -5, null), { raw: '-3px' });
  assert.deepEqual(raw(null, 4, 0), { raw: '4px' });
});

test('the label shows a token by its path and a raw value as it is', () => {
  assert.equal(scrubText(SCALE, { token: '--kit-space-md' }), 'space.md');
  assert.equal(scrubText(SCALE, { token: '--kit-other' }), '--kit-other');
  assert.equal(scrubText(SCALE, { raw: '15px' }), '15px');
});
