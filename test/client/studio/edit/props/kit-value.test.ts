// Whether a style value keeps to the kit (plan 18f, task 2; spec S4.6 item 5): a token by its
// name, anything else "Off kit" with the nearest token of the scale for "Use <token>".

import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  nearestToken,
  oklabOf,
  onKit,
  rgbOf,
} from '../../../../../client/studio/edit/props/kit-value.ts';
import type { TokenOption } from '../../../../../src/edit/index.ts';

const SPACE: TokenOption[] = [
  { var: '--kit-space-sm', path: 'space.sm', type: 'dimension', css: '8px' },
  { var: '--kit-space-md', path: 'space.md', type: 'dimension', css: '12px' },
  { var: '--kit-space-lg', path: 'space.lg', type: 'dimension', css: '16px' },
];
const colour = (name: string, css: string): TokenOption => ({
  var: `--kit-color-${name}`,
  path: `color.${name}`,
  type: 'color',
  css,
});
const COLOURS: TokenOption[] = [
  colour('black', '#000000'),
  colour('blue', '#2563eb'),
  colour('grey', '#6b7280'),
];

test('a token of the kit is named by its own name; nothing held says nothing', () => {
  assert.deepEqual(onKit('var(--kit-space-md)', SPACE), {
    kind: 'token',
    name: 'md',
    var: '--kit-space-md',
  });
  // A token of another scale is still the kit's.
  assert.equal(onKit('var(--kit-color-blue)', SPACE, [...SPACE, ...COLOURS]).kind, 'token');
  assert.deepEqual(onKit(null, SPACE), { kind: 'none' });
  assert.deepEqual(onKit('  ', SPACE), { kind: 'none' });
});

test('a raw size is off the kit, with the nearest token of the scale', () => {
  assert.deepEqual(onKit('13px', SPACE), { kind: 'offkit', nearest: SPACE[1] });
  assert.equal(nearestToken('1rem', SPACE), SPACE[2]);
  assert.equal(nearestToken('0', SPACE), SPACE[0]);
  // A tie takes the earlier token.
  assert.equal(nearestToken('10px', SPACE), SPACE[0]);
  // A value the scale cannot measure has no nearest token, and is still off the kit.
  assert.equal(nearestToken('auto', SPACE), null);
  assert.equal(nearestToken('50%', SPACE), null);
  assert.deepEqual(onKit('var(--brand-gap)', SPACE), { kind: 'offkit', nearest: null });
  assert.equal(nearestToken('12px', []), null);
});

test('the nearest colour is measured in OKLab, where sRGB would pick another', () => {
  // Navy: the grey is closer in sRGB numbers, the blue to the eye.
  assert.equal(nearestToken('#1e3a8a', COLOURS), COLOURS[1]);
  assert.equal(nearestToken('rgb(30, 58, 138)', COLOURS), COLOURS[1]);
  assert.equal(nearestToken('#111', COLOURS), COLOURS[0]);
  assert.equal(nearestToken('var(--kit-color-blue)', COLOURS), null);
});

test('colours are read as sRGB and turned into OKLab', () => {
  assert.deepEqual(rgbOf('#fff'), [1, 1, 1]);
  assert.deepEqual(rgbOf('rgba(255 0 0 / 50%)'), [1, 0, 0]);
  assert.equal(rgbOf('red'), null);
  const [lightness, a, b] = oklabOf([1, 1, 1]);
  assert.ok(Math.abs(lightness - 1) < 1e-3);
  assert.ok(Math.abs(a) < 1e-3 && Math.abs(b) < 1e-3);
  assert.deepEqual(oklabOf([0, 0, 0]), [0, 0, 0]);
});
