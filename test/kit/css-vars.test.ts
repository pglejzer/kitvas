import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { test } from 'node:test';
import {
  cssVarName,
  formatTokenValue,
  readCssVarMap,
  tokenSheet,
} from '../../src/kit/domain/css-vars.ts';
import { type FlatToken, flattenTokens } from '../../src/kit/domain/tokens.ts';
import { PLUGIN_ROOT } from '../../src/shared/index.ts';

const file = join(PLUGIN_ROOT, 'test', 'fixtures', 'kits', 'tiny', 'json', 'tokens.json');
const { tokens } = flattenTokens(JSON.parse(readFileSync(file, 'utf8')));

const sheet = (
  base: FlatToken[],
  cssVarMap: Record<string, string> = {},
  themeTokens: Record<string, FlatToken[]> = {},
): string => tokenSheet({ tokens: base, cssVarMap, themeTokens });

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

test('a kit without a map or themes has every token under :root', () => {
  assert.equal(
    sheet(tokens),
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
  assert.equal(sheet([]), '');
});

test('a mapped token follows the design system variable on :root and body; a bad name keeps the value', () => {
  const map = {
    'color.ink': '--brand-ink',
    'space.sm': 'red; } body {',
    'font.body': '--brand-font',
  };
  assert.equal(
    sheet(tokens.slice(0, 4), map),
    [
      ':root {',
      '  --kit-color-accent: #1d2025;',
      '  --kit-color-veil: rgb(0 0 0 / 0.5);',
      '  --kit-space-sm: 8px;',
      '}',
      // A var() is worked out where it is declared: a theme's attributes are on the body.
      ':root, body {',
      '  --kit-color-ink: var(--brand-ink);',
      '}',
      '',
    ].join('\n'),
  );
});

test("each theme's tokens come after the base, under its value of the option theme", () => {
  const dark = flattenTokens({
    color: {
      $type: 'color',
      ink: { $value: { colorSpace: 'srgb', components: [0.8, 0.8, 0.8] } },
      veil: { $value: { colorSpace: 'srgb', components: [1, 1, 1], alpha: 0.5 } },
    },
  }).tokens;
  assert.equal(
    sheet(tokens.slice(0, 3), { 'color.ink': '--brand-ink' }, { light: [], dark }),
    [
      ':root {',
      '  --kit-color-accent: #1d2025;',
      '  --kit-color-veil: rgb(0 0 0 / 0.5);',
      '}',
      ':root, body {',
      '  --kit-color-ink: var(--brand-ink);',
      '}',
      '[data-opt-theme="dark"] {',
      '  --kit-color-veil: rgb(255 255 255 / 0.5);',
      '}',
      // The theme's own value of a mapped token: on the body too, or the base's var() would win there.
      '[data-opt-theme="dark"], [data-opt-theme="dark"] body {',
      '  --kit-color-ink: #cccccc;',
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
