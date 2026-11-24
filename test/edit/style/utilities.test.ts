// The utility classes of a Tailwind draft (spec 4c, goal 2; plan 16, task A): the variants kitvas
// writes, the overrides the prefixed classes are, and the `setUtility` op on a literal `className`.

import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  contextOfVariants,
  knownUtility,
  ownPrefixes,
  ownProperties,
  screenOf,
  splitUtility,
  tokenName,
  utilityOverrides,
  variantPrefix,
} from '../../../src/edit/domain/style/utilities.ts';
import { applyTsx } from '../../../src/edit/domain/tsx/apply-tsx.ts';
import {
  type ApplyResult,
  type EditOp,
  inverse,
  type SimpleOp,
  type TokenOption,
} from '../../../src/edit/index.ts';

const ID = 'sections/Hero:div';
const PLAIN = { force: false };
const FORCE = { force: true };

type UtilityOp = Extract<EditOp, { op: 'setUtility' }>;

const utility = (value: string | null, before: string | null): UtilityOp => ({
  op: 'setUtility',
  id: ID,
  value,
  before,
});

const TOKENS: TokenOption[] = [
  { var: '--kit-color-primary', path: 'color.primary', type: 'color', css: '#18181b' },
  {
    var: '--kit-color-primary-foreground',
    path: 'color.primaryForeground',
    type: 'color',
    css: '#f8fafc',
  },
  { var: '--kit-radius-md', path: 'radius.md', type: 'dimension', css: '8px' },
  { var: '--kit-space-md', path: 'space.md', type: 'dimension', css: '12px' },
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
function roundTrip(attrs: string, op: UtilityOp, expected: string): void {
  const source = tsx(attrs);
  const applied = textOf(applyTsx(source.text, source.at, op, PLAIN));
  assert.equal(applied, tsx(expected).text);
  const back = applyTsx(applied, source.at, utilityOp(inverse(op)), PLAIN);
  assert.equal(textOf(back), source.text);
}

const apply = (attrs: string, op: UtilityOp, options = PLAIN): ApplyResult => {
  const source = tsx(attrs);
  return applyTsx(source.text, source.at, op, options);
};

// ---- Variants -----------------------------------------------------------------------------------

test('a class splits into its variants and its utility, colons in brackets left alone', () => {
  assert.deepEqual(splitUtility('p-4'), { variants: [], base: 'p-4' });
  assert.deepEqual(splitUtility('md:hover:p-6'), { variants: ['md', 'hover'], base: 'p-6' });
  assert.deepEqual(splitUtility('min-[900px]:text-[color:var(--x)]'), {
    variants: ['min-[900px]'],
    base: 'text-[color:var(--x)]',
  });
  assert.deepEqual(splitUtility('[&:hover]:p-2'), { variants: ['[&:hover]'], base: 'p-2' });
});

test('the variants of a context are one screen and one state, in any order', () => {
  assert.deepEqual(contextOfVariants([]), { width: null, state: null });
  assert.deepEqual(contextOfVariants(['md']), { width: 768, state: null });
  assert.deepEqual(contextOfVariants(['xl', 'hover']), { width: 1280, state: 'hover' });
  assert.deepEqual(contextOfVariants(['focus-visible', 'lg']), {
    width: 1024,
    state: 'focus-visible',
  });
  assert.deepEqual(contextOfVariants(['min-[900px]', 'active']), { width: 900, state: 'active' });
  for (const other of [['dark'], ['md', 'xl'], ['hover', 'active'], ['group-hover'], ['focus']]) {
    assert.equal(contextOfVariants(other), null, other.join(':'));
  }
});

test('a context is written with the Tailwind screen of its width, then the state', () => {
  assert.equal(variantPrefix({ width: null, state: null }), '');
  assert.equal(variantPrefix({ width: 768, state: null }), 'md:');
  assert.equal(variantPrefix({ width: 1280, state: null }), 'xl:');
  assert.equal(variantPrefix({ width: null, state: 'hover' }), 'hover:');
  assert.equal(variantPrefix({ width: 768, state: 'hover' }), 'md:hover:');
  assert.equal(variantPrefix({ width: 1280, state: 'focus-visible' }), 'xl:focus-visible:');
  // A breakpoint Tailwind has no screen for is written as its min width.
  assert.equal(screenOf(900), 'min-[900px]');
  assert.equal(variantPrefix({ width: 900, state: 'active' }), 'min-[900px]:active:');
  for (const width of [640, 768, 900, 1024, 1280, 1536]) {
    const context = { width, state: 'hover' as const };
    const variants = variantPrefix(context)
      .split(':')
      .filter((part) => part !== '');
    assert.deepEqual(contextOfVariants(variants), context);
  }
});

test('a class kitvas may write sets a property of its set, under a screen, a state or both', () => {
  for (const known of ['p-4', 'md:p-6', 'hover:bg-primary', 'md:hover:p-[13px]', 'xl:flex-col']) {
    assert.equal(knownUtility(known), true, known);
  }
  for (const other of ['dark:p-4', 'md:xl:p-4', 'pointer-events-none', 'md:max-w-md', 'x']) {
    assert.equal(knownUtility(other), false, other);
  }
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
  assert.deepEqual(ownProperties('p-4'), ['padding']);
  assert.deepEqual(ownProperties('gap-2'), ['gap']);
  assert.deepEqual(ownProperties('text-sm'), ['font-size']);
  assert.deepEqual(ownProperties('text-primary'), ['color']);
  assert.deepEqual(ownProperties('flex-col'), ['flex-direction']);
  assert.deepEqual(ownProperties('pointer-events-none'), []);
});

test('a token is named in a class by its path without the group, in kebab case', () => {
  assert.equal(tokenName('color.primary'), 'primary');
  assert.equal(tokenName('color.primaryForeground'), 'primary-foreground');
  assert.equal(tokenName('color.brand.500'), 'brand-500');
  assert.equal(tokenName('radius.md'), 'md');
  assert.equal(tokenName('alone'), 'alone');
});

// ---- Overrides ----------------------------------------------------------------------------------

test('prefixed classes are the overrides of their context, with the value they hold', () => {
  const classes = 'flex p-4 md:p-md md:hover:bg-primary xl:flex-col hover:w-[13px] dark:p-2'.split(
    ' ',
  );
  const found = utilityOverrides(classes, TOKENS);
  const of = (property: string) =>
    found
      .filter((each) => each.property === property)
      .map((each) => [each.context, each.value, each.offKit, each.utility]);
  assert.deepEqual(of('padding'), [
    [{ width: 768, state: null }, 'var(--kit-space-md)', false, 'md:p-md'],
  ]);
  // `p-` sets every side, so the side's row shows it too; only the own row may swap it.
  assert.deepEqual(of('padding-top'), [
    [{ width: 768, state: null }, 'var(--kit-space-md)', false, 'md:p-md'],
  ]);
  assert.deepEqual(of('background-color'), [
    [{ width: 768, state: 'hover' }, 'var(--kit-color-primary)', false, 'md:hover:bg-primary'],
  ]);
  assert.deepEqual(of('flex-direction'), [
    [{ width: 1280, state: null }, 'column', false, 'xl:flex-col'],
  ]);
  assert.deepEqual(of('width'), [
    [{ width: null, state: 'hover' }, '13px', true, 'hover:w-[13px]'],
  ]);
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
