import assert from 'node:assert/strict';
import { test } from 'node:test';
import { nearestToken } from '../../src/edit/domain/nearest.ts';
import type { TokenOption } from '../../src/edit/index.ts';

const token = (path: string, type: TokenOption['type'], css: string): TokenOption => ({
  var: `--kit-${path.replaceAll('.', '-')}`,
  path,
  type,
  css,
});

const tokens: TokenOption[] = [
  token('space.none', 'dimension', '0'),
  token('space.sm', 'dimension', '8px'),
  token('space.md', 'dimension', '1rem'),
  token('space.lg', 'dimension', '24px'),
  token('color.ink', 'color', '#1d2025'),
  token('color.paper', 'color', '#ffffff'),
  token('color.veil', 'color', 'rgb(0 0 0 / 0.5)'),
  token('font.weightBold', 'fontWeight', '700'),
  token('font.weightRegular', 'fontWeight', '400'),
  token('line.tight', 'number', '1.2'),
  token('line.loose', 'number', '1.6'),
  token('motion.fast', 'duration', '120ms'),
];

const path = (found: TokenOption | null): string | null => found?.path ?? null;

test('a dimension takes the closest token in px', () => {
  assert.equal(path(nearestToken('13px', 'dimension', tokens)), 'space.md');
  assert.equal(path(nearestToken('9px', 'dimension', tokens)), 'space.sm');
  assert.equal(path(nearestToken('30px', 'dimension', tokens)), 'space.lg');
});

test('rem counts as 16 px on both sides', () => {
  assert.equal(path(nearestToken('1.4rem', 'dimension', tokens)), 'space.lg');
  assert.equal(path(nearestToken('0.55rem', 'dimension', tokens)), 'space.sm');
});

test('a bare zero is a dimension and finds the zero token', () => {
  assert.equal(path(nearestToken('0', 'dimension', tokens)), 'space.none');
  assert.equal(path(nearestToken('1px', 'dimension', tokens)), 'space.none');
});

test('a colour takes the closest token by distance in sRGB', () => {
  assert.equal(path(nearestToken('#202226', 'color', tokens)), 'color.ink');
  assert.equal(path(nearestToken('#fafafa', 'color', tokens)), 'color.paper');
  assert.equal(path(nearestToken('#fff', 'color', tokens)), 'color.paper');
});

test('rgb() values read with commas or spaces on either side', () => {
  assert.equal(path(nearestToken('rgb(250, 250, 250)', 'color', tokens)), 'color.paper');
  assert.equal(path(nearestToken('rgb(0 0 0)', 'color', tokens)), 'color.veil');
});

test('font weights and numbers compare by value', () => {
  assert.equal(path(nearestToken('600', 'fontWeight', tokens)), 'font.weightBold');
  assert.equal(path(nearestToken('300', 'fontWeight', tokens)), 'font.weightRegular');
  assert.equal(path(nearestToken('1.5', 'number', tokens)), 'line.loose');
});

test('a token of another type is never offered', () => {
  const onlyColours = tokens.filter((candidate) => candidate.type === 'color');
  assert.equal(nearestToken('8px', 'dimension', onlyColours), null);
});

test('a type nearestToken does not compare is null', () => {
  assert.equal(nearestToken('120ms', 'duration', tokens), null);
  assert.equal(nearestToken('Inter', 'fontFamily', tokens), null);
});

test('a value it cannot read is null', () => {
  assert.equal(nearestToken('calc(1px + 2px)', 'dimension', tokens), null);
  assert.equal(nearestToken('var(--kit-space-sm)', 'dimension', tokens), null);
  assert.equal(nearestToken('tomato', 'color', tokens), null);
  assert.equal(nearestToken('bold', 'fontWeight', tokens), null);
});

test('a kit with no token list gives null', () => {
  assert.equal(nearestToken('8px', 'dimension', []), null);
});

test('a tie takes the first token', () => {
  const pair = [token('space.a', 'dimension', '8px'), token('space.b', 'dimension', '16px')];
  assert.equal(path(nearestToken('12px', 'dimension', pair)), 'space.a');
});
