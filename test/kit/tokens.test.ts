import assert from 'node:assert/strict';
import { test } from 'node:test';
import { flattenTokens } from '../../src/kit/domain/tokens.ts';

const INK = { colorSpace: 'srgb', components: [0.114, 0.125, 0.145] };

test('flattens groups, inherits $type and resolves aliases', () => {
  const { tokens, issues } = flattenTokens({
    color: {
      $type: 'color',
      $description: 'ignored metadata',
      ink: { $value: INK },
      accent: { $value: '{color.ink}' },
    },
    space: { sm: { $type: 'dimension', $value: { value: 8, unit: 'px' } } },
  });
  assert.deepEqual(issues, []);
  assert.deepEqual(
    tokens.map((token) => [token.path.join('.'), token.type]),
    [
      ['color.ink', 'color'],
      ['color.accent', 'color'],
      ['space.sm', 'dimension'],
    ],
  );
  assert.deepEqual(tokens[1]?.value, INK);
});

test('reports each kind of problem with a path and a message key', () => {
  const { tokens, issues } = flattenTokens({
    a: { $value: 1 },
    b: { $type: 'gradient', $value: 1 },
    c: { $type: 'dimension', $value: '8px' },
    d: { $type: 'color', $value: '{nope}' },
    e: { $type: 'number', $value: '{f}' },
    f: { $type: 'number', $value: '{e}' },
    g: { $type: 'number', $value: '{h}' },
    h: { $type: 'fontWeight', $value: 400 },
  });
  assert.deepEqual(
    tokens.map((token) => token.path.join('.')),
    ['h'],
  );
  assert.deepEqual(
    issues.map((issue) => [issue.path, issue.key]),
    [
      ['tokens.a', 'kitIssue.tokenNoType'],
      ['tokens.b', 'kitIssue.tokenUnknownType'],
      ['tokens.c', 'kitIssue.tokenShape'],
      ['tokens.d', 'kitIssue.tokenAliasMissing'],
      ['tokens.e', 'kitIssue.tokenAliasCycle'],
      ['tokens.f', 'kitIssue.tokenAliasCycle'],
      ['tokens.g', 'kitIssue.tokenAliasType'],
    ],
  );
  assert.deepEqual(issues[3]?.params, { path: 'd', target: 'nope' });
  assert.deepEqual(issues[6]?.params, { path: 'g', type: 'number', targetType: 'fontWeight' });
});

test('checks value shapes', () => {
  const { tokens, issues } = flattenTokens({
    tooBright: { $type: 'color', $value: { colorSpace: 'srgb', components: [1.2, 0, 0] } },
    wrongUnit: { $type: 'dimension', $value: { value: 1, unit: 'em' } },
    heavy: { $type: 'fontWeight', $value: 1200 },
    inherited: { $type: 'toString', $value: 1 },
    self: { $type: 'number', $value: '{self}' },
  });
  assert.deepEqual(tokens, []);
  assert.deepEqual(
    issues.map((issue) => issue.key),
    [
      'kitIssue.tokenShape',
      'kitIssue.tokenShape',
      'kitIssue.tokenShape',
      'kitIssue.tokenUnknownType',
      'kitIssue.tokenAliasCycle',
    ],
  );
});

test('anything that is not an object yields no tokens', () => {
  assert.deepEqual(flattenTokens(null), { tokens: [], issues: [] });
  assert.deepEqual(flattenTokens([1, 2]), { tokens: [], issues: [] });
});
