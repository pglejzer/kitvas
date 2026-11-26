// Style operations of an option's value (plan 25, ADR 0082): the block
// `[data-opt-<id>="<value>"] &` of a class rule, with a width's and a state's blocks inside it, is
// read, written in its place and taken away again byte for byte.

import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  applyScss,
  type ScssOp,
  type ScssOptions,
  scssBalanced,
  scssOverrides,
} from '../../../src/edit/domain/style/apply-scss.ts';
import {
  type ApplyResult,
  type ContextOption,
  type EditOp,
  inverse,
  type StyleContext,
  type StyleState,
  type StyleValue,
} from '../../../src/edit/index.ts';
import type { DraftOption } from '../../../src/shared/index.ts';

const ID = 'sections/Pricing:section/Stack';

const OPTIONS: DraftOption[] = [
  {
    id: 'columns',
    label: 'Columns',
    default: '3',
    values: [
      { id: '3', label: '3' },
      { id: '2', label: '2' },
    ],
  },
  {
    id: 'cards',
    label: 'Cards',
    default: 'outlined',
    values: [
      { id: 'outlined', label: 'Outlined' },
      { id: 'filled', label: 'Filled' },
    ],
  },
];
const KIT: ScssOptions = {
  force: false,
  breakpoints: () => [768, 1280],
  versionOptions: () => OPTIONS,
};
const PLAIN: ScssOptions = { force: false };

const TWO: ContextOption = { id: 'columns', value: '2' };
const FILLED: ContextOption = { id: 'cards', value: 'filled' };

const at = (
  option: ContextOption | null,
  width: number | null = null,
  state: StyleState | null = null,
): StyleContext => ({ width, state, option });

const token = (name: string): StyleValue => ({ token: `--kit-${name}` });
const raw = (value: string): StyleValue => ({ raw: value });
const plain = (value: string): StyleValue => ({ raw: value, mark: false });
const lines = (...text: string[]): string => `${text.join('\n')}\n`;

type Flags = { newRule?: boolean; newBlock?: boolean; className?: string };

function set(
  context: StyleContext,
  property: string,
  value: StyleValue,
  before: StyleValue | null,
  flags: Flags = {},
): ScssOp {
  return {
    op: 'setStyle',
    id: ID,
    className: flags.className ?? 'card',
    property,
    value,
    before,
    newRule: flags.newRule === true,
    context,
    newBlock: flags.newBlock === true,
  };
}

function scssOp(op: EditOp): ScssOp {
  if (op.op !== 'setStyle' && op.op !== 'removeStyle') assert.fail(`not a style op: ${op.op}`);
  return op;
}

function textOf(result: ApplyResult): string {
  if (!('text' in result)) assert.fail(`not applied: ${JSON.stringify(result)}`);
  return result.text;
}

/** Applies `op`, checks the result, then applies its inverse and checks the original is back. */
function roundTrip(source: string, op: ScssOp, expected: string, options = KIT): void {
  const applied = textOf(applyScss(source, op, options));
  assert.equal(applied, expected);
  assert.equal(scssBalanced(applied), true);
  assert.equal(textOf(applyScss(applied, scssOp(inverse(op)), options)), source);
}

const COLUMNS_BLOCK = '\n  [data-opt-columns="2"] & {\n    gap: var(--kit-space-sm);\n  }\n';
const COLUMNS = lines(
  '.card {',
  '  gap: var(--kit-space-md);',
  '',
  '  @media (min-width: 768px) {',
  '    gap: var(--kit-space-lg);',
  '  }',
  '',
  '  [data-opt-columns="2"] & {',
  '    gap: var(--kit-space-sm);',
  '  }',
  '',
  '  &:hover {',
  '    color: var(--kit-color-ink);',
  '  }',
  '}',
);

test("a value in an option's block is read with its option, and changed there", () => {
  assert.deepEqual(scssOverrides(COLUMNS, 'card'), [
    { context: at(null, 768), property: 'gap', value: 'var(--kit-space-lg)', offKit: false },
    { context: at(TWO), property: 'gap', value: 'var(--kit-space-sm)', offKit: false },
    {
      context: at(null, null, 'hover'),
      property: 'color',
      value: 'var(--kit-color-ink)',
      offKit: false,
    },
  ]);
  const op = set(at(TWO), 'gap', token('space-xs'), token('space-sm'));
  roundTrip(COLUMNS, op, COLUMNS.replace('gap: var(--kit-space-sm)', 'gap: var(--kit-space-xs)'));
  // The base is the rule's own declaration: written there, the option's block stays as it is.
  const base: ScssOp = {
    op: 'setStyle',
    id: ID,
    className: 'card',
    property: 'gap',
    value: token('space-xl'),
    before: token('space-md'),
    newRule: false,
  };
  roundTrip(COLUMNS, base, COLUMNS.replace('gap: var(--kit-space-md)', 'gap: var(--kit-space-xl)'));
});

test("the last value taken out of an option's block takes the block, and undo puts it back", () => {
  const op: ScssOp = {
    op: 'removeStyle',
    id: ID,
    className: 'card',
    property: 'gap',
    before: token('space-sm'),
    dropRule: false,
    context: at(TWO),
    dropBlock: true,
  };
  // Between the width's block and the state's, as the version's order says.
  roundTrip(COLUMNS, op, COLUMNS.replace(COLUMNS_BLOCK, ''));
});

test("a new option's block goes in the order of the options and their values", () => {
  const source = lines(
    '.card {',
    '  gap: var(--kit-space-md);',
    '',
    '  [data-opt-cards="filled"] & {',
    '    color: var(--kit-color-ink);',
    '  }',
    '}',
  );
  const op = set(at(TWO), 'gap', token('space-sm'), null, { newBlock: true });
  roundTrip(
    source,
    op,
    source.replace('\n  [data-opt-cards', `${COLUMNS_BLOCK}\n  [data-opt-cards`),
  );
  // Without the version's order it goes after the options' blocks there.
  roundTrip(source, op, source.replace('  }\n}\n', `  }\n${COLUMNS_BLOCK}}\n`), PLAIN);
  // A value of a later option goes after the earlier one's block.
  const card = set(at(FILLED), 'gap', token('space-sm'), null, { newBlock: true });
  const columns = lines('.card {', '  [data-opt-columns="2"] & {', '    gap: 1px;', '  }', '}');
  roundTrip(
    columns,
    card,
    columns.replace(
      '  }\n}\n',
      '  }\n\n  [data-opt-cards="filled"] & {\n    gap: var(--kit-space-sm);\n  }\n}\n',
    ),
  );
});

test('a state at a width of an option is three blocks deep, made and taken away whole', () => {
  const source = lines('.card {', '  gap: var(--kit-space-md);', '}');
  const op = set(at(TWO, 768, 'hover'), 'color', token('color-ink'), null, { newBlock: true });
  const expected = lines(
    '.card {',
    '  gap: var(--kit-space-md);',
    '',
    '  [data-opt-columns="2"] & {',
    '    @media (min-width: 768px) {',
    '      &:hover {',
    '        color: var(--kit-color-ink);',
    '      }',
    '    }',
    '  }',
    '}',
  );
  roundTrip(source, op, expected);
  assert.deepEqual(scssOverrides(expected, 'card'), [
    {
      context: at(TWO, 768, 'hover'),
      property: 'color',
      value: 'var(--kit-color-ink)',
      offKit: false,
    },
  ]);
  // A width the kit does not have is refused, with an option too.
  const odd = set(at(TWO, 900), 'gap', token('space-sm'), null, { newBlock: true });
  assert.deepEqual(applyScss(source, odd, KIT), { refused: 'not-breakpoint' });
});

const NESTED = lines(
  '.card {',
  '  gap: var(--kit-space-md);',
  '',
  '  [data-opt-columns="2"] & {',
  '    gap: var(--kit-space-sm);',
  '',
  '    @media (min-width: 768px) {',
  '      gap: var(--kit-space-lg);',
  '    }',
  '',
  '    &:hover {',
  '      color: var(--kit-color-ink);',
  '    }',
  '  }',
  '}',
);

test("an option's block with a width's and a state's blocks inside is read and written there", () => {
  assert.deepEqual(scssOverrides(NESTED, 'card'), [
    { context: at(TWO), property: 'gap', value: 'var(--kit-space-sm)', offKit: false },
    { context: at(TWO, 768), property: 'gap', value: 'var(--kit-space-lg)', offKit: false },
    {
      context: at(TWO, null, 'hover'),
      property: 'color',
      value: 'var(--kit-color-ink)',
      offKit: false,
    },
  ]);
  const wide = set(at(TWO, 768), 'gap', raw('40px'), token('space-lg'));
  roundTrip(NESTED, wide, NESTED.replace('gap: var(--kit-space-lg);', 'gap: 40px; /* off-kit */'));
  // A state at that width goes into the option's width block.
  const hover = set(at(TWO, 768, 'hover'), 'color', token('color-muted'), null, { newBlock: true });
  roundTrip(
    NESTED,
    hover,
    NESTED.replace(
      '      gap: var(--kit-space-lg);\n',
      '      gap: var(--kit-space-lg);\n\n      &:hover {\n        color: var(--kit-color-muted);\n      }\n',
    ),
  );
  // A wider width goes after the narrower one and before the option's states.
  const wider = set(at(TWO, 1280), 'gap', token('space-xl'), null, { newBlock: true });
  roundTrip(
    NESTED,
    wider,
    NESTED.replace(
      '    }\n\n    &:hover',
      '    }\n\n    @media (min-width: 1280px) {\n      gap: var(--kit-space-xl);\n    }\n\n    &:hover',
    ),
  );
  // The rule's own width is another block: the option's is not it.
  const own = set(at(null, 768), 'gap', token('space-xl'), null, { newBlock: true });
  roundTrip(
    NESTED,
    own,
    NESTED.replace(
      '\n  [data-opt-columns',
      '\n  @media (min-width: 768px) {\n    gap: var(--kit-space-xl);\n  }\n\n  [data-opt-columns',
    ),
  );
});

test('a block written by hand after the state blocks is read and edited where it stands', () => {
  const source = lines(
    '.card {',
    '  gap: var(--kit-space-md);',
    '  &:hover { color: var(--kit-color-ink); }',
    '  [data-opt-columns="2"] & { gap: var(--kit-space-sm); }',
    '}',
  );
  assert.deepEqual(
    scssOverrides(source, 'card').map((each) => [each.context, each.property, each.value]),
    [
      [at(null, null, 'hover'), 'color', 'var(--kit-color-ink)'],
      [at(TWO), 'gap', 'var(--kit-space-sm)'],
    ],
  );
  const op = set(at(TWO), 'gap', token('space-xs'), token('space-sm'));
  roundTrip(source, op, source.replace('gap: var(--kit-space-sm)', 'gap: var(--kit-space-xs)'));
  // A new value of the option goes into that block, in its line.
  const add = set(at(TWO), 'color', token('color-muted'), null, { newBlock: true });
  roundTrip(
    source,
    add,
    source.replace(
      'gap: var(--kit-space-sm); }',
      'gap: var(--kit-space-sm); color: var(--kit-color-muted); }',
    ),
  );
  // A state of the option, inside its block too.
  const hover = set(at(TWO, null, 'hover'), 'color', token('color-muted'), null, {
    newBlock: true,
  });
  roundTrip(
    source,
    hover,
    source.replace(
      'gap: var(--kit-space-sm); }',
      'gap: var(--kit-space-sm); &:hover { color: var(--kit-color-muted); } }',
    ),
  );
});

test("two blocks of one option's value are not guessed between", () => {
  const source = lines(
    '.card {',
    '  [data-opt-columns="2"] & { gap: 1px; }',
    '  [data-opt-columns="2"] & { color: red; }',
    '}',
  );
  const op = set(at(TWO), 'gap', token('space-sm'), raw('1px'));
  assert.deepEqual(applyScss(source, op, KIT), { refused: 'ambiguous' });
});

test("an option's block that is not the class rule's own is left as it is", () => {
  // Inside a width's block, or with another spelling, it is no option's block kitvas writes.
  const source = lines(
    '.card {',
    '  @media (min-width: 768px) { [data-opt-columns="2"] & { gap: 1px; } }',
    "  [data-opt-columns='2'] & { gap: 2px; }",
    '  [data-opt-Columns="2"] & { gap: 3px; }',
    '}',
  );
  assert.deepEqual(scssOverrides(source, 'card'), []);
});

const PARTS = lines(
  '.plans {',
  '  gap: var(--kit-space-md);',
  '',
  '  &__switch {',
  '    width: 230px; /* off-kit */',
  '',
  '    [data-opt-columns="2"] & {',
  '      width: 200px; /* off-kit */',
  '    }',
  '  }',
  '}',
);

test("a part's rule `&__part` has option blocks of its own", () => {
  assert.deepEqual(scssOverrides(PARTS, 'plans__switch'), [
    { context: at(TWO), property: 'width', value: '200px', offKit: true },
  ]);
  assert.deepEqual(scssOverrides(PARTS, 'plans'), []);
  const op = set(at(TWO), 'width', raw('180px'), raw('200px'), { className: 'plans__switch' });
  roundTrip(PARTS, op, PARTS.replace('width: 200px;', 'width: 180px;'));
  const filled = set(at(FILLED), 'height', raw('54px'), null, {
    className: 'plans__switch',
    newBlock: true,
  });
  roundTrip(
    PARTS,
    filled,
    PARTS.replace(
      '      width: 200px; /* off-kit */\n    }\n',
      '      width: 200px; /* off-kit */\n    }\n\n    [data-opt-cards="filled"] & {\n      height: 54px; /* off-kit */\n    }\n',
    ),
  );
  // A new part with an option's value nests in the block's rule, and its inverse takes it away.
  const title = set(at(TWO), 'gap', token('space-sm'), null, {
    className: 'plans__title',
    newRule: true,
    newBlock: true,
  });
  roundTrip(
    PARTS,
    title,
    PARTS.replace(
      '    }\n  }\n}\n',
      '    }\n  }\n\n  &__title {\n    [data-opt-columns="2"] & {\n      gap: var(--kit-space-sm);\n    }\n  }\n}\n',
    ),
  );
});

test("a shorthand in an option's block is written in its part, and back byte for byte", () => {
  const source = lines(
    '.card {',
    '  padding: var(--kit-space-md);',
    '',
    '  [data-opt-columns="2"] & {',
    '    padding: 8px 16px;',
    '  }',
    '}',
  );
  const left = scssOverrides(source, 'card').filter(
    (each) => each.property === 'padding-left' && each.context.option !== null,
  );
  assert.deepEqual(left, [
    { context: at(TWO), property: 'padding-left', value: '16px', offKit: false, via: 'padding' },
  ]);
  const op = set(at(TWO), 'padding-inline', token('space-lg'), plain('16px'));
  roundTrip(source, op, source.replace('8px 16px;', '8px var(--kit-space-lg);'));
  // The rule's own `padding` stays as it is.
  const top = set(at(TWO), 'padding-top', plain('12px'), plain('8px'));
  roundTrip(source, top, source.replace('8px 16px;', '12px 16px 8px;'));
});
