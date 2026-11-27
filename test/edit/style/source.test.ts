import assert from 'node:assert/strict';
import { join } from 'node:path';
import { test } from 'node:test';
import {
  PROP_FOR,
  type SourceInput,
  styleSource,
  tokenGroupsOf,
  UTILITY_PREFIXES,
} from '../../../src/edit/domain/style/source.ts';
import {
  type RuleView,
  STYLE_PROPERTIES,
  type StyleProperty,
  type StyleSource,
} from '../../../src/edit/index.ts';
import { createFolderKitStore } from '../../../src/kit/adapters/folder-store.ts';
import { requireKit } from '../../../src/kit/index.ts';
import { PLUGIN_ROOT } from '../../../src/shared/index.ts';

type Component = NonNullable<SourceInput['component']>;

const base = requireKit(createFolderKitStore(join(PLUGIN_ROOT, 'kits')), 'kitvas-ui');
const baseGroups = tokenGroupsOf(
  base.tokens.map((token) => ({ path: token.path.join('.'), type: token.type })),
);

/** A kitvas UI catalog component as the kit loads it, so its type is checked against the input too. */
function baseComponent(name: string): Component {
  const found = base.kit.components.find((component) => component.name === name);
  if (found === undefined) throw new Error(`kitvas UI has no ${name}`);
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

test('a kitvas UI Stack takes its gap from the gap prop, whether the tag writes it or not', () => {
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

test('a kitvas UI Text with tone takes its colour from the tone prop', () => {
  const text = baseComponent('Text');
  assert.deepEqual(styleSource(input('color', { component: text, written: ['tone'] })), {
    kind: 'prop',
    prop: 'tone',
  });
});

test('the kitvas UI props of the table set their properties, and the rest is the kit default', () => {
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
  const card = rule('card', [['gap', 'var(--kit-space-12)']]);
  assert.deepEqual(styleSource(input('gap', { rule: card, classes: ['card'] })), {
    kind: 'scss',
    className: 'card',
    value: 'var(--kit-space-12)',
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
  // `.card { color: var(--kit-color-ink); &:hover { gap: var(--kit-space-16); } }`
  const card = rule('card', [['color', 'var(--kit-color-ink)']], ['gap']);
  assert.deepEqual(styleSource(input('gap', { rule: card, classes: ['card'] })), { kind: 'kit' });
  assert.equal(styleSource(input('color', { rule: card, classes: ['card'] })).kind, 'scss');
});

test('the last of two declarations of the property is the one that applies', () => {
  const card = rule('card', [
    ['gap', 'var(--kit-space-8)'],
    ['Gap', 'var(--kit-space-16)'],
  ]);
  assert.deepEqual(styleSource(input('gap', { rule: card })), {
    kind: 'scss',
    className: 'card',
    value: 'var(--kit-space-16)',
    offKit: false,
  });
});

test('a Tailwind p-4 is the utility source of padding; md:p-6 is a width override, not it', () => {
  const plain = styleSource(input('padding', { format: 'tailwind', classes: ['flex', 'p-4'] }));
  assert.deepEqual(plain, { kind: 'utility', className: 'p-4' });
  // Spec 4c: the base is the class without a variant; `md:p-6` is listed with the overrides.
  const wide = styleSource(input('padding', { format: 'tailwind', classes: ['md:p-6'] }));
  assert.deepEqual(wide, { kind: 'kit' });
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
  const hero = rule('hero', [['padding', 'var(--kit-space-16)']]);
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
    // `sm` is a font size and a radius token and `control` a size token: no one group has both.
    ['padding', enumProp('p', ['sm', 'control']), false],
    // `none` may stand beside a scale that has no token for it, but is no scale alone.
    ['border-radius', enumProp('rounded', ['none', 'sm', 'full']), true],
    ['padding', enumProp('p', ['none']), false],
    // `bold` is a font weight token, not a dimension.
    ['width', enumProp('w', ['bold']), false],
    // Names compare without case and separators: `ink-mid` is `color.inkMid`.
    ['background-color', enumProp('bg', ['ink-mid', 'Panel']), true],
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

test('negative and important classes are read by their utility; one under a variant is not the base', () => {
  assert.equal(utility('margin-block', '-mt-2'), '-mt-2');
  assert.equal(utility('padding', '!p-2'), '!p-2');
  assert.equal(utility('padding', 'p-2!'), 'p-2!');
  assert.equal(utility('padding', 'md:!p-2'), null);
  // The `:` inside the brackets belongs to the variant, not a variant of its own.
  assert.equal(utility('padding', '[&:hover]:p-2'), null);
  assert.equal(utility('padding', 'data-[state=open]:px-3'), null);
  // A `:` inside an arbitrary value is no variant.
  assert.equal(utility('color', 'text-[color:var(--ink)]'), 'text-[color:var(--ink)]');
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
    '10',
    '12',
    '14',
    '16',
    '2',
    '24',
    '32',
    '4',
    '48',
    '6',
    '64',
    '8',
    '96',
  ]);
  assert.deepEqual(baseGroups.fontWeight, { fontWeight: ['regular', 'medium', 'bold'] });
});

test('a kitvas UI Stack sets direction, wrap, justify and align by its props (plan 15)', () => {
  const stack = baseComponent('Stack');
  const cases: [StyleProperty, string][] = [
    ['flex-direction', 'direction'],
    ['flex-wrap', 'wrap'],
    ['justify-content', 'justify'],
    ['align-items', 'align'],
  ];
  for (const [property, prop] of cases) {
    assert.deepEqual(styleSource(input(property, { component: stack })), { kind: 'prop', prop });
  }
  // Stack has no prop of these: a rule over the kit sets them.
  for (const property of ['display', 'align-self', 'text-align', 'padding-top'] as const) {
    assert.deepEqual(styleSource(input(property, { component: stack })), { kind: 'kit' });
  }
});

test("Grid's columns set none of the panel's properties: a number is no keyword", () => {
  const grid = baseComponent('Grid');
  for (const property of STYLE_PROPERTIES) {
    if (property === 'gap') continue;
    assert.deepEqual(styleSource(input(property, { component: grid })), { kind: 'kit' }, property);
  }
});

test('a keyword prop counts only when each value names a keyword of the property', () => {
  const cases: [StyleProperty, ReturnType<typeof enumProp>, boolean][] = [
    ['align-items', enumProp('align', ['start', 'center']), true],
    ['justify-content', enumProp('justify', ['between', 'around', 'evenly']), true],
    // `left` is a text alignment, not an item alignment.
    ['align-items', enumProp('align', ['left', 'center']), false],
    ['flex-direction', enumProp('direction', ['horizontal', 'vertical']), false],
    // A prop named like the property counts whatever its values.
    ['text-align', enumProp('textAlign', ['start', 'end']), true],
  ];
  for (const [property, prop, isProp] of cases) {
    const found = styleSource(input(property, { component: { props: [prop] } }));
    const expected: StyleSource = isProp ? { kind: 'prop', prop: prop.name } : { kind: 'kit' };
    assert.deepEqual(found, expected, `${prop.name} for ${property}`);
  }
  // Only `flex-wrap` takes a boolean, as Stack's `wrap`.
  const boolean = { props: [{ name: 'wrap', type: 'boolean' }] };
  assert.equal(styleSource(input('flex-wrap', { component: boolean })).kind, 'prop');
  const display = { props: [{ name: 'display', type: 'boolean' }] };
  assert.equal(styleSource(input('display', { component: display })).kind, 'kit');
});

test('one side of padding and margin is a declaration of its own in the class rule', () => {
  const card = rule('card', [
    ['padding', 'var(--kit-space-12)'],
    ['padding-top', 'var(--kit-space-16)'],
    ['margin-left', '3px', true],
  ]);
  assert.deepEqual(styleSource(input('padding-top', { rule: card })), {
    kind: 'scss',
    className: 'card',
    value: 'var(--kit-space-16)',
    offKit: false,
  });
  assert.deepEqual(styleSource(input('margin-left', { rule: card })), {
    kind: 'scss',
    className: 'card',
    value: '3px',
    offKit: true,
  });
  // The side no declaration of its own sets is held by the shorthand (ADR 0070).
  assert.deepEqual(styleSource(input('padding-left', { rule: card })), {
    kind: 'scss',
    className: 'card',
    value: 'var(--kit-space-12)',
    offKit: false,
    via: 'padding',
  });
});

// ---- Shorthands (ADR 0070) ----------------------------------------------------------------------

/** A small kit, so a `var` in a border or a background has a type. */
const typed = tokenGroupsOf([
  { path: 'color.line', type: 'color' },
  { path: 'color.surface', type: 'color' },
  { path: 'color.brand', type: 'color' },
  { path: 'border.sm', type: 'dimension' },
  { path: 'space.md', type: 'dimension' },
]);

type Declarations = Parameters<typeof rule>[1];
type Held = Pick<Extract<StyleSource, { kind: 'scss' }>, 'value' | 'offKit' | 'via'>;

/** What the class rule holds for the property, or `null` when the source is not the rule. */
function held(property: StyleProperty, declarations: Declarations, nested?: string[]): Held | null {
  const card = rule('card', declarations, nested);
  const found = styleSource(input(property, { rule: card, tokenGroups: typed }));
  if (found.kind !== 'scss') return null;
  const { value, offKit, via } = found;
  return via === undefined ? { value, offKit } : { value, offKit, via };
}

test('background-color is read from a background of one colour', () => {
  assert.deepEqual(held('background-color', [['background', '#fff', true]]), {
    value: '#fff',
    offKit: true,
    via: 'background',
  });
  assert.deepEqual(held('background-color', [['background', 'var(--kit-color-surface)']]), {
    value: 'var(--kit-color-surface)',
    offKit: false,
    via: 'background',
  });
  // The image is a part the shorthand leaves out: no source in this rule.
  assert.equal(held('background-image', [['background', '#fff']]), null);
});

test('a border gives its width, its style and its colour, each with its own mark', () => {
  const border: Declarations = [['border', '1px solid var(--kit-color-line)', true]];
  assert.deepEqual(held('border-width', border), { value: '1px', offKit: true, via: 'border' });
  assert.deepEqual(held('border-style', border), { value: 'solid', offKit: false, via: 'border' });
  assert.deepEqual(held('border-color', border), {
    value: 'var(--kit-color-line)',
    offKit: false,
    via: 'border',
  });
  // An outline is read the same, and a flex-flow by its keywords.
  assert.deepEqual(held('outline-color', [['outline', '2px solid red']]), {
    value: 'red',
    offKit: false,
    via: 'outline',
  });
  assert.deepEqual(held('flex-wrap', [['flex-flow', 'row wrap']]), {
    value: 'wrap',
    offKit: false,
    via: 'flex-flow',
  });
});

test('padding and margin give each side, and a pair as one value or two', () => {
  const box: Declarations = [['padding', '8px 16px 24px']];
  assert.deepEqual(held('padding-bottom', box), { value: '24px', offKit: false, via: 'padding' });
  assert.deepEqual(held('padding-left', box), { value: '16px', offKit: false, via: 'padding' });
  assert.deepEqual(held('padding-inline', box), { value: '16px', offKit: false, via: 'padding' });
  assert.deepEqual(held('padding-block', box), {
    value: '8px 24px',
    offKit: false,
    via: 'padding',
  });
  // The box itself is its own declaration.
  assert.deepEqual(held('padding', box), { value: '8px 16px 24px', offKit: false });
  assert.deepEqual(held('margin-right', [['margin-inline', '0 auto']]), {
    value: 'auto',
    offKit: false,
    via: 'margin-inline',
  });
});

test('a longhand written after its shorthand wins and is the source', () => {
  const found = held('border-color', [
    ['border', '1px solid #ddd'],
    ['border-color', 'var(--kit-color-line)'],
  ]);
  assert.deepEqual(found, { value: 'var(--kit-color-line)', offKit: false });
});

test('a longhand written before its shorthand loses to it', () => {
  const found = held('border-color', [
    ['border-color', 'var(--kit-color-line)'],
    ['border', '1px solid #ddd', true],
  ]);
  assert.deepEqual(found, { value: '#ddd', offKit: true, via: 'border' });
});

test('the declarations of a class with several rules are read in the order of the file', () => {
  // A class's rules read together list a property once, at its first place, with its last span.
  const card: RuleView = {
    className: 'card',
    span,
    declarations: [
      { property: 'padding-top', value: '4px', offKit: false, span: { start: 90, end: 100 } },
      { property: 'padding', value: '8px', offKit: false, span: { start: 40, end: 50 } },
    ],
    nested: [],
  };
  assert.deepEqual(styleSource(input('padding-top', { rule: card })), {
    kind: 'scss',
    className: 'card',
    value: '4px',
    offKit: false,
  });
});

test('a shorthand that does not split holds nothing: the property reads as without it', () => {
  const values = [
    'linear-gradient(#fff, #000)',
    'url(a.png), url(b.png)',
    '#fff url(a.png) no-repeat',
    '#fff !important',
    '$surface',
    '#{$surface}',
    'var(--surface)',
  ];
  for (const value of values) {
    assert.equal(held('background-color', [['background', value]]), null, value);
  }
  // A longhand of the rule is then the source, wherever it stands.
  const own = held('background-color', [
    ['background-color', 'var(--kit-color-surface)'],
    ['background', 'linear-gradient(#fff, #000)'],
  ]);
  assert.deepEqual(own, { value: 'var(--kit-color-surface)', offKit: false });
});

test('a var is typed by the kit of the draft', () => {
  const border: Declarations = [['border', '1px solid var(--kit-color-brand)']];
  assert.equal(held('border-color', border)?.via, 'border');
  // kitvas UI has no token `color.brand`: the value does not split there, and no part is read.
  const card = rule('card', border);
  assert.deepEqual(styleSource(input('border-color', { rule: card })), { kind: 'kit' });
  assert.deepEqual(styleSource(input('border-width', { rule: card })), { kind: 'kit' });
  // kitvas UI types its own tokens.
  const line = rule('card', [['border', 'var(--kit-space-4) solid var(--kit-color-line)']]);
  assert.deepEqual(styleSource(input('border-width', { rule: line })), {
    kind: 'scss',
    className: 'card',
    value: 'var(--kit-space-4)',
    offKit: false,
    via: 'border',
  });
});

test('a shorthand only inside a nested block is not the rule source', () => {
  // `.card { gap: 4px; &.is-open { background: #fff; border: 1px solid #ddd; } }`
  const nested = ['background', 'border'];
  assert.equal(held('background-color', [['gap', '4px']], nested), null);
  assert.equal(held('border-width', [['gap', '4px']], nested), null);
});

test('a prop of the kit component comes before a shorthand of the class rule', () => {
  const card = rule('card', [['padding', '8px 16px']]);
  const found = styleSource(input('padding', { component: baseComponent('Card'), rule: card }));
  assert.deepEqual(found, { kind: 'prop', prop: 'padding' });
});

test('a property outside the table reads as before beside a shorthand', () => {
  const declarations: Declarations = [
    ['border', '1px solid #ddd'],
    ['border-top', '2px solid red'],
    ['flex', '1 1 auto'],
  ];
  assert.equal(held('border-radius', declarations), null);
  assert.equal(held('gap', declarations), null);
  assert.equal(held('background-size', [['background', '#fff']]), null);
});

test('the Tailwind utilities of the plan 15 properties name their class', () => {
  const cases: [StyleProperty, string, string | null][] = [
    ['padding-top', 'pt-4', 'pt-4'],
    ['padding-top', 'py-2', 'py-2'],
    ['padding-right', 'px-3', 'px-3'],
    ['margin-bottom', 'my-1', 'my-1'],
    ['margin-left', 'ms-2', 'ms-2'],
    ['display', 'hidden', 'hidden'],
    ['display', 'flex', 'flex'],
    ['display', 'flex-col', null],
    ['flex-direction', 'flex-col', 'flex-col'],
    ['flex-direction', 'flex-wrap', null],
    ['flex-wrap', 'flex-wrap', 'flex-wrap'],
    ['justify-content', 'justify-between', 'justify-between'],
    ['justify-content', 'justify-items-center', null],
    ['align-items', 'items-center', 'items-center'],
    ['align-self', 'self-end', 'self-end'],
    ['text-align', 'text-center', 'text-center'],
    ['text-align', 'text-sm', null],
    ['border-style', 'border-dashed', 'border-dashed'],
    ['border-style', 'border-2', null],
    ['outline-width', 'outline-2', 'outline-2'],
    ['outline-width', 'outline', 'outline'],
    ['outline-width', 'outline-primary', null],
    ['outline-color', 'outline-primary', 'outline-primary'],
    ['outline-color', 'outline-offset-2', null],
    ['outline-color', 'outline-dashed', null],
    ['outline-style', 'outline-dashed', 'outline-dashed'],
    ['background-image', 'bg-[url(/a.png)]', 'bg-[url(/a.png)]'],
    ['background-image', 'bg-linear-to-r', 'bg-linear-to-r'],
    ['background-image', 'bg-primary', null],
    ['background-size', 'bg-cover', 'bg-cover'],
    ['background-size', 'bg-primary', null],
  ];
  for (const [property, className, found] of cases) {
    assert.equal(utility(property, className), found, `${className} ${property}`);
  }
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
