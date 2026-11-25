// The evidence row of a finding of the full check (plan 18f, task 4): read back from the words.

import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  BAR_MARK,
  barFill,
  evidenceOf,
  type FindingFacts,
  titleKey,
} from '../../../../../client/studio/edit/checks/evidence.ts';
import type { TokenOption } from '../../../../../src/edit/index.ts';

const token = (path: string, name: string, css: string): TokenOption => ({
  var: `--kit-${name}`,
  path,
  type: 'color',
  css,
});
const KIT = [
  token('color.ink', 'color-ink', '#1d2025'),
  token('color.inkMid', 'color-ink-mid', '#6a707a'),
  token('color.surface', 'color-surface', '#ffffff'),
];

const finding = (over: Partial<FindingFacts>): FindingFacts => ({
  rule: 'a11y/color-contrast',
  message: 'Elements must meet minimum color contrast ratio thresholds',
  hint: '',
  element: 'sections/Plans:section/Stack/Price',
  ...over,
});

test('a contrast finding shows the ratio against what is needed', () => {
  const hint =
    'Fix any of the following:\n  Element has insufficient color contrast of 3.9 (foreground color: #8e949e, background color: #ffffff, font size: 12.0pt (16px), font weight: normal). Expected contrast ratio of 4.5:1';
  assert.deepEqual(evidenceOf(finding({ hint })), {
    kind: 'contrast',
    ratio: 3.9,
    needed: 4.5,
    fg: '#8e949e',
    bg: '#ffffff',
  });
});

test('the contrast on an image is read from its hint', () => {
  const hint =
    'Sampled from the pixels, its contrast is 3.1:1 where 4.5:1 is needed. Put it on a solid surface.';
  const got = evidenceOf(finding({ rule: 'a11y/contrast-on-image', hint }));
  assert.deepEqual(got, { kind: 'contrast', ratio: 3.1, needed: 4.5, fg: null, bg: null });
});

test('an off-kit colour shows its nearest token', () => {
  const got = evidenceOf(
    finding({ rule: 'ds/raw-color', message: '"#1a73e8" is a colour written by hand.' }),
    KIT,
  );
  assert.deepEqual(got, { kind: 'colour', value: '#1a73e8', token: 'inkMid', tokenCss: '#6a707a' });
});

test('an off-kit colour in a kit without colours has no token', () => {
  const got = evidenceOf(
    finding({ rule: 'ds/raw-color', message: '"#1a73e8" is a colour written by hand.' }),
    [],
  );
  assert.deepEqual(got, { kind: 'colour', value: '#1a73e8', token: null, tokenCss: null });
});

test('a heading order finding shows the levels and the missing one', () => {
  const got = evidenceOf(
    finding({ rule: 'a11y/heading-order', element: 'sections/Questions:section/Stack/h3.1' }),
  );
  assert.deepEqual(got, { kind: 'levels', levels: ['h2', 'h3'], missing: 'h2' });
});

test('a heading drawn by a component has no level to show', () => {
  const got = evidenceOf(
    finding({ rule: 'a11y/heading-order', element: 'sections/Questions:section/Heading' }),
  );
  assert.deepEqual(got, { kind: 'value', text: null });
});

test('any other rule shows its measured value', () => {
  const got = evidenceOf(
    finding({ rule: 'ds/raw-size', message: '12px is the value of the token space.sm.' }),
  );
  assert.deepEqual(got, { kind: 'value', text: '12px' });
  assert.equal(titleKey(got), null);
});

test('a contrast bar ends at one and a half times the need, with the mark at two thirds', () => {
  assert.equal(Math.round(barFill(3.9, 4.5) * 100), 58);
  assert.equal(barFill(20, 4.5), 1);
  assert.equal(Math.round(BAR_MARK * 100), 67);
});
