// Nested class rules and classes with several rules (ADR 0067): a rule written as `&__part` inside
// a class rule is the rule of the joined class; the rules of one class are read together in file
// order; a new class named after its block nests in the block's rule. Every write and its inverse
// give the file back byte for byte.

import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  applyScss,
  listRules,
  readRule,
  type ScssOp,
  type ScssOptions,
  scssBalanced,
  scssOverrides,
} from '../../../src/edit/domain/style/apply-scss.ts';
import {
  type ApplyResult,
  type EditOp,
  inverse,
  type RuleView,
  type StyleContext,
  type StyleValue,
} from '../../../src/edit/index.ts';

const ID = 'sections/Plans:section/Stack';
const KIT: ScssOptions = { force: false, breakpoints: () => [768, 1280] };

const AT_768: StyleContext = { width: 768, state: null };
const AT_1280: StyleContext = { width: 1280, state: null };
const HOVER: StyleContext = { width: null, state: 'hover' };

const token = (name: string): StyleValue => ({ token: `--kit-${name}` });
const raw = (value: string): StyleValue => ({ raw: value });
const plain = (value: string): StyleValue => ({ raw: value, mark: false });

type Flags = { newRule?: boolean; context?: StyleContext; newBlock?: boolean };
type SetOp = Extract<ScssOp, { op: 'setStyle' }>;

function set(
  className: string,
  property: string,
  value: StyleValue,
  before: StyleValue | null,
  flags: Flags = {},
): SetOp {
  const { context } = flags;
  return {
    op: 'setStyle',
    id: ID,
    className,
    property,
    value,
    before,
    newRule: flags.newRule === true,
    ...(context === undefined ? {} : { context, newBlock: flags.newBlock === true }),
  };
}

function remove(
  className: string,
  property: string,
  before: StyleValue,
  flags: { dropRule?: boolean; context?: StyleContext } = {},
): ScssOp {
  const { context } = flags;
  return {
    op: 'removeStyle',
    id: ID,
    className,
    property,
    before,
    dropRule: flags.dropRule === true,
    ...(context === undefined ? {} : { context, dropBlock: true }),
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

function ruleOf(text: string, className: string): RuleView {
  const rule = readRule(text, className);
  if (rule === null || rule === 'ambiguous') assert.fail(`no rule .${className}`);
  return rule;
}

/** Applies `op`, checks the result, then applies its inverse and checks the original is back. */
function roundTrip(source: string, op: ScssOp, expected: string): void {
  const applied = textOf(applyScss(source, op, KIT));
  assert.equal(applied, expected);
  assert.equal(scssBalanced(applied), true);
  assert.equal(textOf(applyScss(applied, scssOp(inverse(op)), KIT)), source);
}

const lines = (...text: string[]): string => `${text.join('\n')}\n`;
const names = (text: string): string[] => listRules(text).map((rule) => rule.className);
const valuesOf = (rule: RuleView): [string, string, boolean][] =>
  rule.declarations.map((d) => [d.property, d.value, d.offKit]);

/** The pricing section's switch as the maker writes it. */
const PLANS = lines(
  '.plans {',
  '  padding: var(--kit-space-lg);',
  '',
  '  &__switch {',
  '    background: var(--kit-color-surface);',
  '    border: 1px solid var(--kit-color-line);',
  '    border-radius: var(--kit-radius-full);',
  '    padding: var(--kit-space-xs);',
  '  }',
  '}',
);
/** The switch's last declaration, after which a new one goes. */
const TAIL = '    padding: var(--kit-space-xs);\n';

// ---- Reading ------------------------------------------------------------------------------------

test('a rule written as &__part inside a class rule is the rule of the joined class', () => {
  const rule = ruleOf(PLANS, 'plans__switch');
  assert.deepEqual(valuesOf(rule), [
    ['background', 'var(--kit-color-surface)', false],
    ['border', '1px solid var(--kit-color-line)', false],
    ['border-radius', 'var(--kit-radius-full)', false],
    ['padding', 'var(--kit-space-xs)', false],
  ]);
  assert.deepEqual(rule.nested, []);
  const start = PLANS.indexOf('&__switch');
  const end = PLANS.lastIndexOf('  }') + 3;
  assert.equal(PLANS.slice(rule.span.start, rule.span.end), PLANS.slice(start, end));
  // The switch's values are not the block's own, and not nested in it either.
  const block = ruleOf(PLANS, 'plans');
  assert.deepEqual(valuesOf(block), [['padding', 'var(--kit-space-lg)', false]]);
  assert.deepEqual(block.nested, []);
  // Only the top-level rule is listed as written.
  assert.deepEqual(names(PLANS), ['plans']);
});

const DEEP = lines(
  '.plans {',
  '  &__card {',
  '    gap: 1px;',
  '',
  '    &--featured {',
  '      gap: 2px;',
  '    }',
  '  }',
  '',
  '  &:hover { color: red; }',
  '  & > li { margin: 0; }',
  '  .dark & { color: blue; }',
  '  &__a, &__b { width: 1px; }',
  '  &.is-open { height: 1px; }',
  '  &-#{$n} { padding: 0; }',
  '}',
);

test('a join is read at any depth, and any other nested prelude keeps its meaning', () => {
  assert.deepEqual(valuesOf(ruleOf(DEEP, 'plans__card')), [['gap', '1px', false]]);
  assert.deepEqual(ruleOf(DEEP, 'plans__card').nested, []);
  assert.deepEqual(valuesOf(ruleOf(DEEP, 'plans__card--featured')), [['gap', '2px', false]]);
  // A list, a compound, a descendant and an interpolation are not the rule of a class.
  assert.equal(readRule(DEEP, 'plans__a'), null);
  assert.equal(readRule(DEEP, 'plans__b'), null);
  assert.deepEqual(ruleOf(DEEP, 'plans').nested, ['margin', 'width', 'height', 'padding']);
  assert.deepEqual(scssOverrides(DEEP, 'plans'), [
    { context: HOVER, property: 'color', value: 'red', offKit: false },
  ]);
  assert.deepEqual(applyScss(DEEP, set('plans', 'height', raw('1px'), null), KIT), {
    refused: 'nested',
  });
  // A rule two levels deep is written in its place.
  roundTrip(
    DEEP,
    set('plans__card--featured', 'gap', raw('3px'), plain('2px')),
    DEEP.replace('gap: 2px;', 'gap: 3px; /* off-kit */'),
  );
});

// ---- One nested rule ----------------------------------------------------------------------------

test('a value of a nested rule is written in its place, and its inverse gives the file back', () => {
  roundTrip(
    PLANS,
    set('plans__switch', 'padding', token('space-sm'), token('space-xs')),
    PLANS.replace('padding: var(--kit-space-xs)', 'padding: var(--kit-space-sm)'),
  );
  // A new width on the switch goes inside `&__switch`, and no second rule is made.
  const wide = PLANS.replace(TAIL, `${TAIL}    width: 230px; /* off-kit */\n`);
  roundTrip(PLANS, set('plans__switch', 'width', raw('230px'), null), wide);
  assert.deepEqual(names(wide), ['plans']);
  assert.deepEqual(
    ruleOf(wide, 'plans__switch').declarations.map((d) => d.property),
    ['background', 'border', 'border-radius', 'padding', 'width'],
  );
  // The last declaration taken away comes back in its place.
  roundTrip(PLANS, remove('plans__switch', 'padding', token('space-xs')), PLANS.replace(TAIL, ''));
  // A nested rule left empty goes with the blank line above it, and comes back nested.
  roundTrip(
    lines('.plans {', '  gap: 1px;', '', '  &__x {', '    color: red;', '  }', '}'),
    remove('plans__x', 'color', plain('red'), { dropRule: true }),
    lines('.plans {', '  gap: 1px;', '}'),
  );
});

test('a width and a state of a nested rule are blocks inside it', () => {
  roundTrip(
    PLANS,
    set('plans__switch', 'width', raw('230px'), null, { context: AT_768, newBlock: true }),
    PLANS.replace(
      TAIL,
      `${TAIL}\n    @media (min-width: 768px) {\n      width: 230px; /* off-kit */\n    }\n`,
    ),
  );
  roundTrip(
    PLANS,
    set('plans__switch', 'background-color', token('color-ink'), null, {
      context: HOVER,
      newBlock: true,
    }),
    PLANS.replace(
      TAIL,
      `${TAIL}\n    &:hover {\n      background-color: var(--kit-color-ink);\n    }\n`,
    ),
  );
});

test('a nested rule keeps CRLF and tabs', () => {
  const crlf = PLANS.replaceAll('  ', '\t').replaceAll('\n', '\r\n');
  const tail = '\t\tpadding: var(--kit-space-xs);\r\n';
  roundTrip(
    crlf,
    set('plans__switch', 'width', raw('230px'), null),
    crlf.replace(tail, `${tail}\t\twidth: 230px; /* off-kit */\r\n`),
  );
  roundTrip(
    crlf,
    set('plans__switch', 'width', raw('230px'), null, { context: AT_768, newBlock: true }),
    crlf.replace(
      tail,
      `${tail}\r\n\t\t@media (min-width: 768px) {\r\n\t\t\twidth: 230px; /* off-kit */\r\n\t\t}\r\n`,
    ),
  );
  roundTrip(
    crlf,
    set('plans__button', 'gap', token('space-md'), null, { newRule: true }),
    `${crlf.slice(0, -3)}\r\n\t&__button {\r\n\t\tgap: var(--kit-space-md);\r\n\t}\r\n}\r\n`,
  );
});

// ---- A new class --------------------------------------------------------------------------------

test('a new class named after its block nests in the block rule, and goes again on undo', () => {
  roundTrip(
    PLANS,
    set('plans__button', 'gap', token('space-md'), null, { newRule: true }),
    `${PLANS.slice(0, -2)}\n  &__button {\n    gap: var(--kit-space-md);\n  }\n}\n`,
  );
  roundTrip(
    PLANS,
    set('plans__button', 'color', token('color-ink'), null, {
      newRule: true,
      context: HOVER,
      newBlock: true,
    }),
    `${PLANS.slice(0, -2)}\n  &__button {\n    &:hover {\n      color: var(--kit-color-ink);\n    }\n  }\n}\n`,
  );
  roundTrip(
    lines('.plans { gap: 1px; }'),
    set('plans__x', 'color', token('color-ink'), null, { newRule: true }),
    lines('.plans { gap: 1px; &__x { color: var(--kit-color-ink); } }'),
  );
  // Of the classes that start the name with `__` or `--`, the longest takes it.
  const two = lines('.plans {', '  gap: 1px;', '}', '', '.plans__card {', '  gap: 2px;', '}');
  roundTrip(
    two,
    set('plans__card--x', 'color', token('color-ink'), null, { newRule: true }),
    two.replace(
      '  gap: 2px;\n',
      '  gap: 2px;\n\n  &--x {\n    color: var(--kit-color-ink);\n  }\n',
    ),
  );
});

test('any other new class, or one whose block rule takes no block, gets a rule at the end', () => {
  roundTrip(
    PLANS,
    set('plans-wide', 'gap', token('space-md'), null, { newRule: true }),
    `${PLANS}\n.plans-wide {\n  gap: var(--kit-space-md);\n}\n`,
  );
  // After a last declaration without its `;` a block would not parse.
  roundTrip(
    lines('.plans { gap: 1px }'),
    set('plans__x', 'color', token('color-ink'), null, { newRule: true }),
    lines('.plans { gap: 1px }', '', '.plans__x {', '  color: var(--kit-color-ink);', '}'),
  );
});

// ---- Several rules of one class -----------------------------------------------------------------

/** A draft the editor wrote before: the maker's nested rule and an appended flat one. */
const LEGACY = `${PLANS}\n.plans__switch {\n  width: 230px; /* off-kit */\n  height: 54px; /* off-kit */\n}\n`;
const HEIGHT = '  height: 54px; /* off-kit */\n';

test('two rules of one class are read together, each property with its last value', () => {
  const rule = ruleOf(LEGACY, 'plans__switch');
  assert.deepEqual(valuesOf(rule), [
    ['background', 'var(--kit-color-surface)', false],
    ['border', '1px solid var(--kit-color-line)', false],
    ['border-radius', 'var(--kit-radius-full)', false],
    ['padding', 'var(--kit-space-xs)', false],
    ['width', '230px', true],
    ['height', '54px', true],
  ]);
  const last = LEGACY.lastIndexOf('.plans__switch');
  assert.equal(LEGACY.slice(rule.span.start, rule.span.end), LEGACY.slice(last, -1));
  // The last declaration of a property is its value, as the browser reads it.
  const twice = LEGACY.replace(HEIGHT, `${HEIGHT}  padding: 2px; /* off-kit */\n`);
  const held = ruleOf(twice, 'plans__switch').declarations;
  assert.deepEqual(
    held.filter((d) => d.property === 'padding').map((d) => [d.value, d.offKit]),
    [['2px', true]],
  );
});

test('a value of a class with two rules is written where its last declaration is', () => {
  roundTrip(
    LEGACY,
    set('plans__switch', 'width', raw('240px'), raw('230px')),
    LEGACY.replace('230px', '240px'),
  );
  roundTrip(
    LEGACY,
    set('plans__switch', 'padding', token('space-sm'), token('space-xs')),
    LEGACY.replace('var(--kit-space-xs)', 'var(--kit-space-sm)'),
  );
  // A new one goes into the last rule, so no later rule of the class wins over it.
  roundTrip(
    LEGACY,
    set('plans__switch', 'gap', token('space-md'), null),
    LEGACY.replace(HEIGHT, `${HEIGHT}  gap: var(--kit-space-md);\n`),
  );
  // The value the person saw is the last one.
  const twice = LEGACY.replace(HEIGHT, `${HEIGHT}  padding: 2px; /* off-kit */\n`);
  const stale = set('plans__switch', 'padding', token('space-sm'), token('space-xs'));
  assert.deepEqual(applyScss(twice, stale, KIT), { conflict: 'changed' });
  roundTrip(
    twice,
    set('plans__switch', 'padding', token('space-sm'), raw('2px')),
    twice.replace('padding: 2px; /* off-kit */', 'padding: var(--kit-space-sm);'),
  );
  // Two declarations of a property in one rule stay ambiguous.
  const doubled = LEGACY.replace(HEIGHT, `${HEIGHT}  width: 1px;\n`);
  const one = set('plans__switch', 'width', raw('2px'), plain('1px'));
  assert.deepEqual(applyScss(doubled, one, KIT), { refused: 'ambiguous' });
});

test("a new value of the base stands above an earlier rule's width block that sets it", () => {
  const source = lines(
    '.plans {',
    '  &__switch {',
    '    padding: 1px;',
    '',
    '    @media (min-width: 768px) {',
    '      width: 200px;',
    '    }',
    '  }',
    '}',
    '',
    '.plans__switch {',
    '  height: 54px;',
    '}',
  );
  roundTrip(
    source,
    set('plans__switch', 'width', raw('230px'), null),
    source.replace('    padding: 1px;\n', '    padding: 1px;\n    width: 230px; /* off-kit */\n'),
  );
  roundTrip(
    source,
    set('plans__switch', 'gap', token('space-md'), null),
    source.replace('  height: 54px;\n', '  height: 54px;\n  gap: var(--kit-space-md);\n'),
  );
});

const SPLIT = lines(
  '.plans {',
  '  &__switch {',
  '    @media (min-width: 768px) {',
  '      height: 40px;',
  '    }',
  '',
  '    @media (min-width: 1280px) {',
  '      width: 300px;',
  '    }',
  '  }',
  '}',
  '',
  '.plans__switch {',
  '  height: 54px;',
  '}',
);

test('a width of a class with two rules: in place, a new block in the last rule, or refused', () => {
  assert.deepEqual(scssOverrides(SPLIT, 'plans__switch'), [
    { context: AT_768, property: 'height', value: '40px', offKit: false },
    { context: AT_1280, property: 'width', value: '300px', offKit: false },
  ]);
  roundTrip(
    SPLIT,
    set('plans__switch', 'height', raw('42px'), plain('40px'), { context: AT_768 }),
    SPLIT.replace('height: 40px;', 'height: 42px; /* off-kit */'),
  );
  // Only the earlier rule has a block of this width: the last rule gets its own.
  const tall = set('plans__switch', 'height', raw('60px'), null, {
    context: AT_1280,
    newBlock: true,
  });
  roundTrip(
    SPLIT,
    tall,
    SPLIT.replace(
      '  height: 54px;\n',
      '  height: 54px;\n\n  @media (min-width: 1280px) {\n    height: 60px; /* off-kit */\n  }\n',
    ),
  );
  assert.deepEqual(applyScss(SPLIT, { ...tall, newBlock: false }, KIT), { refused: 'not-found' });
  // The last rule's 768 block would win over the earlier rule's 1280 value at 1280 px and up.
  const narrow = set('plans__switch', 'width', raw('230px'), null, {
    context: AT_768,
    newBlock: true,
  });
  assert.deepEqual(applyScss(SPLIT, narrow, KIT), { refused: 'ambiguous' });
  // A value taken away takes its emptied block from the rule that held it.
  const low = remove('plans__switch', 'height', plain('40px'), { context: AT_768 });
  assert.equal(
    textOf(applyScss(SPLIT, low, KIT)),
    SPLIT.replace('    @media (min-width: 768px) {\n      height: 40px;\n    }\n', ''),
  );
});

test('the values of a width in two rules: the last wins, and a removed one shows the one before', () => {
  const source = lines(
    '.plans {',
    '  &__switch {',
    '    @media (min-width: 768px) {',
    '      width: 200px;',
    '      height: 40px;',
    '    }',
    '  }',
    '}',
    '',
    '.plans__switch {',
    '  @media (min-width: 768px) {',
    '    width: 230px; /* off-kit */',
    '  }',
    '}',
  );
  assert.deepEqual(scssOverrides(source, 'plans__switch'), [
    { context: AT_768, property: 'width', value: '230px', offKit: true },
    { context: AT_768, property: 'height', value: '40px', offKit: false },
  ]);
  roundTrip(
    source,
    set('plans__switch', 'width', raw('240px'), raw('230px'), { context: AT_768 }),
    source.replace('230px', '240px'),
  );
  const gone = remove('plans__switch', 'width', raw('230px'), { context: AT_768 });
  const dropped = textOf(applyScss(source, gone, KIT));
  assert.equal(
    dropped,
    source.replace('  @media (min-width: 768px) {\n    width: 230px; /* off-kit */\n  }\n', ''),
  );
  assert.deepEqual(scssOverrides(dropped, 'plans__switch')[0], {
    context: AT_768,
    property: 'width',
    value: '200px',
    offKit: false,
  });
});
