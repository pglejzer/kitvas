import assert from 'node:assert/strict';
import { test } from 'node:test';
import type { FlatToken } from '../../../src/kit/index.ts';
import {
  contrastLine,
  safeFamilies,
  scaleRules,
  splitTokens,
  typeRules,
} from '../../../src/studio/views/kit-tokens.ts';

const dimension = (path: string[], value: number, unit: 'px' | 'rem' = 'px'): FlatToken => ({
  path,
  type: 'dimension',
  value: { value, unit },
});

const TOKENS: FlatToken[] = [
  { path: ['color', 'ink'], type: 'color', value: { colorSpace: 'srgb', components: [0, 0, 0] } },
  {
    path: ['color', 'veil'],
    type: 'color',
    value: { colorSpace: 'srgb', components: [0, 0, 0], alpha: 0.5 },
  },
  dimension(['space', 'md'], 12),
  dimension(['space', 'none'], 0),
  dimension(['radius', 'lg'], 14),
  dimension(['radius', 'full'], 999),
  dimension(['fontSize', 'md'], 1, 'rem'),
  dimension(['size', 'control'], 40),
  { path: ['font', 'body'], type: 'fontFamily', value: ['Inter', 'Segoe UI', 'sans-serif'] },
  { path: ['fontWeight', 'bold'], type: 'fontWeight', value: 700 },
  { path: ['lineHeight', 'tight'], type: 'number', value: 1.05 },
];

test('the contrast of a hex colour is given on white and on black, rounded down', () => {
  assert.deepEqual(contrastLine('#000000'), { white: '21.0:1', black: '1.0:1' });
  assert.deepEqual(contrastLine('#ffffff'), { white: '1.0:1', black: '21.0:1' });
  // #767676 on white is 4.54:1: it shows 4.5, and a value just under would never round up to it.
  assert.equal(contrastLine('#767676')?.white, '4.5:1');
});

test('a short hex colour has a contrast too, and a value that is no hex has none', () => {
  assert.deepEqual(contrastLine('#000'), contrastLine('#000000'));
  assert.equal(contrastLine('rgb(0 0 0 / 0.5)'), null);
  assert.equal(contrastLine('var(--x)'), null);
  assert.equal(contrastLine(''), null);
});

test('tokens are split into the sections the page draws, and every token is in one', () => {
  const split = splitTokens(TOKENS);
  assert.deepEqual(
    split.colors.map((row) => [row.name, row.contrast === null]),
    [
      ['--kit-color-ink', false],
      ['--kit-color-veil', true],
    ],
  );
  assert.deepEqual(
    split.spacing.map((row) => row.name),
    ['--kit-space-md', '--kit-space-none'],
  );
  assert.deepEqual(
    split.radius.map((row) => row.name),
    ['--kit-radius-lg', '--kit-radius-full'],
  );
  assert.deepEqual(
    split.sizes.map((row) => row.value),
    ['1rem'],
  );
  assert.equal(split.families.length, 1);
  assert.equal(split.weights.length, 1);
  assert.deepEqual(
    split.other.map((row) => row.name),
    ['--kit-size-control', '--kit-line-height-tight'],
  );
  const total = Object.values(split).reduce((sum, rows) => sum + rows.length, 0);
  assert.equal(total, TOKENS.length);
});

test('the scale is sized by a custom property of its own element, with its unit', () => {
  assert.equal(
    scaleRules(TOKENS),
    [
      '.kit-bar[data-token="--kit-space-md"] { --size: 12px; }',
      '.kit-bar[data-token="--kit-space-none"] { --size: 0px; }',
      '.kit-corner[data-token="--kit-radius-lg"] { --size: 14px; }',
      '.kit-corner[data-token="--kit-radius-full"] { --size: 999px; }',
    ].join('\n'),
  );
  assert.equal(scaleRules([]), '');
});

test('type samples take the size and weight of their token and the kit body family', () => {
  assert.equal(
    typeRules(TOKENS),
    [
      '.kit-sample { font-family: Inter, "Segoe UI", sans-serif; }',
      '.kit-sample[data-token="--kit-font-size-md"] { font-size: 1rem; }',
      '.kit-sample[data-token="--kit-font-weight-bold"] { font-weight: 700; }',
    ].join('\n'),
  );
});

test('a family name that could leave its CSS value is never written', () => {
  assert.deepEqual(safeFamilies(['Inter', 'a}b{', 'x; color: red', 'Segoe UI', 'sans-serif']), [
    'Inter',
    '"Segoe UI"',
    'sans-serif',
  ]);
  assert.deepEqual(safeFamilies('"; } body { display: none'), []);
  const unsafe: FlatToken[] = [
    { path: ['font', 'body'], type: 'fontFamily', value: '</style><script>' },
  ];
  assert.equal(typeRules(unsafe), '');
});
