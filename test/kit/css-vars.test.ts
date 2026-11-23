import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { test } from 'node:test';
import {
  cssVarName,
  formatTokenValue,
  readCssVarMap,
  tokensToCss,
} from '../../src/kit/domain/css-vars.ts';
import { flattenTokens } from '../../src/kit/domain/tokens.ts';
import { PLUGIN_ROOT } from '../../src/shared/index.ts';

const file = join(PLUGIN_ROOT, 'test', 'fixtures', 'kits', 'tiny', 'json', 'tokens.json');
const { tokens } = flattenTokens(JSON.parse(readFileSync(file, 'utf8')));

test('names are --kit- plus the path in kebab case', () => {
  assert.equal(cssVarName(['color', 'inkSoft']), '--kit-color-ink-soft');
  assert.equal(cssVarName(['space', '2xl']), '--kit-space-2xl');
  assert.equal(cssVarName(['font', 'Body Text']), '--kit-font-body-text');
});

test('values are written as CSS', () => {
  assert.deepEqual(tokens.map(formatTokenValue), [
    '#1d2025',
    '#1d2025',
    'rgb(0 0 0 / 0.5)',
    '8px',
    '0',
    'Inter, "Segoe UI", sans-serif',
    '700',
    '120ms',
  ]);
});

test('a zero duration keeps its unit', () => {
  const zero = flattenTokens({ t: { $type: 'duration', $value: { value: 0, unit: 'ms' } } });
  const [token] = zero.tokens;
  assert.ok(token);
  assert.equal(formatTokenValue(token), '0ms');
});

test('the sheet lists every token under one selector', () => {
  assert.equal(
    tokensToCss(tokens),
    [
      ':root {',
      '  --kit-color-ink: #1d2025;',
      '  --kit-color-accent: #1d2025;',
      '  --kit-color-veil: rgb(0 0 0 / 0.5);',
      '  --kit-space-sm: 8px;',
      '  --kit-space-none: 0;',
      '  --kit-font-body: Inter, "Segoe UI", sans-serif;',
      '  --kit-font-weight-bold: 700;',
      '  --kit-motion-fast: 120ms;',
      '}',
      '',
    ].join('\n'),
  );
  assert.match(
    tokensToCss(tokens.slice(0, 1), '.draft'),
    /^\.draft \{\n {2}--kit-color-ink: #1d2025;\n\}\n$/,
  );
});

test('a mapped token follows the design system variable; a bad name keeps the value', () => {
  const map = {
    'color.ink': '--brand-ink',
    'space.sm': 'red; } body {',
    'font.body': '--brand-font',
  };
  assert.equal(
    tokensToCss(tokens.slice(0, 4), undefined, map),
    [
      ':root {',
      '  --kit-color-ink: var(--brand-ink);',
      '  --kit-color-accent: #1d2025;',
      '  --kit-color-veil: rgb(0 0 0 / 0.5);',
      '  --kit-space-sm: 8px;',
      '}',
      '',
    ].join('\n'),
  );
});

test('the cssVars map keeps entries that name a token and a custom property', () => {
  const raw = JSON.parse(
    '{"color.ink":"--brand-ink","color.nope":"--brand-nope","space.sm":42,"__proto__":"--x"}',
  ) as unknown;
  const { map, issues } = readCssVarMap(raw, tokens);
  assert.deepEqual(map, { 'color.ink': '--brand-ink' });
  assert.equal(Object.getPrototypeOf(map), Object.prototype);
  assert.deepEqual(issues, [
    {
      path: 'tokens.cssVars.map',
      key: 'kitIssue.tokenAliasMissing',
      params: { path: '--brand-nope', target: 'color.nope' },
    },
    {
      path: 'tokens.cssVars.map',
      key: 'kitIssue.tokenShape',
      params: { path: 'space.sm', type: 'cssVars.map' },
    },
    {
      path: 'tokens.cssVars.map',
      key: 'kitIssue.tokenAliasMissing',
      params: { path: '--x', target: '__proto__' },
    },
  ]);
});

test('a cssVars map that is not an object is one issue', () => {
  for (const raw of [[], 'x', null]) {
    assert.deepEqual(readCssVarMap(raw, tokens), {
      map: {},
      issues: [
        {
          path: 'tokens.cssVars.map',
          key: 'kitIssue.tokenShape',
          params: { path: 'tokens.cssVars.map', type: 'cssVars.map' },
        },
      ],
    });
  }
});
