import assert from 'node:assert/strict';
import { test } from 'node:test';
import type { BoundProperty } from '../../../src/handoff/domain/figma/tree.ts';
import { figmaVariables } from '../../../src/handoff/domain/figma/variables.ts';
import { cssVarName, type FlatToken } from '../../../src/kit/index.ts';

const TOKENS: FlatToken[] = [
  { path: ['color', 'ink'], type: 'color', value: { colorSpace: 'srgb', components: [0, 0.5, 1] } },
  {
    path: ['color', 'veil'],
    type: 'color',
    value: { colorSpace: 'srgb', components: [0, 0, 0], alpha: 0.5 },
  },
  { path: ['space', 'sm'], type: 'dimension', value: { value: 8, unit: 'px' } },
  { path: ['space', 'lg'], type: 'dimension', value: { value: 1.5, unit: 'rem' } },
  { path: ['radius', 'md'], type: 'dimension', value: { value: 12, unit: 'px' } },
  { path: ['motion', 'fast'], type: 'duration', value: { value: 120, unit: 'ms' } },
  { path: ['font', 'body'], type: 'fontFamily', value: ['Inter', 'Segoe UI', 'sans-serif'] },
  { path: ['font', 'mono'], type: 'fontFamily', value: 'JetBrains Mono' },
  { path: ['font', 'weightBold'], type: 'fontWeight', value: 700 },
  { path: ['ratio', 'golden'], type: 'number', value: 1.618 },
];

const named = (name: string) =>
  figmaVariables(TOKENS, new Map()).find((item) => item.name === name);

test('colours, dimensions, numbers, font families and weights become variables; durations do not', () => {
  const variables = figmaVariables(TOKENS, new Map());
  assert.deepEqual(
    variables.map((variable) => [variable.name, variable.type]),
    [
      ['color/ink', 'COLOR'],
      ['color/veil', 'COLOR'],
      ['space/sm', 'FLOAT'],
      ['space/lg', 'FLOAT'],
      ['radius/md', 'FLOAT'],
      ['font/body', 'STRING'],
      ['font/mono', 'STRING'],
      ['font/weightBold', 'FLOAT'],
      ['ratio/golden', 'FLOAT'],
    ],
  );
});

test('values: colour as 0 to 1 with alpha, rem as 16 px, the first family', () => {
  assert.deepEqual(named('color/ink')?.value, { r: 0, g: 0.5, b: 1, a: 1 });
  assert.deepEqual(named('color/veil')?.value, { r: 0, g: 0, b: 0, a: 0.5 });
  assert.equal(named('space/sm')?.value, 8);
  assert.equal(named('space/lg')?.value, 24);
  assert.equal(named('font/body')?.value, 'Inter');
  assert.equal(named('font/mono')?.value, 'JetBrains Mono');
  assert.equal(named('font/weightBold')?.value, 700);
});

test('the web code syntax is the kit variable, the same name the kit module gives', () => {
  for (const token of TOKENS) {
    const found = named(token.path.join('/'));
    if (found === undefined) continue;
    assert.equal(found.syntax, `var(${cssVarName(token.path)})`);
  }
  assert.equal(named('font/weightBold')?.syntax, 'var(--kit-font-weight-bold)');
});

test('a token bound nowhere gets its type scopes', () => {
  assert.deepEqual(named('color/ink')?.scopes, ['ALL_FILLS', 'STROKE_COLOR']);
  assert.deepEqual(named('space/sm')?.scopes, ['GAP', 'WIDTH_HEIGHT']);
  assert.deepEqual(named('font/body')?.scopes, []);
  assert.deepEqual(named('font/weightBold')?.scopes, []);
  assert.deepEqual(named('ratio/golden')?.scopes, []);
});

test('scopes come from the properties the draft bound the token to', () => {
  const bound = new Map<string, Set<BoundProperty>>([
    ['color/ink', new Set<BoundProperty>(['text', 'stroke'])],
    ['color/veil', new Set<BoundProperty>(['fill', 'text'])],
    ['space/sm', new Set<BoundProperty>(['gap', 'padding-top', 'cross-gap'])],
    ['radius/md', new Set<BoundProperty>(['radius'])],
    ['font/body', new Set<BoundProperty>(['font-family'])],
    ['font/weightBold', new Set<BoundProperty>(['font-weight'])],
  ]);
  const scopes = (name: string): string[] | undefined =>
    figmaVariables(TOKENS, bound).find((item) => item.name === name)?.scopes;
  assert.deepEqual(scopes('color/ink'), ['TEXT_FILL', 'STROKE_COLOR']);
  assert.deepEqual(scopes('color/veil'), ['ALL_FILLS']);
  assert.deepEqual(scopes('space/sm'), ['GAP']);
  assert.deepEqual(scopes('radius/md'), ['CORNER_RADIUS']);
  assert.deepEqual(scopes('font/body'), ['FONT_FAMILY']);
  assert.deepEqual(scopes('font/weightBold'), ['FONT_WEIGHT']);
  // Not bound: the type's own scopes.
  assert.deepEqual(scopes('space/lg'), ['GAP', 'WIDTH_HEIGHT']);
});

test('a kit of 600 tokens gives 600 variables with unique names', () => {
  const many = Array.from({ length: 600 }, (_, at): FlatToken => {
    const path = ['group', `t${at}`];
    return at % 2 === 0
      ? { path, type: 'dimension', value: { value: at, unit: 'px' } }
      : { path, type: 'fontWeight', value: 100 + (at % 9) };
  });
  const variables = figmaVariables(many, new Map());
  assert.equal(variables.length, 600);
  assert.equal(new Set(variables.map((variable) => variable.name)).size, 600);
});
