// The utility classes the studio builds for a Tailwind draft (spec 4c, goal 2; plan 16, task A).
// The client builds them from the server's own tables (ADR 0080); the tests hold that every class
// it builds is one the server knows and reads back.

import assert from 'node:assert/strict';
import { test } from 'node:test';
import { plainValue } from '../../../../../client/studio/edit/props/values/kinds.ts';
import { isOwn, utilityFor } from '../../../../../client/studio/edit/style/utility-ops.ts';
import {
  contextOfVariants,
  KEYWORD_UTILITY,
  knownUtility,
  ownProperties,
  splitUtility as serverSplit,
  utilityOverrides,
} from '../../../../../src/edit/domain/style/utilities.ts';
import {
  STYLE_PROPERTIES,
  type StyleContext,
  type StyleProperty,
  type StyleValue,
  type TokenOption,
} from '../../../../../src/edit/index.ts';

const BASE: StyleContext = { width: null, state: null, option: null };
const AT_768: StyleContext = { width: 768, state: null, option: null };
const HOVER: StyleContext = { width: null, state: 'hover', option: null };
const FOCUS_1280: StyleContext = { width: 1280, state: 'focus-visible', option: null };
const ACTIVE_900: StyleContext = { width: 900, state: 'active', option: null };

const TOKENS: TokenOption[] = [
  { var: '--kit-space-md', path: 'space.md', type: 'dimension', css: '12px' },
  { var: '--kit-radius-md', path: 'radius.md', type: 'dimension', css: '8px' },
  { var: '--kit-font-size-lg', path: 'fontSize.lg', type: 'dimension', css: '18px' },
  { var: '--kit-font-size-body', path: 'fontSize.body', type: 'dimension', css: '16px' },
  { var: '--kit-color-primary', path: 'color.primary', type: 'color', css: '#18181b' },
  { var: '--kit-color-base', path: 'color.base', type: 'color', css: '#ffffff' },
  {
    var: '--kit-color-primary-foreground',
    path: 'color.primaryForeground',
    type: 'color',
    css: '#f8fafc',
  },
];

const token = (name: string): StyleValue => ({ token: `--kit-${name}` });
const raw = (value: string): StyleValue => ({ raw: value });

test("a keyword's class is the property's own on both sides", () => {
  const table: Partial<Record<StyleProperty, Readonly<Record<string, string>>>> = KEYWORD_UTILITY;
  for (const property of STYLE_PROPERTIES) {
    const words: string[] = Object.values(table[property] ?? {});
    for (const word of words) {
      assert.ok(ownProperties(word).includes(property), `${property}: ${word}`);
      assert.equal(isOwn(property, word), true, `${property}: ${word}`);
    }
  }
});

test('a value is written as the token name or an arbitrary value after the own prefix', () => {
  const cases: [StyleProperty, StyleValue, StyleContext, string][] = [
    ['gap', token('space-md'), BASE, 'gap-md'],
    ['padding', token('space-md'), AT_768, 'md:p-md'],
    ['padding-top', raw('13px'), HOVER, 'hover:pt-[13px]'],
    ['padding', raw('1px 2px'), BASE, 'p-[1px_2px]'],
    ['border-radius', token('radius-md'), FOCUS_1280, 'xl:focus-visible:rounded-md'],
    ['background-color', token('color-primary'), ACTIVE_900, 'min-[900px]:active:bg-primary'],
    ['color', token('color-primary-foreground'), BASE, 'text-primary-foreground'],
    ['width', raw('calc(100% - 2px)'), BASE, 'w-[calc(100%_-_2px)]'],
    // `text-` is a size and a colour: a name Tailwind reads as the other goes as the variable.
    ['font-size', token('font-size-lg'), BASE, 'text-lg'],
    ['font-size', token('font-size-body'), BASE, 'text-[length:var(--kit-font-size-body)]'],
    ['color', token('color-base'), BASE, 'text-[color:var(--kit-color-base)]'],
    ['color', raw('#f00'), HOVER, 'hover:text-[color:#f00]'],
    ['border-width', raw('2px'), BASE, 'border-[length:2px]'],
    ['border-color', token('color-primary'), BASE, 'border-primary'],
    ['display', plainValue('none'), AT_768, 'md:hidden'],
    ['flex-direction', plainValue('column'), AT_768, 'md:flex-col'],
    ['justify-content', plainValue('space-between'), HOVER, 'hover:justify-between'],
  ];
  for (const [property, value, context, expected] of cases) {
    assert.equal(utilityFor(property, value, context, TOKENS), expected, expected);
  }
});

test('a value no class says gives none', () => {
  assert.equal(utilityFor('gap', token('space-xl'), BASE, TOKENS), null);
  assert.equal(utilityFor('gap', token('space-md'), BASE, []), null);
  assert.equal(utilityFor('display', plainValue('contents'), BASE, TOKENS), null);
  assert.equal(utilityFor('display', token('space-md'), BASE, TOKENS), null);
  assert.equal(utilityFor('background-image', plainValue('url(../img/a.png)'), BASE, TOKENS), null);
  assert.equal(utilityFor('gap', raw('a[b]'), BASE, TOKENS), null);
  assert.equal(utilityFor('gap', raw(''), BASE, TOKENS), null);
  assert.equal(utilityFor('gap', raw('"x"'), BASE, TOKENS), null);
  assert.equal(utilityFor('gap', raw('1'.repeat(200)), BASE, TOKENS), null);
});

test("a class is a property's own when it sets that property alone", () => {
  assert.equal(isOwn('padding', 'p-4'), true);
  assert.equal(isOwn('padding', 'md:hover:p-[13px]'), true);
  assert.equal(isOwn('padding', '!p-4'), true);
  assert.equal(isOwn('padding-top', 'p-4'), false);
  assert.equal(isOwn('padding', 'px-4'), false);
  assert.equal(isOwn('border-width', 'border'), true);
  assert.equal(isOwn('border-width', 'md:border-2'), true);
  assert.equal(isOwn('display', 'md:flex'), true);
  assert.equal(isOwn('display', 'flex-col'), false);
  assert.equal(isOwn('flex-direction', 'flex-col'), true);
  assert.equal(isOwn('gap', 'gap-'), false);
});

test('the server knows every class the client builds and reads its value back', () => {
  const cases: [StyleProperty, StyleValue, StyleContext, string, boolean][] = [
    ['gap', token('space-md'), AT_768, 'var(--kit-space-md)', false],
    ['padding', token('space-md'), HOVER, 'var(--kit-space-md)', false],
    ['border-radius', token('radius-md'), AT_768, 'var(--kit-radius-md)', false],
    ['gap', raw('13px'), FOCUS_1280, '13px', true],
    ['padding', raw('1px 2px'), ACTIVE_900, '1px 2px', true],
    ['color', raw('#f00'), HOVER, '#f00', true],
    ['color', token('color-primary'), AT_768, 'var(--kit-color-primary)', false],
    ['color', token('color-base'), AT_768, 'var(--kit-color-base)', false],
    ['font-size', token('font-size-lg'), AT_768, 'var(--kit-font-size-lg)', false],
    ['font-size', token('font-size-body'), AT_768, 'var(--kit-font-size-body)', false],
    ['background-color', token('color-primary'), HOVER, 'var(--kit-color-primary)', false],
    ['display', plainValue('none'), AT_768, 'none', false],
    ['flex-direction', plainValue('column'), ACTIVE_900, 'column', false],
    ['align-items', plainValue('flex-start'), HOVER, 'flex-start', false],
  ];
  for (const [property, value, context, css, offKit] of cases) {
    const built = utilityFor(property, value, context, TOKENS);
    if (built === null) assert.fail(`no class for ${property}`);
    assert.equal(knownUtility(built), true, built);
    assert.deepEqual(contextOfVariants(serverSplit(built).variants), context, built);
    assert.ok(ownProperties(serverSplit(built).base).includes(property), built);
    const read = utilityOverrides(['flex', built], TOKENS).find(
      (each) => each.property === property,
    );
    assert.deepEqual(read, { context, property, value: css, offKit, utility: built }, built);
  }
});
