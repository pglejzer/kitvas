import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  indexOnScale,
  isOffKit,
  stepToken,
  styleValueOf,
  tokensFor,
  varOf,
} from '../../../../../../client/studio/edit/props/values/steps.ts';
import type { TokenOption } from '../../../../../../src/edit/index.ts';

function token(path: string, css: string, type: TokenOption['type'] = 'dimension'): TokenOption {
  return { var: `--kit-${path.replaceAll('.', '-')}`, path, type, css };
}

const SPACE = [
  token('space.xl', '24px'),
  token('space.none', '0'),
  token('space.md', '0.75rem'),
  token('space.xs', '4px'),
  token('space.lg', '1rem'),
  token('space.sm', '8px'),
];

test('tokensFor keeps the tokens of the property type and orders dimensions by value', () => {
  const mixed = [
    ...SPACE,
    token('color.ink', '#111111', 'color'),
    token('weight.bold', '700', 'fontWeight'),
  ];
  assert.deepEqual(
    tokensFor(mixed, 'gap').map((one) => one.path),
    ['space.none', 'space.xs', 'space.sm', 'space.md', 'space.lg', 'space.xl'],
  );
  assert.deepEqual(
    tokensFor(mixed, 'color').map((one) => one.path),
    ['color.ink'],
  );
  assert.deepEqual(
    tokensFor(mixed, 'font-weight').map((one) => one.path),
    ['weight.bold'],
  );
});

test('tokensFor orders font weights and numbers by value and colours as the kit has them', () => {
  const weights = [token('w.b', '700', 'fontWeight'), token('w.r', '400', 'fontWeight')];
  assert.deepEqual(
    tokensFor(weights, 'font-weight').map((one) => one.path),
    ['w.r', 'w.b'],
  );
  const colours = [token('c.b', '#000', 'color'), token('c.a', '#fff', 'color')];
  assert.deepEqual(
    tokensFor(colours, 'color').map((one) => one.path),
    ['c.b', 'c.a'],
  );
});

test('stepToken moves one token along the scale from a var() or a token name', () => {
  const scale = tokensFor(SPACE, 'gap');
  assert.equal(stepToken(scale, 'var(--kit-space-sm)', 1, false)?.path, 'space.md');
  assert.equal(stepToken(scale, '--kit-space-sm', -1, false)?.path, 'space.xs');
});

test('stepToken with big moves three tokens and stops at the ends', () => {
  const scale = tokensFor(SPACE, 'gap');
  assert.equal(stepToken(scale, 'var(--kit-space-xs)', 1, true)?.path, 'space.lg');
  assert.equal(stepToken(scale, 'var(--kit-space-lg)', 1, true)?.path, 'space.xl');
  assert.equal(stepToken(scale, 'var(--kit-space-xs)', -1, true)?.path, 'space.none');
  assert.equal(stepToken(scale, 'var(--kit-space-xl)', 1, false)?.path, 'space.xl');
});

test('stepToken finds a value that equals a token in another unit', () => {
  const scale = tokensFor(SPACE, 'gap');
  assert.equal(indexOnScale(scale, '12px'), 3);
  assert.equal(stepToken(scale, '16px', -1, false)?.path, 'space.md');
});

test('stepToken from a value between tokens goes to the first token past it', () => {
  const scale = tokensFor(SPACE, 'gap');
  assert.equal(stepToken(scale, '10px', 1, false)?.path, 'space.md');
  assert.equal(stepToken(scale, '10px', -1, false)?.path, 'space.sm');
  assert.equal(stepToken(scale, '30px', 1, false), null);
  assert.equal(stepToken(scale, '2px', -1, false)?.path, 'space.none');
  assert.equal(stepToken(scale, '-4px', -1, false), null);
});

test('stepToken from no value starts at the end of the scale it moves toward', () => {
  const scale = tokensFor(SPACE, 'gap');
  assert.equal(stepToken(scale, null, 1, false)?.path, 'space.none');
  assert.equal(stepToken(scale, null, -1, false)?.path, 'space.xl');
  assert.equal(stepToken([], null, 1, false), null);
});

test('stepToken walks a colour palette in the kit order', () => {
  const palette = [token('c.a', '#111111', 'color'), token('c.b', '#222222', 'color')];
  assert.equal(stepToken(palette, 'var(--kit-c-a)', 1, false)?.path, 'c.b');
  assert.equal(stepToken(palette, 'var(--kit-c-b)', 1, false)?.path, 'c.b');
});

test('isOffKit is true for anything but a var of a token the kit has', () => {
  assert.equal(isOffKit('var(--kit-space-md)', SPACE), false);
  assert.equal(isOffKit('var(--kit-space-huge)', SPACE), true);
  assert.equal(isOffKit('13px', SPACE), true);
  assert.equal(isOffKit('', SPACE), false);
});

test('varOf and styleValueOf read the declaration text', () => {
  assert.equal(varOf(' var( --kit-space-md ) '), '--kit-space-md');
  assert.equal(varOf('12px'), null);
  assert.deepEqual(styleValueOf('var(--kit-space-md)'), { token: '--kit-space-md' });
  assert.deepEqual(styleValueOf(' 13px '), { raw: '13px' });
  assert.deepEqual(styleValueOf('var(--other)'), { raw: 'var(--other)' });
});

test('a spacing row offers the spacing scale, not every dimension of the kit', () => {
  const kit = [
    ...SPACE,
    token('radius.md', '10px', 'dimension'),
    token('fontSize.md', '15px', 'dimension'),
    token('size.control', '40px', 'dimension'),
  ];
  assert.ok(tokensFor(kit, 'padding').every((one) => one.path.startsWith('space.')));
  assert.deepEqual(
    tokensFor(kit, 'border-radius').map((one) => one.path),
    ['radius.md'],
  );
  assert.deepEqual(
    tokensFor(kit, 'font-size').map((one) => one.path),
    ['fontSize.md'],
  );
  // A kit without the usual group names still gets every token of the type.
  const odd = [token('gutter.one', '4px', 'dimension'), token('gutter.two', '8px', 'dimension')];
  assert.equal(tokensFor(odd, 'padding').length, 2);
});

test('one side of padding and margin offers the spacing scale too (plan 15)', () => {
  const kit = [...SPACE, token('radius.md', '10px', 'dimension')];
  const sides = ['padding-top', 'padding-left', 'margin-right', 'margin-bottom'] as const;
  for (const property of sides) {
    assert.deepEqual(
      tokensFor(kit, property).map((one) => one.path),
      ['space.none', 'space.xs', 'space.sm', 'space.md', 'space.lg', 'space.xl'],
      property,
    );
  }
  const lines = [...kit, token('borderWidth.thin', '1px'), token('color.ink', '#111', 'color')];
  assert.deepEqual(
    tokensFor(lines, 'outline-width').map((one) => one.path),
    ['borderWidth.thin'],
  );
  assert.deepEqual(
    tokensFor(lines, 'outline-color').map((one) => one.path),
    ['color.ink'],
  );
});

test('a minimum size offers the size scale of width and height (ADR 0067)', () => {
  const kit = [
    ...SPACE,
    token('radius.md', '10px'),
    token('size.controlSm', '32px'),
    token('size.control', '40px'),
  ];
  for (const property of ['min-width', 'min-height', 'height'] as const) {
    assert.deepEqual(
      tokensFor(kit, property).map((one) => one.path),
      ['size.controlSm', 'size.control'],
      property,
    );
  }
});

test('a keyword or an image row takes no token at all', () => {
  const kit = [...SPACE, token('color.ink', '#111', 'color')];
  for (const property of ['display', 'justify-content', 'background-image'] as const) {
    assert.deepEqual(tokensFor(kit, property), [], property);
  }
});

test('a value written without the marker is read back plain, as the server finds it', () => {
  assert.deepEqual(styleValueOf('flex', false), { raw: 'flex', mark: false });
  assert.deepEqual(styleValueOf('url(../img/a.png)', false), {
    raw: 'url(../img/a.png)',
    mark: false,
  });
  assert.deepEqual(styleValueOf('var(--kit-space-md)', false), { token: '--kit-space-md' });
});
