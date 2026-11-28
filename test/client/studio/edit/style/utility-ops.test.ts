// The utility classes the studio builds for a Tailwind draft (spec 4c, goal 2; plan 16, task A).
// The client builds them from the server's own tables (ADR 0080); the tests hold that every class
// it builds is one the server knows and reads back. Plan 29: as the project's Tailwind takes it,
// its version, prefix and screens.

import assert from 'node:assert/strict';
import { test } from 'node:test';
import { plainValue } from '../../../../../client/studio/edit/props/values/kinds.ts';
import { isOwn, utilityFor } from '../../../../../client/studio/edit/style/utility-ops.ts';
import { tokenOptions } from '../../../../../src/edit/app/edit-state.ts';
import {
  contextOfVariants,
  keywordClasses,
  knownUtility,
  ownProperties,
  splitUtility as serverSplit,
  themeKeyOf,
  themeOrDefault,
  utilityOverrides,
} from '../../../../../src/edit/domain/style/utilities.ts';
import { isKeywordProperty } from '../../../../../src/edit/domain/types.ts';
import {
  STYLE_PROPERTIES,
  type StyleContext,
  type StyleProperty,
  type StyleValue,
  type TokenOption,
} from '../../../../../src/edit/index.ts';
import { loadKit } from '../../../../../src/kit/index.ts';
import type { TailwindTheme } from '../../../../../src/shared/index.ts';
import { builtinKits } from '../../../../helpers/kit/kits.ts';

const BASE: StyleContext = { width: null, state: null, option: null };
const AT_768: StyleContext = { width: 768, state: null, option: null };
const AT_700: StyleContext = { width: 700, state: null, option: null };
const HOVER: StyleContext = { width: null, state: 'hover', option: null };
const FOCUS_1280: StyleContext = { width: 1280, state: 'focus-visible', option: null };
const ACTIVE_900: StyleContext = { width: 900, state: 'active', option: null };

/** Tailwind 4 with no prefix and its own screens: a build that reported no theme. */
const V4 = themeOrDefault(null);
const TW3: TailwindTheme = { version: 3, prefix: 'tw-', screens: { tablet: 700 }, aliases: {} };
const TW4: TailwindTheme = { version: 4, prefix: 'tw:', screens: { tablet: 700 }, aliases: {} };

/** A kit token, mapped onto the theme key `utility` or onto none. */
const keyed = (
  name: string,
  type: TokenOption['type'],
  css: string,
  utility?: TokenOption['utility'],
): TokenOption => ({
  var: `--kit-${name}`,
  path: name.replace('-', '.'),
  type,
  css,
  ...(utility === undefined ? {} : { utility }),
});

/** A Tailwind 4 kit: each token mapped onto a theme variable but `font-size-body` and `space-xs`. */
const TOKENS: TokenOption[] = [
  keyed('space-md', 'dimension', '12px', { namespace: 'spacing', name: 'md' }),
  keyed('space-xs', 'dimension', '4px'),
  keyed('radius-md', 'dimension', '8px', { namespace: 'radius', name: 'md' }),
  keyed('font-size-lg', 'dimension', '18px', { namespace: 'text', name: 'lg' }),
  keyed('font-size-body', 'dimension', '16px'),
  keyed('color-primary', 'color', '#18181b', { namespace: 'color', name: 'primary' }),
  keyed('color-base', 'color', '#ffffff', { namespace: 'color', name: 'base' }),
  keyed('color-primary-foreground', 'color', '#f8fafc', {
    namespace: 'color',
    name: 'primary-foreground',
  }),
];

/** A Tailwind 3 kit: its tokens mapped onto theme paths (`theme(colors.primary)`). */
const TOKENS_3: TokenOption[] = [
  keyed('space-md', 'dimension', '16px', { namespace: 'spacing', name: '4' }),
  keyed('radius-md', 'dimension', '8px', { namespace: 'borderRadius', name: 'md' }),
  keyed('color-primary', 'color', '#18181b', { namespace: 'colors', name: 'primary' }),
];

const token = (name: string): StyleValue => ({ token: `--kit-${name}` });
const raw = (value: string): StyleValue => ({ raw: value });

/** The class of a value in the Tailwind 3 project, from its kit's tokens. */
const inV3 = (property: StyleProperty, value: StyleValue, context = BASE): string | null =>
  utilityFor(property, value, context, TOKENS_3, TW3);
/** The class of a value in a draft whose build reported no theme. */
const inV4 = (property: StyleProperty, value: StyleValue, context = BASE): string | null =>
  utilityFor(property, value, context, TOKENS, V4);

test("a keyword's class is the property's own on both sides, in both versions", () => {
  for (const version of [3, 4] as const) {
    const bare = { ...V4, version };
    for (const property of STYLE_PROPERTIES) {
      if (!isKeywordProperty(property)) continue;
      for (const word of Object.values(keywordClasses(property, version))) {
        assert.ok(ownProperties(word, version).includes(property), `${property}: ${word}`);
        assert.equal(isOwn(property, word, bare), true, `${property}: ${word}`);
      }
    }
  }
});

test('a value is written as the theme key or an arbitrary value after the own prefix', () => {
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
    ['color', token('color-base'), BASE, 'text-[color:var(--kit-color-base)]'],
    ['color', raw('#f00'), HOVER, 'hover:text-[color:#f00]'],
    ['border-width', raw('2px'), BASE, 'border-[length:2px]'],
    ['border-color', token('color-primary'), BASE, 'border-primary'],
    ['display', plainValue('none'), AT_768, 'md:hidden'],
    ['flex-direction', plainValue('column'), AT_768, 'md:flex-col'],
    ['justify-content', plainValue('space-between'), HOVER, 'hover:justify-between'],
  ];
  for (const [property, value, context, expected] of cases) {
    assert.equal(utilityFor(property, value, context, TOKENS, V4), expected, expected);
  }
});

test('a token mapped onto no theme key is written as [var(--kit-…)]', () => {
  assert.equal(inV4('gap', token('space-xs')), 'gap-[var(--kit-space-xs)]');
  const body = inV4('font-size', token('font-size-body'));
  assert.equal(body, 'text-[length:var(--kit-font-size-body)]');
  // A key of another namespace is no name for the property: a spacing key is no radius.
  const spacing = keyed('radius-sm', 'dimension', '4px', { namespace: 'spacing', name: 'sm' });
  assert.equal(
    utilityFor('border-radius', token('radius-sm'), BASE, [spacing], V4),
    'rounded-[var(--kit-radius-sm)]',
  );
  // A Tailwind 4 key in a Tailwind 3 project is none either.
  assert.equal(
    utilityFor('background-color', token('color-primary'), BASE, TOKENS, TW3),
    'tw-bg-[color:var(--kit-color-primary)]',
  );
});

test("a token mapped onto a variable the project's `@theme inline` points at keeps its class", () => {
  // As a kit learned from a Tailwind 4 project maps a colour: onto the project's own variable.
  const base = loadKit(builtinKits(), 'kitvas-ui');
  const kit = { ...base, cssVarMap: { 'color.accent': '--primary' } };
  const bg = (theme: TailwindTheme): string | null =>
    utilityFor('background-color', token('color-accent'), BASE, tokenOptions(kit, theme), theme);
  assert.equal(bg({ ...V4, aliases: { '--primary': '--color-primary' } }), 'bg-primary');
  // Without the alias the build reported, no theme key is known: the class names the variable.
  assert.equal(bg(V4), 'bg-[color:var(--kit-color-accent)]');
});

test('a token mapped onto --radius-md is rounded-md', () => {
  assert.equal(inV4('border-radius', token('radius-md')), 'rounded-md');
  // In Tailwind 3 through its theme path: `theme(borderRadius.md)`, `theme(spacing.4)`.
  assert.equal(inV3('border-radius', token('radius-md'), HOVER), 'hover:tw-rounded-md');
  assert.equal(inV3('padding', token('space-md'), AT_700), 'tablet:tw-p-4');
  assert.equal(inV3('color', token('color-primary')), 'tw-text-primary');
  // A nested colour is mapped onto its `DEFAULT` (Tailwind 3 cannot read `theme(colors.primary)`).
  const own = themeKeyOf('theme(colors.primary.DEFAULT)');
  const on = themeKeyOf('theme(colors.primary.foreground)');
  const nested = [
    keyed('color-primary', 'color', '#18181b', own),
    keyed('color-primary-foreground', 'color', '#f8fafc', on),
  ];
  const bg = utilityFor('background-color', token('color-primary'), BASE, nested, TW3);
  assert.equal(bg, 'tw-bg-primary');
  const ink = utilityFor('color', token('color-primary-foreground'), HOVER, nested, TW3);
  assert.equal(ink, 'hover:tw-text-primary-foreground');
});

test("the class carries the project's prefix where its version writes it (Review Focus 4)", () => {
  assert.equal(inV3('padding', raw('8px'), HOVER), 'hover:tw-p-[8px]');
  assert.equal(utilityFor('padding', raw('8px'), HOVER, TOKENS, TW4), 'tw:hover:p-[8px]');
  assert.equal(utilityFor('display', plainValue('none'), AT_700, [], TW4), 'tw:tablet:hidden');
  // Tailwind 3's own keyword classes: an outline is `outline`, none the property itself.
  assert.equal(inV3('outline-style', plainValue('solid'), HOVER), 'hover:tw-outline');
  assert.equal(inV3('outline-style', plainValue('none'), AT_700), 'tablet:[outline-style:none]');
  assert.equal(inV4('outline-style', plainValue('solid')), 'outline-solid');
});

test("a project's own screen is written by its name, another width as its min width (Review Focus 5)", () => {
  assert.equal(inV3('padding', raw('8px'), AT_700), 'tablet:tw-p-[8px]');
  assert.equal(inV3('padding', raw('8px'), AT_768), 'min-[768px]:tw-p-[8px]');
  assert.equal(inV4('padding', raw('8px'), AT_768), 'md:p-[8px]');
});

test('a value no class says gives none', () => {
  assert.equal(utilityFor('gap', token('space-xl'), BASE, TOKENS, V4), null);
  assert.equal(utilityFor('gap', token('space-md'), BASE, [], V4), null);
  assert.equal(utilityFor('display', plainValue('contents'), BASE, TOKENS, V4), null);
  assert.equal(utilityFor('display', token('space-md'), BASE, TOKENS, V4), null);
  const image = plainValue('url(../img/a.png)');
  assert.equal(utilityFor('background-image', image, BASE, TOKENS, V4), null);
  assert.equal(utilityFor('gap', raw('a[b]'), BASE, TOKENS, V4), null);
  assert.equal(utilityFor('gap', raw(''), BASE, TOKENS, V4), null);
  assert.equal(utilityFor('gap', raw('"x"'), BASE, TOKENS, V4), null);
  assert.equal(utilityFor('gap', raw('1'.repeat(200)), BASE, TOKENS, V4), null);
});

test("a class is a property's own when it sets that property alone", () => {
  assert.equal(isOwn('padding', 'p-4', V4), true);
  assert.equal(isOwn('padding', 'md:hover:p-[13px]', V4), true);
  assert.equal(isOwn('padding', '!p-4', V4), true);
  assert.equal(isOwn('padding-top', 'p-4', V4), false);
  assert.equal(isOwn('padding', 'px-4', V4), false);
  assert.equal(isOwn('border-width', 'border', V4), true);
  assert.equal(isOwn('border-width', 'md:border-2', V4), true);
  assert.equal(isOwn('display', 'md:flex', V4), true);
  assert.equal(isOwn('display', 'flex-col', V4), false);
  assert.equal(isOwn('flex-direction', 'flex-col', V4), true);
  assert.equal(isOwn('gap', 'gap-', V4), false);
  // Through the project's prefix only.
  assert.equal(isOwn('padding', 'tablet:!tw-p-4', TW3), true);
  assert.equal(isOwn('padding', 'p-4', TW3), false);
  assert.equal(isOwn('outline-style', 'tw-outline', TW3), true);
  assert.equal(isOwn('outline-style', 'outline', V4), false);
  // Tailwind 3's `outline` is no width: a width's edit never swaps it away.
  assert.equal(isOwn('outline-width', 'tw-outline', TW3), false);
  assert.equal(isOwn('outline-width', 'tw-outline-2', TW3), true);
  assert.equal(isOwn('outline-width', 'outline', V4), true);
  // A class whose value is another property's is not the property's own (`text-lg` is a size).
  assert.equal(isOwn('color', 'text-lg', V4), false);
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
  const three: [StyleProperty, StyleValue, StyleContext, string, boolean][] = [
    ['padding', token('space-md'), AT_700, 'var(--kit-space-md)', false],
    ['border-radius', token('radius-md'), HOVER, 'var(--kit-radius-md)', false],
    ['background-color', token('color-primary'), AT_700, 'var(--kit-color-primary)', false],
    ['gap', raw('13px'), HOVER, '13px', true],
    ['outline-style', plainValue('solid'), HOVER, 'solid', false],
    ['outline-style', plainValue('none'), AT_700, 'none', false],
  ];
  const runs: [typeof cases, readonly TokenOption[], TailwindTheme][] = [
    [cases, TOKENS, V4],
    [three, TOKENS_3, TW3],
    [cases, TOKENS, { ...V4, prefix: 'tw:' }],
  ];
  for (const [list, tokens, theme] of runs) {
    for (const [property, value, context, css, offKit] of list) {
      const built = utilityFor(property, value, context, tokens, theme);
      if (built === null) assert.fail(`no class for ${property}`);
      assert.equal(knownUtility(built, theme), true, built);
      const split = serverSplit(built, theme);
      if (split === null) assert.fail(`not read: ${built}`);
      assert.deepEqual(contextOfVariants(split.variants, theme.screens), context, built);
      assert.ok(ownProperties(split.base, theme.version).includes(property), built);
      const read = utilityOverrides(['flex', built], tokens, theme).find(
        (each) => each.property === property,
      );
      assert.deepEqual(read, { context, property, value: css, offKit, utility: built }, built);
    }
  }
});
