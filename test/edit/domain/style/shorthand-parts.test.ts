import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  callOf,
  isBoxPart,
  isColor,
  isToken,
  isUrl,
  lineKind,
  partsOf,
  type VarKind,
  varOf,
} from '../../../../src/edit/domain/style/shorthand-parts.ts';

const kinds: VarKind = (name) => {
  if (name === '--kit-color-line') return 'color';
  return name === '--kit-border-sm' ? 'dimension' : null;
};

const texts = (value: string): string[] | null => partsOf(value)?.map((part) => part.text) ?? null;

test('a value splits at the spaces outside brackets, and each part knows its place', () => {
  const value = '1px  solid rgb(0 0 0 / 20%)';
  assert.deepEqual(partsOf(value), [
    { text: '1px', start: 0, end: 3 },
    { text: 'solid', start: 5, end: 10 },
    { text: 'rgb(0 0 0 / 20%)', start: 11, end: 27 },
  ]);
  assert.deepEqual(texts('calc((1rem + 2px) * 2) var(--kit-space-md, 8px)'), [
    'calc((1rem + 2px) * 2)',
    'var(--kit-space-md, 8px)',
  ]);
  assert.deepEqual(texts('8px\n  16px'), ['8px', '16px']);
});

test('the inside of a url is an address: a slash pair, a quote or a comma there is read', () => {
  assert.deepEqual(texts('url(https://example.test/a.png) #fff'), [
    'url(https://example.test/a.png)',
    '#fff',
  ]);
  assert.deepEqual(texts('url("../img/a, b.png")'), ['url("../img/a, b.png")']);
  assert.deepEqual(texts("URL('../img/a.png')"), ["URL('../img/a.png')"]);
});

test('a value that is not plain CSS has no parts', () => {
  assert.equal(partsOf(''), null);
  assert.equal(partsOf('   '), null);
  assert.equal(partsOf('8px !important'), null);
  assert.equal(partsOf('8px /* note */'), null);
  assert.equal(partsOf('8px // note'), null);
  assert.equal(partsOf('#{$gap}'), null);
  assert.equal(partsOf('$gap'), null);
  assert.equal(partsOf('"Inter" 12px'), null);
  assert.equal(partsOf('url(a.png), url(b.png)'), null);
  assert.equal(partsOf('url($image)'), null);
  assert.equal(partsOf('url("a" + "b")'), null);
});

test('a function outside the short list, or a bracket out of place, has no parts', () => {
  assert.equal(partsOf('linear-gradient(#fff, #000)'), null);
  assert.equal(partsOf('min(8px, 2vw)'), null);
  assert.equal(partsOf('clamp(1px, 2px, 3px)'), null);
  assert.equal(partsOf('(8px)'), null);
  assert.equal(partsOf('8px-var(--kit-space-md)'), null);
  assert.equal(partsOf('calc(1px + 2px'), null);
  assert.equal(partsOf('8px)'), null);
});

test('a part that is one whole call names its function', () => {
  assert.equal(callOf('var(--kit-space-md)'), 'var');
  assert.equal(callOf('RGB(0 0 0)'), 'rgb');
  assert.equal(callOf('calc((1px + 2px) * 2)'), 'calc');
  assert.equal(callOf('8px'), null);
  assert.equal(callOf('rgb(0 0 0)x'), null);
  assert.equal(callOf('(8px)'), null);
  assert.equal(varOf('var(--kit-space-md)'), '--kit-space-md');
  assert.equal(varOf('var( --line , #ddd)'), '--line');
  assert.equal(varOf('calc(var(--kit-space-md) * 2)'), null);
});

test('a kit token is a var of a kit name and nothing else', () => {
  assert.equal(isToken('var(--kit-space-md)'), true);
  assert.equal(isToken('var(--space-md)'), false);
  assert.equal(isToken('var(--kit-space-md, 8px)'), false);
  assert.equal(isToken('8px'), false);
});

test('a side of a box is a length, a number, a percentage, auto, var or calc', () => {
  for (const part of ['0', '8px', '-8px', '.5rem', '1.5em', '50%', 'auto', 'AUTO']) {
    assert.equal(isBoxPart(part), true, part);
  }
  assert.equal(isBoxPart('var(--anything)'), true);
  assert.equal(isBoxPart('calc(1px + 2px)'), true);
  for (const part of ['solid', '#fff', 'rgb(0 0 0)', 'px', '8px8', 'url(a.png)']) {
    assert.equal(isBoxPart(part), false, part);
  }
});

test('a colour is a hex, a colour function, a colour name or a var of a colour token', () => {
  const colours = ['#fff', '#FFFF', '#a1b2c3', '#a1b2c3d4', 'red', 'Transparent', 'currentColor'];
  for (const part of colours) {
    assert.equal(isColor(part, kinds), true, part);
  }
  assert.equal(isColor('oklch(60% 0.1 200)', kinds), true);
  assert.equal(isColor('color-mix(in srgb, red 20%, blue)', kinds), true);
  assert.equal(isColor('var(--kit-color-line)', kinds), true);
  for (const part of ['#ff', '#12345', 'solid', '1px', 'var(--kit-border-sm)', 'var(--line)']) {
    assert.equal(isColor(part, kinds), false, part);
  }
  assert.equal(isColor('calc(1px + 2px)', kinds), false);
});

test('an image is one url, never a gradient', () => {
  assert.equal(isUrl('url(../img/hero.png)'), true);
  assert.equal(isUrl('url("../img/hero.png")'), true);
  assert.equal(isUrl('linear-gradient(#fff, #000)'), false);
  assert.equal(isUrl('url(a.png) center'), false);
});

test('a part of a line is its width, its style or its colour', () => {
  assert.equal(lineKind('1px', kinds, false), 'width');
  assert.equal(lineKind('0', kinds, false), 'width');
  assert.equal(lineKind('thin', kinds, false), 'width');
  assert.equal(lineKind('calc(1px + 1px)', kinds, false), 'width');
  assert.equal(lineKind('var(--kit-border-sm)', kinds, false), 'width');
  assert.equal(lineKind('Dashed', kinds, false), 'style');
  assert.equal(lineKind('none', kinds, false), 'style');
  assert.equal(lineKind('#ddd', kinds, false), 'color');
  assert.equal(lineKind('var(--kit-color-line)', kinds, false), 'color');
});

test('a part of a line that is none of them has no kind', () => {
  assert.equal(lineKind('var(--line)', kinds, false), null);
  assert.equal(lineKind('2', kinds, false), null);
  assert.equal(lineKind('50%', kinds, false), null);
  assert.equal(lineKind('center', kinds, false), null);
  // `auto` is a style of an outline only.
  assert.equal(lineKind('auto', kinds, false), null);
  assert.equal(lineKind('auto', kinds, true), 'style');
});
