// Style operations of a width or a state (spec 4c, goal 2; plan 16, task A): the nested blocks of
// a class rule are read, written in their place and taken away again byte for byte.

import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  applyScss,
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

const ID = 'sections/Pricing:section/Stack';
const PLAIN: ScssOptions = { force: false };
const FORCE: ScssOptions = { force: true };
const KIT: ScssOptions = { force: false, breakpoints: () => [768, 1280] };

const AT_768: StyleContext = { width: 768, state: null };
const AT_1280: StyleContext = { width: 1280, state: null };
const HOVER: StyleContext = { width: null, state: 'hover' };
const FOCUS: StyleContext = { width: null, state: 'focus-visible' };
const ACTIVE: StyleContext = { width: null, state: 'active' };
const HOVER_768: StyleContext = { width: 768, state: 'hover' };

const token = (name: string): StyleValue => ({ token: `--kit-${name}` });
const raw = (value: string): StyleValue => ({ raw: value });

type Flags = { newRule?: boolean; newBlock?: boolean };
type SetOp = Extract<ScssOp, { op: 'setStyle' }>;

function ruleOf(text: string): RuleView {
  const rule = readRule(text, 'card');
  if (rule === null || rule === 'ambiguous') assert.fail('no single rule .card');
  return rule;
}

function set(
  context: StyleContext,
  property: string,
  value: StyleValue,
  before: StyleValue | null,
  flags: Flags = {},
  className = 'card',
): SetOp {
  return {
    op: 'setStyle',
    id: ID,
    className,
    property,
    value,
    before,
    newRule: flags.newRule === true,
    context,
    newBlock: flags.newBlock === true,
  };
}

function remove(
  context: StyleContext,
  property: string,
  before: StyleValue,
  dropBlock: boolean,
  className = 'card',
): ScssOp {
  return {
    op: 'removeStyle',
    id: ID,
    className,
    property,
    before,
    dropRule: false,
    context,
    dropBlock,
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
function roundTrip(source: string, op: ScssOp, expected: string): void {
  const applied = textOf(applyScss(source, op, KIT));
  assert.equal(applied, expected);
  assert.equal(scssBalanced(applied), true);
  assert.equal(textOf(applyScss(applied, scssOp(inverse(op)), KIT)), source);
}

const lines = (...text: string[]): string => `${text.join('\n')}\n`;

const BASE = lines('.card {', '  padding: var(--kit-space-md);', '}');
const WIDE = lines(
  '.card {',
  '  padding: var(--kit-space-md);',
  '',
  '  @media (min-width: 768px) {',
  '    padding: var(--kit-space-lg);',
  '  }',
  '}',
);
const WIDE_HOVER = lines(
  '.card {',
  '  padding: var(--kit-space-md);',
  '',
  '  @media (min-width: 768px) {',
  '    padding: var(--kit-space-lg);',
  '  }',
  '',
  '  &:hover {',
  '    color: var(--kit-color-ink);',
  '  }',
  '}',
);

// ---- Reading ------------------------------------------------------------------------------------

test('the blocks of a width, a state and a state at a width are read with their values', () => {
  const source = lines(
    '.card {',
    '  gap: 1px;',
    '  @media (min-width:768px) {',
    '    gap: 2px; /* off-kit */',
    '    transform: none;',
    '    &:hover {',
    '      color: var(--kit-color-ink);',
    '    }',
    '  }',
    '  @media (min-width: 1280px) { gap: var(--kit-space-lg); gap: var(--kit-space-xl) }',
    '  &:focus-visible { outline-width: 2px; }',
    '}',
  );
  assert.deepEqual(scssOverrides(source, 'card'), [
    { context: AT_768, property: 'gap', value: '2px', offKit: true },
    { context: HOVER_768, property: 'color', value: 'var(--kit-color-ink)', offKit: false },
    // The last of two is the one the browser applies.
    { context: AT_1280, property: 'gap', value: 'var(--kit-space-xl)', offKit: false },
    { context: FOCUS, property: 'outline-width', value: '2px', offKit: false },
  ]);
  const rule = ruleOf(source);
  // The base stays the rule's own declarations, and a read block is not `nested` any more.
  assert.deepEqual(
    rule.declarations.map((d) => [d.property, d.value]),
    [['gap', '1px']],
  );
  assert.deepEqual(rule.nested, []);
});

test('any other nested block is left to its writer: named in nested, never an override', () => {
  const source = lines(
    '.card {',
    '  @media (min-width: 40rem) { gap: 1px; }',
    '  @media (min-width: 768px) and (max-width: 900px) { margin: 0; }',
    '  @media (max-width: 768px) { width: 1px; }',
    '  &:hover, &:active { color: red; }',
    '  &:hover { &:active { height: 1px; } @media (min-width: 768px) { padding: 0; } }',
    '  .title { &:hover { font-size: 1px; } }',
    '}',
  );
  assert.deepEqual(scssOverrides(source, 'card'), []);
  assert.deepEqual(ruleOf(source).nested, ['gap', 'margin', 'width', 'color']);
  assert.deepEqual(scssOverrides(source, 'none'), []);
  assert.deepEqual(scssOverrides(`${source}${source}`, 'card'), []);
});

// ---- Writing: new blocks ------------------------------------------------------------------------

test('a first value at a width makes its media block after the base declarations', () => {
  roundTrip(BASE, set(AT_768, 'padding', token('space-lg'), null, { newBlock: true }), WIDE);
  // The base declaration is untouched: the 390 card shows what it showed.
  assert.deepEqual(ruleOf(WIDE), { ...ruleOf(BASE), span: { start: 0, end: WIDE.length - 1 } });
});

test('a first value of a state makes its block after the media blocks', () => {
  roundTrip(WIDE, set(HOVER, 'color', token('color-ink'), null, { newBlock: true }), WIDE_HOVER);
});

test('media blocks ascend, and a new one stands before the states', () => {
  const expected = WIDE_HOVER.replace(
    '\n  &:hover',
    '\n  @media (min-width: 1280px) {\n    padding: var(--kit-space-xl);\n  }\n\n  &:hover',
  );
  roundTrip(
    WIDE_HOVER,
    set(AT_1280, 'padding', token('space-xl'), null, { newBlock: true }),
    expected,
  );
  const wide = lines(
    '.card {',
    '  gap: 1px;',
    '',
    '  @media (min-width: 1280px) {',
    '    gap: 3px;',
    '  }',
    '}',
  );
  roundTrip(
    wide,
    set(AT_768, 'gap', raw('2px'), null, { newBlock: true }),
    wide.replace(
      '\n  @media (min-width: 1280px)',
      '\n  @media (min-width: 768px) {\n    gap: 2px; /* off-kit */\n  }\n\n  @media (min-width: 1280px)',
    ),
  );
});

test('the states keep the order hover, focus-visible, active', () => {
  const source = lines(
    '.card {',
    '  &:hover {',
    '    color: red;',
    '  }',
    '',
    '  &:active {',
    '    color: blue;',
    '  }',
    '}',
  );
  roundTrip(
    source,
    set(FOCUS, 'color', raw('green'), null, { newBlock: true }),
    source.replace(
      '\n  &:active',
      '\n  &:focus-visible {\n    color: green; /* off-kit */\n  }\n\n  &:active',
    ),
  );
  roundTrip(
    lines('.card {', '  &:hover {', '    color: red;', '  }', '}'),
    set(ACTIVE, 'color', token('color-ink'), null, { newBlock: true }),
    lines(
      '.card {',
      '  &:hover {',
      '    color: red;',
      '  }',
      '',
      '  &:active {',
      '    color: var(--kit-color-ink);',
      '  }',
      '}',
    ),
  );
});

test('a state at a width nests in the width block, made with it when there is none', () => {
  roundTrip(
    lines('.card {', '  color: red;', '}'),
    set(HOVER_768, 'color', token('color-ink'), null, { newBlock: true }),
    lines(
      '.card {',
      '  color: red;',
      '',
      '  @media (min-width: 768px) {',
      '    &:hover {',
      '      color: var(--kit-color-ink);',
      '    }',
      '  }',
      '}',
    ),
  );
  // The width's block is there: only the state's block is made, and only it goes on undo.
  roundTrip(
    WIDE,
    set(HOVER_768, 'color', token('color-ink'), null, { newBlock: true }),
    lines(
      '.card {',
      '  padding: var(--kit-space-md);',
      '',
      '  @media (min-width: 768px) {',
      '    padding: var(--kit-space-lg);',
      '',
      '    &:hover {',
      '      color: var(--kit-color-ink);',
      '    }',
      '  }',
      '}',
    ),
  );
});

test('a new block keeps the file indentation and line endings', () => {
  roundTrip(
    '.card {\r\n\tcolor: red;\r\n}\r\n',
    set(AT_768, 'gap', token('space-md'), null, { newBlock: true }),
    '.card {\r\n\tcolor: red;\r\n\r\n\t@media (min-width: 768px) {\r\n\t\tgap: var(--kit-space-md);\r\n\t}\r\n}\r\n',
  );
  roundTrip(
    '.card {\n    color: red;\n}\n',
    set(HOVER_768, 'gap', token('space-md'), null, { newBlock: true }),
    '.card {\n    color: red;\n\n    @media (min-width: 768px) {\n        &:hover {\n            gap: var(--kit-space-md);\n        }\n    }\n}\n',
  );
  // An empty body gets no blank line first.
  roundTrip(
    '.card {\n}\n',
    set(AT_768, 'gap', token('space-md'), null, { newBlock: true }),
    '.card {\n  @media (min-width: 768px) {\n    gap: var(--kit-space-md);\n  }\n}\n',
  );
});

test('a rule on one line takes its block in the line', () => {
  roundTrip(
    '.card { color: red; }\n',
    set(HOVER, 'color', raw('blue'), null, { newBlock: true }),
    '.card { color: red; &:hover { color: blue; /* off-kit */ } }\n',
  );
  roundTrip(
    '.card { color: red; &:hover { color: blue; } }\n',
    set(HOVER_768, 'gap', token('space-md'), null, { newBlock: true }),
    '.card { color: red; @media (min-width: 768px) { &:hover { gap: var(--kit-space-md); } } &:hover { color: blue; } }\n',
  );
});

test('a comment above the next block stays with it', () => {
  const source = lines(
    '.card {',
    '  gap: 1px; /* base */',
    '  // wide screens',
    '  @media (min-width: 1280px) {',
    '    gap: 3px;',
    '  }',
    '}',
  );
  roundTrip(
    source,
    set(AT_768, 'gap', token('space-md'), null, { newBlock: true }),
    source.replace(
      '  // wide screens',
      '\n  @media (min-width: 768px) {\n    gap: var(--kit-space-md);\n  }\n  // wide screens',
    ),
  );
});

test('a new rule with a context is made with its block, and dropped with it', () => {
  const op = set(HOVER_768, 'gap', token('space-md'), null, { newRule: true, newBlock: true });
  const made = lines(
    '.card {',
    '  @media (min-width: 768px) {',
    '    &:hover {',
    '      gap: var(--kit-space-md);',
    '    }',
    '  }',
    '}',
  );
  roundTrip('', op, made);
  roundTrip(
    '.a {\n\tcolor: red;\n}',
    op,
    `.a {\n\tcolor: red;\n}\n\n${made.replaceAll('  ', '\t').trimEnd()}`,
  );
  const active = set(ACTIVE, 'gap', raw('1px'), null, { newRule: true, newBlock: true }, 'hero');
  roundTrip(BASE, active, `${BASE}\n.hero {\n  &:active {\n    gap: 1px; /* off-kit */\n  }\n}\n`);
  // Without `newRule` a missing rule is not made.
  assert.deepEqual(applyScss('', set(AT_768, 'gap', raw('1px'), null, { newBlock: true }), KIT), {
    refused: 'not-found',
  });
});

// ---- Writing: existing blocks -------------------------------------------------------------------

test('a block that is there takes another declaration, and a new value in place', () => {
  roundTrip(
    WIDE,
    set(AT_768, 'gap', token('space-sm'), null),
    WIDE.replace(
      '    padding: var(--kit-space-lg);\n',
      '    padding: var(--kit-space-lg);\n    gap: var(--kit-space-sm);\n',
    ),
  );
  roundTrip(
    WIDE,
    set(AT_768, 'padding', raw('13px'), token('space-lg')),
    WIDE.replace('var(--kit-space-lg);', '13px; /* off-kit */'),
  );
  // `newBlock` on a block that is there only adds: the client sees values, not empty blocks.
  const more = set(AT_768, 'gap', token('space-sm'), null, { newBlock: true });
  const added = textOf(applyScss(WIDE, more, KIT));
  assert.equal(added, textOf(applyScss(WIDE, set(AT_768, 'gap', token('space-sm'), null), KIT)));
  assert.equal(textOf(applyScss(added, scssOp(inverse(more)), KIT)), WIDE);
});

test('a declaration of a width block goes above its state blocks', () => {
  const source = lines(
    '.card {',
    '  @media (min-width: 768px) {',
    '    padding: 1px;',
    '',
    '    &:hover {',
    '      color: red;',
    '    }',
    '  }',
    '}',
  );
  roundTrip(
    source,
    set(AT_768, 'gap', token('space-sm'), null),
    source.replace('    padding: 1px;\n', '    padding: 1px;\n    gap: var(--kit-space-sm);\n'),
  );
});

test('the last declaration of a block goes with the block when the op says so', () => {
  const drop = remove(AT_768, 'padding', token('space-lg'), true);
  roundTrip(WIDE, drop, BASE);
  const keep = remove(AT_768, 'padding', token('space-lg'), false);
  const emptied = BASE.replace('}\n', '\n  @media (min-width: 768px) {\n  }\n}\n');
  roundTrip(WIDE, keep, emptied);
  // Another declaration, or a comment, keeps the block.
  const noted = WIDE.replace('    padding', '    // tablets\n    padding');
  assert.equal(
    textOf(applyScss(noted, drop, KIT)),
    noted.replace('    padding: var(--kit-space-lg);\n', ''),
  );
  // A state at a width: its block goes, and the width's block only when that is empty too.
  const both = lines(
    '.card {',
    '  @media (min-width: 768px) {',
    '    gap: 1px;',
    '',
    '    &:hover {',
    '      color: red;',
    '    }',
    '  }',
    '}',
  );
  assert.equal(
    textOf(applyScss(both, remove(HOVER_768, 'color', { raw: 'red', mark: false }, true), KIT)),
    lines('.card {', '  @media (min-width: 768px) {', '    gap: 1px;', '  }', '}'),
  );
});

// ---- Refusals and conflicts ---------------------------------------------------------------------

test('a width that is no breakpoint of the kit is refused', () => {
  const odd: StyleContext = { width: 900, state: null };
  const op = set(odd, 'gap', token('space-md'), null, { newBlock: true });
  assert.deepEqual(applyScss(BASE, op, KIT), { refused: 'not-breakpoint' });
  assert.deepEqual(applyScss(BASE, { ...op, context: { width: 900, state: 'hover' } }, KIT), {
    refused: 'not-breakpoint',
  });
  const written = WIDE.replace('768', '900');
  assert.deepEqual(applyScss(written, remove(odd, 'padding', token('space-lg'), true), KIT), {
    refused: 'not-breakpoint',
  });
  // A state alone names no width.
  assert.ok('text' in applyScss(BASE, { ...op, context: HOVER }, KIT));
});

test('a value that is not what the person saw is a conflict, and a missing place is not made', () => {
  const stale = set(AT_768, 'padding', token('space-xl'), token('space-sm'));
  assert.deepEqual(applyScss(WIDE, stale, KIT), { conflict: 'changed' });
  assert.equal(textOf(applyScss(WIDE, stale, FORCE)), WIDE.replace('space-lg', 'space-xl'));
  // The block is gone: a value seen there is a conflict, and nothing to remove.
  assert.deepEqual(applyScss(BASE, stale, KIT), { conflict: 'changed' });
  const gone = remove(AT_768, 'padding', token('space-lg'), true);
  assert.deepEqual(applyScss(BASE, gone, KIT), { conflict: 'changed' });
  assert.deepEqual(applyScss(BASE, gone, FORCE), { refused: 'not-found' });
  assert.deepEqual(applyScss(WIDE, remove(AT_768, 'gap', raw('1px'), true), FORCE), {
    refused: 'not-found',
  });
  // Without `newBlock` a missing block is not made; someone took it away.
  assert.deepEqual(applyScss(BASE, set(AT_768, 'gap', raw('1px'), null), KIT), {
    refused: 'not-found',
  });
  // A value already there when none was seen.
  const blind = set(AT_768, 'padding', raw('1px'), null, { newBlock: true });
  assert.deepEqual(applyScss(WIDE, blind, KIT), { conflict: 'changed' });
});

test('two blocks of one context, an open block and a nested value are refused', () => {
  const twice = lines(
    '.card {',
    '  &:hover { color: red; }',
    '  &:hover { gap: 1px; }',
    '  @media (min-width: 768px) { gap: 1px; }',
    '  @media (min-width: 768px) { gap: 2px; }',
    '}',
  );
  const op = set(HOVER, 'padding', raw('1px'), null, { newBlock: true });
  assert.deepEqual(applyScss(twice, op, KIT), { refused: 'ambiguous' });
  assert.deepEqual(applyScss(twice, { ...op, context: HOVER_768 }, KIT), { refused: 'ambiguous' });
  assert.deepEqual(applyScss('.card {\n  &:hover {\n    gap: 1px;\n', op, KIT), {
    refused: 'invalid',
  });
  const deep = '.card {\n  &:hover {\n    &.open { padding: 2px; }\n  }\n}\n';
  assert.deepEqual(applyScss(deep, op, KIT), { refused: 'nested' });
  // A last declaration without its semicolon cannot be followed by a block.
  assert.deepEqual(applyScss('.card { color: red }\n', op, KIT), { refused: 'invalid' });
  const doubled = '.card {\n  &:hover {\n    padding: 1px;\n    padding: 2px;\n  }\n}\n';
  assert.deepEqual(applyScss(doubled, set(HOVER, 'padding', raw('3px'), raw('2px')), KIT), {
    refused: 'ambiguous',
  });
});

test('a keyword or an image is checked in a context as in the base', () => {
  const flex = set(AT_768, 'display', { raw: 'flex', mark: false }, null, { newBlock: true });
  assert.equal(
    textOf(applyScss(BASE, flex, KIT)),
    BASE.replace('}\n', '\n  @media (min-width: 768px) {\n    display: flex;\n  }\n}\n'),
  );
  assert.deepEqual(applyScss(BASE, { ...flex, value: { raw: 'flex' } }, KIT), {
    refused: 'invalid',
  });
  const contents = { ...flex, value: { raw: 'contents', mark: false as const } };
  assert.deepEqual(applyScss(BASE, contents, PLAIN), { refused: 'invalid' });
});

test('an op with the base context is the op of stage 4a', () => {
  const base: StyleContext = { width: null, state: null };
  const op = set(base, 'gap', token('space-md'), null);
  assert.equal(
    textOf(applyScss(BASE, op, KIT)),
    BASE.replace('}\n', '  gap: var(--kit-space-md);\n}\n'),
  );
});
