// The utility classes of a Tailwind draft (spec 4c, goal 2; plan 16, task A): the variants kitvas
// writes, the overrides the prefixed classes are, and the `setUtility` op on a literal `className`.
// Plan 29: every class as the project's Tailwind takes it, its version, prefix and screens.

import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  contextOfVariants,
  DEFAULT_SCREENS,
  keywordUtility,
  knownUtility,
  ownPrefixes,
  ownProperties,
  screenOf,
  splitUtility,
  themeKeyOf,
  themeOrDefault,
  type UtilityOverride,
  utilityIn,
  utilityOverrides,
  variantPrefix,
} from '../../../src/edit/domain/style/utilities.ts';
import { applyTsx, type TsxOptions } from '../../../src/edit/domain/tsx/apply-tsx.ts';
import {
  type ApplyResult,
  type EditOp,
  inverse,
  type SimpleOp,
  type StyleContext,
  type StyleState,
  type TokenOption,
} from '../../../src/edit/index.ts';
import type { TailwindTheme } from '../../../src/shared/index.ts';

const ID = 'sections/Hero:div';
const PLAIN = { force: false };
const FORCE = { force: true };

/** A draft built before kitvas read the project's Tailwind: Tailwind 4, no prefix, its screens. */
const V4 = themeOrDefault(null);
/** A Tailwind 3 project with the prefix `tw-` and one screen of its own. */
const TW3: TailwindTheme = { version: 3, prefix: 'tw-', screens: { tablet: 700 }, aliases: {} };
/** A Tailwind 4 project with `@import "tailwindcss" prefix(tw)` and one more screen. */
const TW4: TailwindTheme = {
  version: 4,
  prefix: 'tw:',
  screens: { ...DEFAULT_SCREENS, tablet: 700 },
  aliases: {},
};

/** A width and a state: a Tailwind draft's options act through the prop only (plan 25). */
const at = (width: number | null, state: StyleState | null): StyleContext => ({
  width,
  state,
  option: null,
});

type UtilityOp = Extract<EditOp, { op: 'setUtility' }>;

const utility = (value: string | null, before: string | null): UtilityOp => ({
  op: 'setUtility',
  id: ID,
  value,
  before,
});

/** A Tailwind 4 kit's tokens, each mapped onto a theme variable (`css-var-map.json`). */
const TOKENS: TokenOption[] = [
  {
    var: '--kit-color-primary',
    path: 'color.primary',
    type: 'color',
    css: '#18181b',
    utility: { namespace: 'color', name: 'primary' },
  },
  {
    var: '--kit-color-primary-foreground',
    path: 'color.primaryForeground',
    type: 'color',
    css: '#f8fafc',
    utility: { namespace: 'color', name: 'primary-foreground' },
  },
  {
    var: '--kit-radius-md',
    path: 'radius.md',
    type: 'dimension',
    css: '8px',
    utility: { namespace: 'radius', name: 'md' },
  },
  {
    var: '--kit-space-md',
    path: 'space.md',
    type: 'dimension',
    css: '12px',
    utility: { namespace: 'spacing', name: 'md' },
  },
];

/** A component whose root tag has `attrs`, and the offset of that tag. */
function tsx(attrs: string): { text: string; at: number } {
  const text = `export function Hero() {\n  return <div${attrs}>Hello</div>;\n}\n`;
  return { text, at: text.indexOf('<div') };
}

function textOf(result: ApplyResult): string {
  if (!('text' in result)) assert.fail(`not applied: ${JSON.stringify(result)}`);
  return result.text;
}

function utilityOp(op: SimpleOp): UtilityOp {
  if (op.op !== 'setUtility') assert.fail(`not a utility op: ${op.op}`);
  return op;
}

/** Applies `op` to the tag, checks its attributes, then its inverse gives the file back. */
function roundTrip(
  attrs: string,
  op: UtilityOp,
  expected: string,
  options: TsxOptions = PLAIN,
): void {
  const source = tsx(attrs);
  const applied = textOf(applyTsx(source.text, source.at, op, options));
  assert.equal(applied, tsx(expected).text);
  const back = applyTsx(applied, source.at, utilityOp(inverse(op)), options);
  assert.equal(textOf(back), source.text);
}

const apply = (attrs: string, op: UtilityOp, options: TsxOptions = PLAIN): ApplyResult => {
  const source = tsx(attrs);
  return applyTsx(source.text, source.at, op, options);
};

// ---- Variants -----------------------------------------------------------------------------------

test('a class splits into its variants and its utility, colons in brackets left alone', () => {
  assert.deepEqual(splitUtility('p-4', V4), { variants: [], base: 'p-4' });
  assert.deepEqual(splitUtility('md:hover:p-6', V4), { variants: ['md', 'hover'], base: 'p-6' });
  assert.deepEqual(splitUtility('min-[900px]:text-[color:var(--x)]', V4), {
    variants: ['min-[900px]'],
    base: 'text-[color:var(--x)]',
  });
  assert.deepEqual(splitUtility('[&:hover]:p-2', V4), { variants: ['[&:hover]'], base: 'p-2' });
});

test('a prefix is read where the version writes it: v3 after the variants, v4 before them', () => {
  assert.deepEqual(splitUtility('hover:tw-p-4', TW3), { variants: ['hover'], base: 'p-4' });
  // The important mark and a negative value's minus stand before the prefix.
  assert.deepEqual(splitUtility('tablet:!-tw-mt-2', TW3), {
    variants: ['tablet'],
    base: '!-mt-2',
  });
  // An arbitrary property takes no prefix in Tailwind 3.
  assert.deepEqual(splitUtility('[outline-style:none]', TW3), {
    variants: [],
    base: '[outline-style:none]',
  });
  assert.deepEqual(splitUtility('tw:hover:p-4', TW4), { variants: ['hover'], base: 'p-4' });
  // A class without the prefix, or with it in the other version's place, is no class of the project.
  const outside: [string, TailwindTheme][] = [
    ['hover:p-4', TW3],
    ['tw-hover:p-4', TW3],
    ['p-4', TW4],
    ['hover:tw:p-4', TW4],
  ];
  for (const [other, theme] of outside) {
    assert.equal(splitUtility(other, theme), null, other);
    assert.equal(knownUtility(other, theme), false, other);
  }
});

test('a prefixed class is written back as it was read (Review Focus 4)', () => {
  assert.equal(utilityIn('p-4', at(null, 'hover'), TW3), 'hover:tw-p-4');
  assert.equal(utilityIn('!-mt-2', at(700, null), TW3), 'tablet:!-tw-mt-2');
  assert.equal(
    utilityIn('[outline-style:none]', at(700, null), TW3),
    'tablet:[outline-style:none]',
  );
  assert.equal(utilityIn('p-4', at(null, 'hover'), TW4), 'tw:hover:p-4');
  assert.equal(utilityIn('p-4', at(null, null), V4), 'p-4');
  const cases: [string, TailwindTheme][] = [
    ['hover:tw-p-4', TW3],
    ['tablet:hover:tw-bg-primary', TW3],
    ['-tw-mt-2', TW3],
    ['tw:hover:p-4', TW4],
    ['tw:tablet:p-6', TW4],
  ];
  for (const [className, theme] of cases) {
    const split = splitUtility(className, theme);
    if (split === null) assert.fail(`not read: ${className}`);
    const context = contextOfVariants(split.variants, theme.screens);
    if (context === null) assert.fail(`no context: ${className}`);
    assert.equal(utilityIn(split.base, context, theme), className);
    assert.equal(knownUtility(className, theme), true, className);
  }
});

test('the variants of a context are one screen and one state, in any order', () => {
  const screens = DEFAULT_SCREENS;
  assert.deepEqual(contextOfVariants([], screens), at(null, null));
  assert.deepEqual(contextOfVariants(['md'], screens), at(768, null));
  assert.deepEqual(contextOfVariants(['xl', 'hover'], screens), at(1280, 'hover'));
  assert.deepEqual(contextOfVariants(['focus-visible', 'lg'], screens), at(1024, 'focus-visible'));
  assert.deepEqual(contextOfVariants(['min-[900px]', 'active'], screens), at(900, 'active'));
  for (const other of [['dark'], ['md', 'xl'], ['hover', 'active'], ['group-hover'], ['focus']]) {
    assert.equal(contextOfVariants(other, screens), null, other.join(':'));
  }
});

test('a context is written with the screen of its width, then the state', () => {
  const screens = DEFAULT_SCREENS;
  assert.equal(variantPrefix(at(null, null), screens), '');
  assert.equal(variantPrefix(at(768, null), screens), 'md:');
  assert.equal(variantPrefix(at(1280, null), screens), 'xl:');
  assert.equal(variantPrefix(at(null, 'hover'), screens), 'hover:');
  assert.equal(variantPrefix(at(768, 'hover'), screens), 'md:hover:');
  assert.equal(variantPrefix(at(1280, 'focus-visible'), screens), 'xl:focus-visible:');
  // A breakpoint the project has no screen for is written as its min width.
  assert.equal(screenOf(900, screens), 'min-[900px]');
  assert.equal(variantPrefix(at(900, 'active'), screens), 'min-[900px]:active:');
  for (const width of [640, 768, 900, 1024, 1280, 1536]) {
    const context = at(width, 'hover');
    const variants = variantPrefix(context, screens)
      .split(':')
      .filter((part) => part !== '');
    assert.deepEqual(contextOfVariants(variants, screens), context);
  }
});

test("a project's own screens are written and read back; without a theme Tailwind's are (Review Focus 5)", () => {
  assert.equal(variantPrefix(at(700, 'hover'), TW3.screens), 'tablet:hover:');
  assert.deepEqual(contextOfVariants(['tablet'], TW3.screens), at(700, null));
  // A screen the project does not have makes no CSS there: kitvas writes no such class.
  assert.equal(contextOfVariants(['md'], TW3.screens), null);
  assert.equal(screenOf(768, TW3.screens), 'min-[768px]');
  assert.deepEqual(DEFAULT_SCREENS, { sm: 640, md: 768, lg: 1024, xl: 1280, '2xl': 1536 });
  assert.deepEqual(themeOrDefault(null), {
    version: 4,
    prefix: '',
    screens: DEFAULT_SCREENS,
    aliases: {},
  });
  assert.equal(themeOrDefault(TW3), TW3);
  // A Tailwind 4 that could not say its screens (no design-system loader) has Tailwind's own.
  const unsaid = themeOrDefault({ version: 4, prefix: 'tw:', screens: {}, aliases: {} });
  assert.deepEqual(unsaid, { version: 4, prefix: 'tw:', screens: DEFAULT_SCREENS, aliases: {} });
  assert.equal(knownUtility('tw:md:p-4', unsaid), true);
  assert.equal(utilityIn('p-4', at(1024, null), unsaid), 'tw:lg:p-4');
  const found = utilityOverrides(['tw-p-2', 'tablet:tw-p-4', 'md:tw-p-6'], [], TW3);
  assert.deepEqual(
    found.filter((each) => each.property === 'padding').map((each) => [each.context, each.utility]),
    [[at(700, null), 'tablet:tw-p-4']],
  );
});

test('a class kitvas may write sets a property of its set, under a screen, a state or both', () => {
  for (const known of ['p-4', 'md:p-6', 'hover:bg-primary', 'md:hover:p-[13px]', 'xl:flex-col']) {
    assert.equal(knownUtility(known, V4), true, known);
  }
  for (const other of ['dark:p-4', 'md:xl:p-4', 'pointer-events-none', 'md:max-w-md', 'x']) {
    assert.equal(knownUtility(other, V4), false, other);
  }
});

test('v3 writes outline for a solid outline and [outline-style:none] for none', () => {
  assert.equal(keywordUtility('outline-style', 'solid', 3), 'outline');
  assert.equal(keywordUtility('outline-style', 'none', 3), '[outline-style:none]');
  assert.equal(keywordUtility('outline-style', 'dashed', 3), 'outline-dashed');
  // Tailwind 4 has a class of its own for each.
  assert.equal(keywordUtility('outline-style', 'solid', 4), 'outline-solid');
  assert.equal(keywordUtility('outline-style', 'none', 4), 'outline-none');
  // Every other keyword is written the same in both.
  assert.equal(keywordUtility('display', 'none', 3), 'hidden');
  assert.equal(keywordUtility('display', 'contents', 3), undefined);
  // Each is read back as its keyword.
  const found = utilityOverrides(['hover:tw-outline', 'tablet:[outline-style:none]'], [], TW3);
  assert.deepEqual(
    found
      .filter((each) => each.property === 'outline-style')
      .map((each) => [each.context, each.value]),
    [
      [at(null, 'hover'), 'solid'],
      [at(700, null), 'none'],
    ],
  );
  assert.equal(knownUtility('tablet:[outline-style:none]', TW3), true);
});

test("a property's own utility is the one that sets it alone", () => {
  assert.deepEqual(ownPrefixes('padding'), ['p-']);
  assert.deepEqual(ownPrefixes('padding-top'), ['pt-']);
  assert.deepEqual(ownPrefixes('width'), ['w-']);
  assert.deepEqual(ownPrefixes('border-width'), ['border-', 'border']);
  assert.deepEqual(ownPrefixes('flex-direction'), [
    'flex-row',
    'flex-row-reverse',
    'flex-col',
    'flex-col-reverse',
  ]);
  assert.deepEqual(ownProperties('p-4', 4), ['padding']);
  assert.deepEqual(ownProperties('gap-2', 4), ['gap']);
  assert.deepEqual(ownProperties('text-sm', 4), ['font-size']);
  assert.deepEqual(ownProperties('text-primary', 4), ['color']);
  assert.deepEqual(ownProperties('flex-col', 4), ['flex-direction']);
  assert.deepEqual(ownProperties('pointer-events-none', 4), []);
  // Tailwind 4's bare `outline` is a 1px line; Tailwind 3's only says the line is solid.
  assert.ok(ownProperties('outline', 4).includes('outline-width'));
  assert.deepEqual(ownProperties('outline', 3), ['outline-style']);
  assert.deepEqual(ownProperties('outline-2', 3), ['outline-width']);
});

test("a token's map value names its theme key: a v4 theme variable or a v3 theme path", () => {
  assert.deepEqual(themeKeyOf('--color-primary'), { namespace: 'color', name: 'primary' });
  assert.deepEqual(themeKeyOf('--radius-md'), { namespace: 'radius', name: 'md' });
  assert.deepEqual(themeKeyOf('--spacing-md'), { namespace: 'spacing', name: 'md' });
  assert.deepEqual(themeKeyOf('--font-weight-bold'), { namespace: 'font-weight', name: 'bold' });
  assert.deepEqual(themeKeyOf('--color-primary-foreground'), {
    namespace: 'color',
    name: 'primary-foreground',
  });
  assert.deepEqual(themeKeyOf('theme(colors.primary)'), { namespace: 'colors', name: 'primary' });
  assert.deepEqual(themeKeyOf('theme(borderRadius.md)'), {
    namespace: 'borderRadius',
    name: 'md',
  });
  assert.deepEqual(themeKeyOf('theme(spacing.4)'), { namespace: 'spacing', name: '4' });
  // A colour's nested keys join with `-`, and `DEFAULT` is the key's own class: Tailwind 3 cannot
  // read a nested colour as `theme(colors.primary)`, so a kit maps it onto its `DEFAULT`.
  assert.deepEqual(themeKeyOf('theme(colors.brand.500)'), {
    namespace: 'colors',
    name: 'brand-500',
  });
  assert.deepEqual(themeKeyOf('theme(colors.primary.DEFAULT)'), {
    namespace: 'colors',
    name: 'primary',
  });
  assert.deepEqual(themeKeyOf('theme(colors.primary.foreground)'), {
    namespace: 'colors',
    name: 'primary-foreground',
  });
  // A variable of the project's own, a sub-key and a key with no name of its own name none.
  const none = [
    '--primary',
    '--radius',
    '--font-sans',
    '--text-sm--line-height',
    'theme(borderRadius.DEFAULT)',
    'hsl(var(--primary))',
  ];
  for (const value of none) assert.equal(themeKeyOf(value), undefined, value);
});

/** A kit token, mapped onto the theme key `utility` or onto none. */
const keyed = (
  path: string,
  type: TokenOption['type'],
  utility?: TokenOption['utility'],
): TokenOption => ({
  var: `--kit-${path.replace('.', '-')}`,
  path,
  type,
  css: '1px',
  ...(utility === undefined ? {} : { utility }),
});

/** The value an override of `property` shows. */
const valueIn = (found: readonly UtilityOverride[], property: string): string | undefined =>
  found.find((each) => each.property === property)?.value;

test('a class names a token only through its theme key, for a property of its namespace', () => {
  // `md` is a radius's key: with no spacing key named `md`, `p-md` names no token.
  const four = [
    keyed('radius.md', 'dimension', { namespace: 'radius', name: 'md' }),
    keyed('space.md', 'dimension'),
  ];
  const v4 = utilityOverrides(['md:p-md', 'md:rounded-md'], four, V4);
  assert.equal(valueIn(v4, 'padding'), 'md');
  assert.equal(valueIn(v4, 'border-radius'), 'var(--kit-radius-md)');
  // Tailwind 3's keys, read through the project's prefix and screens.
  const three = [
    keyed('color.primary', 'color', { namespace: 'colors', name: 'primary' }),
    keyed('radius.md', 'dimension', { namespace: 'borderRadius', name: 'md' }),
    keyed('space.md', 'dimension', { namespace: 'spacing', name: '4' }),
  ];
  const classes = ['hover:tw-bg-primary', 'tablet:tw-rounded-md', 'tablet:tw-p-4'];
  const read = utilityOverrides(classes, three, TW3);
  assert.equal(valueIn(read, 'background-color'), 'var(--kit-color-primary)');
  assert.equal(valueIn(read, 'border-radius'), 'var(--kit-radius-md)');
  assert.equal(valueIn(read, 'padding'), 'var(--kit-space-md)');
  // A Tailwind 4 key is no key of a Tailwind 3 theme.
  const crossed = utilityOverrides(['hover:tw-bg-primary'], TOKENS, TW3);
  assert.equal(valueIn(crossed, 'background-color'), 'primary');
});

// ---- Overrides ----------------------------------------------------------------------------------

test('prefixed classes are the overrides of their context, with the value they hold', () => {
  const classes = 'flex p-4 md:p-md md:hover:bg-primary xl:flex-col hover:w-[13px] dark:p-2'.split(
    ' ',
  );
  const found = utilityOverrides(classes, TOKENS, V4);
  const of = (property: string) =>
    found
      .filter((each) => each.property === property)
      .map((each) => [each.context, each.value, each.offKit, each.utility]);
  assert.deepEqual(of('padding'), [[at(768, null), 'var(--kit-space-md)', false, 'md:p-md']]);
  // `p-` sets every side, so the side's row shows it too; only the own row may swap it.
  assert.deepEqual(of('padding-top'), [[at(768, null), 'var(--kit-space-md)', false, 'md:p-md']]);
  assert.deepEqual(of('background-color'), [
    [at(768, 'hover'), 'var(--kit-color-primary)', false, 'md:hover:bg-primary'],
  ]);
  assert.deepEqual(of('flex-direction'), [[at(1280, null), 'column', false, 'xl:flex-col']]);
  assert.deepEqual(of('width'), [[at(null, 'hover'), '13px', true, 'hover:w-[13px]']]);
  // The base classes and a variant kitvas does not write are no overrides.
  assert.deepEqual(of('display'), []);
  assert.equal(
    found.some((each) => each.utility === 'dark:p-2' || each.utility === 'p-4'),
    false,
  );
});

test('an arbitrary value is read without its type and with its spaces', () => {
  const found = utilityOverrides(
    [
      'md:text-[length:var(--kit-space-md)]',
      'md:text-[color:#f00]',
      'hover:p-[1px_2px]',
      'md:leading-6',
    ],
    TOKENS,
    V4,
  );
  const value = (property: string) => {
    const hit = found.find((each) => each.property === property);
    return hit === undefined ? null : [hit.value, hit.offKit];
  };
  // A kit variable in brackets is still the kit's token.
  assert.deepEqual(value('font-size'), ['var(--kit-space-md)', false]);
  assert.deepEqual(value('color'), ['#f00', true]);
  assert.deepEqual(value('padding'), ['1px 2px', true]);
  assert.deepEqual(value('line-height'), ['6', false]);
});

// ---- The op -------------------------------------------------------------------------------------

test('a class is added after the last one, and its inverse takes it out again', () => {
  roundTrip(' className="flex gap-4"', utility('md:p-6', null), ' className="flex gap-4 md:p-6"');
  // Spaces and line breaks of the string stay as written.
  roundTrip(
    ' className="flex  gap-4 "',
    utility('hover:bg-primary', null),
    ' className="flex  gap-4 hover:bg-primary "',
  );
  roundTrip(
    " id='a' className='flex\n      gap-4' title=\"x\"",
    utility('p-4', null),
    " id='a' className='flex\n      gap-4 p-4' title=\"x\"",
  );
});

test('an element without a className gets one, and loses it with its only class', () => {
  roundTrip('', utility('md:hover:p-6', null), ' className="md:hover:p-6"');
  roundTrip(' id="hero"', utility('p-4', null), ' className="p-4" id="hero"');
  roundTrip(
    '\n    id="hero"\n  ',
    utility('p-4', null),
    '\n    className="p-4"\n    id="hero"\n  ',
  );
  assert.equal(
    textOf(apply(' className=" p-4 " id="a"', utility(null, 'p-4'))),
    tsx(' id="a"').text,
  );
});

test('a class is swapped in its place', () => {
  roundTrip(' className="flex p-4 gap-2"', utility('p-6', 'p-4'), ' className="flex p-6 gap-2"');
  roundTrip(
    ' className="md:p-4 p-2"',
    utility('md:p-[13px]', 'md:p-4'),
    ' className="md:p-[13px] p-2"',
  );
});

test('a class is taken out with the space that set it off', () => {
  const cases: [string, string, string][] = [
    ['flex p-4 gap-2', 'p-4', 'flex gap-2'],
    ['p-4 flex', 'p-4', 'flex'],
    ['flex p-4', 'p-4', 'flex'],
    ['flex   p-4  gap-2', 'p-4', 'flex   gap-2'],
    ['flex md:hover:p-6 ', 'md:hover:p-6', 'flex '],
  ];
  for (const [from, name, to] of cases) {
    assert.equal(
      textOf(apply(` className="${from}"`, utility(null, name))),
      tsx(` className="${to}"`).text,
      from,
    );
  }
});

test('a className built in code, an unknown class and a doubled one are refused', () => {
  const add = utility('md:p-6', null);
  assert.deepEqual(apply(' className={cn("flex", wide && "p-4")}', add), { refused: 'computed' });
  assert.deepEqual(apply(' className={styles.hero}', utility(null, 'p-4')), {
    refused: 'computed',
  });
  assert.deepEqual(apply(' className="flex"', utility('dark:p-4', null)), {
    refused: 'utility-unknown',
  });
  assert.deepEqual(apply(' className="flex"', utility('pointer-events-none', null)), {
    refused: 'utility-unknown',
  });
  assert.deepEqual(apply(' className="p-4 flex p-4"', utility('p-6', 'p-4')), {
    refused: 'ambiguous',
  });
  assert.deepEqual(apply(' className="p-4 p-6"', utility('p-6', 'p-4')), { refused: 'ambiguous' });
  assert.deepEqual(apply(' className="a" className="b"', add), { refused: 'ambiguous' });
  assert.deepEqual(apply(' className="flex"', utility(null, null)), { refused: 'invalid' });
});

test("a class is written with the project's prefix and screens, and refused without them", () => {
  const three = { force: false, tailwind: TW3 };
  roundTrip(
    ' className="tw-flex tw-p-4"',
    utility('tablet:hover:tw-p-6', null),
    ' className="tw-flex tw-p-4 tablet:hover:tw-p-6"',
    three,
  );
  roundTrip(' className="tw-p-4"', utility('tw-p-6', 'tw-p-4'), ' className="tw-p-6"', three);
  const four = { force: false, tailwind: TW4 };
  roundTrip(
    ' className="tw:p-4"',
    utility('tw:md:p-6', null),
    ' className="tw:p-4 tw:md:p-6"',
    four,
  );
  // A class of no screen of the project, or without its prefix, makes no CSS there.
  for (const other of ['md:tw-p-6', 'hover:p-6']) {
    assert.deepEqual(apply(' className="tw-p-4"', utility(other, null), three), {
      refused: 'utility-unknown',
    });
  }
  assert.deepEqual(apply(' className="flex"', utility('hover:tw-p-6', null)), {
    refused: 'utility-unknown',
  });
});

test('a utility added to an empty className is written inside its quotes', () => {
  const add = utility('md:p-6', null);
  assert.equal(textOf(apply(' className=""', add)), tsx(' className="md:p-6"').text);
  assert.equal(textOf(apply(" className=''", add)), tsx(" className='md:p-6'").text);
  // Whitespace alone counts as empty: the class goes in at the start, the rest stays.
  assert.equal(textOf(apply(' className=" "', add)), tsx(' className="md:p-6 "').text);
});

test('a class that is not what the person saw is a conflict, unless they keep theirs', () => {
  const swap = utility('p-6', 'p-4');
  assert.deepEqual(apply(' className="flex p-2"', swap), { conflict: 'changed' });
  assert.deepEqual(apply('', swap), { conflict: 'changed' });
  assert.deepEqual(apply(' className="flex p-6"', utility('p-6', null)), { conflict: 'changed' });
  assert.deepEqual(apply(' className="flex"', utility(null, 'p-4')), { conflict: 'changed' });
  // "Keep mine": the class goes in where the old one is gone, and nothing is doubled.
  assert.equal(
    textOf(apply(' className="flex p-2"', swap, FORCE)),
    tsx(' className="flex p-2 p-6"').text,
  );
  assert.equal(textOf(apply('', swap, FORCE)), tsx(' className="p-6"').text);
  const kept = tsx(' className="flex p-6"').text;
  assert.equal(textOf(apply(' className="flex p-6"', utility('p-6', null), FORCE)), kept);
  assert.deepEqual(apply(' className="flex"', utility(null, 'p-4'), FORCE), {
    refused: 'not-found',
  });
});
