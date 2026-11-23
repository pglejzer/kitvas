import assert from 'node:assert/strict';
import { join } from 'node:path';
import { test } from 'node:test';
import {
  PROP_FOR,
  type SourceInput,
  styleSource,
  tokenGroupsOf,
  UTILITY_PREFIXES,
} from '../../src/edit/domain/source.ts';
import {
  type RuleView,
  STYLE_PROPERTIES,
  type StyleProperty,
  type StyleSource,
} from '../../src/edit/index.ts';
import { createFolderKitStore } from '../../src/kit/adapters/folder-store.ts';
import { requireKit } from '../../src/kit/index.ts';
import { PLUGIN_ROOT } from '../../src/shared/index.ts';

type Component = NonNullable<SourceInput['component']>;

const base = requireKit(createFolderKitStore(join(PLUGIN_ROOT, 'kits')), 'base');
const baseGroups = tokenGroupsOf(
  base.tokens.map((token) => ({ path: token.path.join('.'), type: token.type })),
);

/** A Base catalog component as the kit loads it, so its type is checked against the input too. */
function baseComponent(name: string): Component {
  const found = base.kit.components.find((component) => component.name === name);
  if (found === undefined) throw new Error(`Base has no ${name}`);
  return found;
}

const enumProp = (name: string, values: string[]) => ({ name, type: 'enum', values });

const input = (
  property: StyleProperty,
  over: Partial<Omit<SourceInput, 'property'>> = {},
): SourceInput => ({
  property,
  component: null,
  written: [],
  rule: null,
  classes: [],
  format: 'scss',
  tokenGroups: baseGroups,
  ...over,
});

const span = { start: 0, end: 0 };
const rule = (
  className: string,
  declarations: [property: string, value: string, offKit?: boolean][],
  nested: string[] = [],
): RuleView => ({
  className,
  span,
  declarations: declarations.map(([property, value, offKit = false]) => ({
    property,
    value,
    offKit,
    span,
  })),
  nested,
});

/** The utility class named for `property` in a Tailwind draft, or `null`. */
function utility(property: StyleProperty, ...classes: string[]): string | null {
  const found = styleSource(input(property, { format: 'tailwind', classes }));
  return found.kind === 'utility' ? found.className : null;
}

test('a Base Stack takes its gap from the gap prop, whether the tag writes it or not', () => {
  for (const written of [[], ['gap'], ['direction']]) {
    assert.deepEqual(styleSource(input('gap', { component: baseComponent('Stack'), written })), {
      kind: 'prop',
      prop: 'gap',
    });
  }
  assert.deepEqual(styleSource(input('gap', { component: baseComponent('Grid') })), {
    kind: 'prop',
    prop: 'gap',
  });
});

test('a Base Text with tone takes its colour from the tone prop', () => {
  const text = baseComponent('Text');
  assert.deepEqual(styleSource(input('color', { component: text, written: ['tone'] })), {
    kind: 'prop',
    prop: 'tone',
  });
});

test('the Base props of the table set their properties, and the rest is the kit default', () => {
  const cases: [string, StyleProperty, StyleSource][] = [
    ['Card', 'padding', { kind: 'prop', prop: 'padding' }],
    ['Text', 'font-size', { kind: 'prop', prop: 'size' }],
    ['Text', 'font-weight', { kind: 'prop', prop: 'weight' }],
    ['Heading', 'font-size', { kind: 'prop', prop: 'size' }],
    ['Button', 'font-size', { kind: 'prop', prop: 'size' }],
    ['Button', 'color', { kind: 'prop', prop: 'tone' }],
    ['Badge', 'color', { kind: 'prop', prop: 'tone' }],
    // `variant` is in no row of the table: the edit is a rule that says it overrides the kit.
    ['Button', 'background-color', { kind: 'kit' }],
    // `padding` cannot set one axis alone, so the block padding is a rule over the kit.
    ['Card', 'padding-block', { kind: 'kit' }],
    ['Stack', 'padding', { kind: 'kit' }],
    ['Heading', 'color', { kind: 'kit' }],
    // Icon's `size` is a number, not a scale of tokens.
    ['Icon', 'font-size', { kind: 'kit' }],
  ];
  for (const [name, property, expected] of cases) {
    const found = styleSource(input(property, { component: baseComponent(name) }));
    assert.deepEqual(found, expected, `${name} ${property}`);
  }
});

test('a plain div takes its gap from the gap declaration of its class rule', () => {
  const card = rule('card', [['gap', 'var(--kit-space-md)']]);
  assert.deepEqual(styleSource(input('gap', { rule: card, classes: ['card'] })), {
    kind: 'scss',
    className: 'card',
    value: 'var(--kit-space-md)',
    offKit: false,
  });
});

test('an off-kit declaration keeps its value and its mark', () => {
  const card = rule('card', [['padding', '13px', true]]);
  assert.deepEqual(styleSource(input('padding', { rule: card, classes: ['card'] })), {
    kind: 'scss',
    className: 'card',
    value: '13px',
    offKit: true,
  });
});

test('a declaration only inside a nested block is not the rule source', () => {
  // `.card { color: var(--kit-color-ink); &:hover { gap: var(--kit-space-lg); } }`
  const card = rule('card', [['color', 'var(--kit-color-ink)']], ['gap']);
  assert.deepEqual(styleSource(input('gap', { rule: card, classes: ['card'] })), { kind: 'kit' });
  assert.equal(styleSource(input('color', { rule: card, classes: ['card'] })).kind, 'scss');
});

test('the last of two declarations of the property is the one that applies', () => {
  const card = rule('card', [
    ['gap', 'var(--kit-space-sm)'],
    ['Gap', 'var(--kit-space-lg)'],
  ]);
  assert.deepEqual(styleSource(input('gap', { rule: card })), {
    kind: 'scss',
    className: 'card',
    value: 'var(--kit-space-lg)',
    offKit: false,
  });
});

test('a Tailwind p-4 is the utility source of padding, and md:p-6 too', () => {
  const plain = styleSource(input('padding', { format: 'tailwind', classes: ['flex', 'p-4'] }));
  assert.deepEqual(plain, { kind: 'utility', className: 'p-4' });
  const wide = styleSource(input('padding', { format: 'tailwind', classes: ['md:p-6'] }));
  assert.deepEqual(wide, { kind: 'utility', className: 'md:p-6' });
});

test('an enum prop named size whose values are no token names is not the font-size source', () => {
  const chip = { props: [enumProp('size', ['default', 'compact'])] };
  assert.deepEqual(styleSource(input('font-size', { component: chip, written: ['size'] })), {
    kind: 'kit',
  });
  // The Tailwind fixture's Button: `default` is no token of its kit, which has no font sizes.
  const shad = tokenGroupsOf([
    { path: 'color.primary', type: 'color' },
    { path: 'color.primaryForeground', type: 'color' },
    { path: 'radius.md', type: 'dimension' },
  ]);
  const button = {
    props: [enumProp('variant', ['default', 'outline']), enumProp('size', ['default', 'sm'])],
  };
  const found = styleSource(
    input('font-size', { component: button, tokenGroups: shad, format: 'tailwind' }),
  );
  assert.deepEqual(found, { kind: 'kit' });
});

test('without a prop, a declaration or a utility, the value is the kit default', () => {
  assert.deepEqual(styleSource(input('gap')), { kind: 'kit' });
  assert.deepEqual(styleSource(input('gap', { format: 'tailwind', classes: ['flex'] })), {
    kind: 'kit',
  });
  assert.deepEqual(styleSource(input('gap', { rule: rule('card', []), classes: ['card'] })), {
    kind: 'kit',
  });
});

test('the prop comes before a declaration of the same property in the class rule', () => {
  const stack = baseComponent('Stack');
  const card = rule('stack', [['gap', '13px', true]]);
  assert.deepEqual(styleSource(input('gap', { component: stack, rule: card })), {
    kind: 'prop',
    prop: 'gap',
  });
});

test('the class rule comes before a utility in a Tailwind draft', () => {
  const hero = rule('hero', [['padding', 'var(--kit-space-lg)']]);
  const found = styleSource(
    input('padding', { format: 'tailwind', rule: hero, classes: ['hero', 'p-4'] }),
  );
  assert.equal(found.kind, 'scss');
});

test('an SCSS draft never reads its classes as utilities', () => {
  assert.deepEqual(styleSource(input('padding', { classes: ['p-4'] })), { kind: 'kit' });
});

test('a prop named like the property is its source whatever its values', () => {
  // The repo fixture's Stack: `gap` is `tight` or `normal`, which no token is called.
  const stack = { props: [enumProp('gap', ['tight', 'normal'])] };
  const groups = tokenGroupsOf([{ path: 'space.gap', type: 'dimension' }]);
  assert.deepEqual(styleSource(input('gap', { component: stack, tokenGroups: groups })), {
    kind: 'prop',
    prop: 'gap',
  });
  const text = { props: [enumProp('fontSize', ['small', 'large'])] };
  assert.deepEqual(styleSource(input('font-size', { component: text })), {
    kind: 'prop',
    prop: 'fontSize',
  });
});

test('only an enum prop with values can be the source', () => {
  const props: Component['props'][] = [
    [{ name: 'gap', type: 'number' }],
    [{ name: 'gap', type: 'string' }],
    [{ name: 'gap', type: 'enum' }],
    [{ name: 'gap', type: 'enum', values: [] }],
  ];
  for (const list of props) {
    assert.deepEqual(styleSource(input('gap', { component: { props: list } })), { kind: 'kit' });
  }
});

test('a prop name that is only a hint needs its values in one token group of the type', () => {
  const cases: [StyleProperty, ReturnType<typeof enumProp>, boolean][] = [
    ['padding', enumProp('p', ['sm', 'md']), true],
    // `sm` is a space token and `control` a size token: no one group has both.
    ['padding', enumProp('p', ['sm', 'control']), false],
    // `none` may stand beside a scale that has no token for it, but is no scale alone.
    ['border-radius', enumProp('rounded', ['none', 'sm', 'full']), true],
    ['padding', enumProp('p', ['none']), false],
    // `bold` is a font weight token, not a dimension.
    ['width', enumProp('w', ['bold']), false],
    // Names compare without case and separators: `ink-mid` is `color.inkMid`.
    ['background-color', enumProp('bg', ['ink-mid', 'Surface']), true],
    ['line-height', enumProp('leading', ['tight', 'normal']), true],
  ];
  for (const [property, prop, isProp] of cases) {
    const found = styleSource(input(property, { component: { props: [prop] } }));
    const expected: StyleSource = isProp ? { kind: 'prop', prop: prop.name } : { kind: 'kit' };
    assert.deepEqual(found, expected, `${prop.name} ${prop.values.join(',')} for ${property}`);
  }
});

test('the prop the tag writes wins over another prop of the same property', () => {
  const text = {
    props: [enumProp('tone', ['muted', 'loud']), enumProp('color', ['red', 'blue'])],
  };
  assert.deepEqual(styleSource(input('color', { component: text })), {
    kind: 'prop',
    prop: 'color',
  });
  assert.deepEqual(styleSource(input('color', { component: text, written: ['tone'] })), {
    kind: 'prop',
    prop: 'tone',
  });
});

test('the utilities of the Tailwind fixture name their class on each row', () => {
  // `<div className="flex flex-col gap-4 p-6">` and `<h1 className="text-2xl font-semibold">`.
  const div = ['flex', 'flex-col', 'gap-4', 'p-6'];
  assert.equal(utility('gap', ...div), 'gap-4');
  assert.equal(utility('padding', ...div), 'p-6');
  assert.equal(utility('padding-inline', ...div), 'p-6');
  assert.equal(utility('color', ...div), null);
  const heading = ['text-2xl', 'font-semibold'];
  assert.equal(utility('font-size', ...heading), 'text-2xl');
  assert.equal(utility('font-weight', ...heading), 'font-semibold');
  assert.equal(utility('color', ...heading), null);
  // The fixture Card's own classes: `rounded-md border border-primary`.
  const card = ['rounded-md', 'border', 'border-primary'];
  assert.equal(utility('border-radius', ...card), 'rounded-md');
  assert.equal(utility('border-width', ...card), 'border');
  assert.equal(utility('border-color', ...card), 'border-primary');
});

test('a prefix shared by two meanings is told apart by the value', () => {
  const cases: [StyleProperty, string, boolean][] = [
    ['font-size', 'text-sm/6', true],
    ['font-size', 'text-[13px]', true],
    ['font-size', 'text-[length:var(--size)]', true],
    ['font-size', 'text-primary', false],
    ['color', 'text-primary', true],
    ['color', 'text-red-500/50', true],
    ['color', 'text-[#f00]', true],
    ['color', 'text-(--ink)', true],
    ['color', 'text-[13px]', false],
    ['color', 'text-center', false],
    ['font-size', 'text-center', false],
    ['color', 'text-ellipsis', false],
    ['font-weight', 'font-[550]', true],
    ['font-weight', 'font-mono', false],
    ['font-weight', 'font-[family-name:Inter]', false],
    ['border-width', 'border-2', true],
    ['border-width', 'border-t', true],
    ['border-width', 'border-x-[3px]', true],
    ['border-width', 'border-primary', false],
    ['border-color', 'border', false],
    ['border-color', 'border-t-primary', true],
    ['border-color', 'border-[#ddd]', true],
    ['border-color', 'border-dashed', false],
    ['border-width', 'border-dashed', false],
    ['border-color', 'border-separate', false],
    ['background-color', 'bg-primary', true],
    ['background-color', 'bg-[#fff]', true],
    ['background-color', 'bg-cover', false],
    ['background-color', 'bg-left-top', false],
    ['background-color', 'bg-[url(/a.png)]', false],
    ['background-color', 'bg-linear-to-r', false],
  ];
  for (const [property, className, set] of cases) {
    assert.equal(utility(property, className), set ? className : null, `${className} ${property}`);
  }
});

test('the other prefixes set their property whatever the value', () => {
  const cases: [StyleProperty, string][] = [
    ['border-radius', 'rounded'],
    ['border-radius', 'rounded-t-lg'],
    ['line-height', 'leading-6'],
    ['width', 'w-1/2'],
    ['width', 'size-4'],
    ['height', 'h-[120px]'],
    ['gap', 'gap-x-2'],
    ['margin-inline', 'mx-auto'],
  ];
  for (const [property, className] of cases) {
    assert.equal(utility(property, className), className, `${className} ${property}`);
  }
  assert.equal(utility('padding', 'pointer-events-none'), null);
  assert.equal(utility('width', 'max-w-md'), null);
});

test('a class without a variant wins, then the prefix that Tailwind writes last', () => {
  assert.equal(utility('padding-block', 'md:py-2', 'p-6'), 'p-6');
  assert.equal(utility('padding-block', 'p-6', 'py-2'), 'py-2');
  assert.equal(utility('padding', 'md:hover:p-4', 'p-2'), 'p-2');
});

test('negative, important and arbitrary-variant classes are read by their utility', () => {
  assert.equal(utility('margin-block', '-mt-2'), '-mt-2');
  assert.equal(utility('padding', '!p-2'), '!p-2');
  assert.equal(utility('padding', 'p-2!'), 'p-2!');
  assert.equal(utility('padding', 'md:!p-2'), 'md:!p-2');
  // The `:` inside the brackets belongs to the variant, not a variant of its own.
  assert.equal(utility('padding', '[&:hover]:p-2'), '[&:hover]:p-2');
  assert.equal(utility('padding', 'data-[state=open]:px-3'), 'data-[state=open]:px-3');
});

test('tokenGroupsOf groups tokens by their path without the last part', () => {
  assert.deepEqual(
    tokenGroupsOf([
      { path: 'space.sm', type: 'dimension' },
      { path: 'space.md', type: 'dimension' },
      { path: 'radius.md', type: 'dimension' },
      { path: 'color.brand.500', type: 'color' },
      { path: 'alone', type: 'number' },
    ]),
    { dimension: { space: ['sm', 'md'], radius: ['md'] }, color: { 'color.brand': ['500'] } },
  );
  assert.deepEqual([...(baseGroups.dimension?.space ?? [])].sort(), [
    '2xl',
    '3xl',
    'lg',
    'md',
    'none',
    'sm',
    'xl',
    'xs',
  ]);
  assert.deepEqual(baseGroups.fontWeight, { fontWeight: ['regular', 'medium', 'bold'] });
});

test('every style property has its prop names, its own name first, and utility prefixes', () => {
  assert.deepEqual(Object.keys(PROP_FOR).sort(), [...STYLE_PROPERTIES].sort());
  assert.deepEqual(Object.keys(UTILITY_PREFIXES).sort(), [...STYLE_PROPERTIES].sort());
  for (const property of STYLE_PROPERTIES) {
    const own = property.replace(/-([a-z])/g, (_match: string, letter: string) =>
      letter.toUpperCase(),
    );
    assert.equal(PROP_FOR[property][0], own, property);
    assert.ok(UTILITY_PREFIXES[property].length > 0, property);
  }
});
