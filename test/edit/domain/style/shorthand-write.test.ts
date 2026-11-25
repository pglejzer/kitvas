import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  applyScss,
  listRules,
  type ScssOp,
  type ScssOptions,
  type VarKind,
} from '../../../../src/edit/domain/style/apply-scss.ts';
import {
  type ApplyResult,
  type EditOp,
  inverse,
  type StyleContext,
  type StyleValue,
} from '../../../../src/edit/index.ts';

const ID = 'sections/Pricing:section/Stack';

/** The kit of the tests: colours under `color`, lengths under `space` and `border`. */
const kinds: VarKind = (name) => {
  if (name.startsWith('--kit-color-')) return 'color';
  return name.startsWith('--kit-space-') || name.startsWith('--kit-border-') ? 'dimension' : null;
};
const PLAIN: ScssOptions = { force: false, varKind: kinds };
const FORCE: ScssOptions = { force: true, varKind: kinds };

const token = (name: string): StyleValue => ({ token: `--kit-${name}` });
/** A raw value the panel writes: with the off-kit marker. */
const raw = (value: string): StyleValue => ({ raw: value });
/** A raw value someone wrote without the marker. */
const plain = (value: string): StyleValue => ({ raw: value, mark: false });

const LINE = 'var(--kit-color-line)';
const SURFACE = 'var(--kit-color-surface)';
const SMALL = 'var(--kit-space-sm)';
const LARGE = 'var(--kit-space-lg)';
const HOVER: StyleContext = { width: null, state: 'hover' };
const WIDE: StyleContext = { width: 768, state: null };

type SetOp = Extract<ScssOp, { op: 'setStyle' }>;
type RemoveOp = Extract<ScssOp, { op: 'removeStyle' }>;

function set(
  className: string,
  property: string,
  value: StyleValue,
  before: StyleValue | null,
  context?: StyleContext,
): SetOp {
  const op: SetOp = { op: 'setStyle', id: ID, className, property, value, before, newRule: false };
  return context === undefined ? op : { ...op, context };
}

function remove(
  className: string,
  property: string,
  before: StyleValue,
  context?: StyleContext,
): RemoveOp {
  const op: RemoveOp = { op: 'removeStyle', id: ID, className, property, before, dropRule: false };
  return context === undefined ? op : { ...op, context };
}

function scssOp(op: EditOp): ScssOp {
  if (op.op !== 'setStyle' && op.op !== 'removeStyle') assert.fail(`not a style op: ${op.op}`);
  return op;
}

function textOf(result: ApplyResult): string {
  if (!('text' in result)) assert.fail(`not applied: ${JSON.stringify(result)}`);
  return result.text;
}

const lines = (...all: string[]): string => `${all.join('\n')}\n`;
const crlf = (text: string): string => text.replace(/\n/g, '\r\n');

/** Applies `op`, checks the result, then applies its inverse and checks the original is back. */
function roundTrip(source: string, op: ScssOp, expected: string): void {
  const applied = textOf(applyScss(source, op, PLAIN));
  assert.equal(applied, expected);
  assert.equal(textOf(applyScss(applied, scssOp(inverse(op)), PLAIN)), source);
}

const CARD = lines(
  '// The card.',
  '.card {',
  '  border: 1px solid #ddd; /* off-kit */',
  '  background: #fff; /* off-kit */',
  '  padding: 8px 16px;',
  '  color: red; // text',
  '}',
);

// ---- A part set inside the shorthand ------------------------------------------------------------

test('a new border colour changes only that part, and every other character stays', () => {
  const op = set('card', 'border-color', token('color-line'), raw('#ddd'));
  roundTrip(CARD, op, CARD.replace('1px solid #ddd;', `1px solid ${LINE};`));
});

test('a new colour is the whole value of a background that is one colour', () => {
  const op = set('card', 'background-color', token('color-surface'), raw('#fff'));
  roundTrip(CARD, op, CARD.replace('background: #fff; /* off-kit */', `background: ${SURFACE};`));
});

test('a new top side is written as the fewest values that say the box', () => {
  const op = set('card', 'padding-top', plain('12px'), plain('8px'));
  roundTrip(CARD, op, CARD.replace('padding: 8px 16px;', 'padding: 12px 16px 8px;'));
  const pair = set('card', 'padding-inline', token('space-lg'), plain('16px'));
  roundTrip(CARD, pair, CARD.replace('8px 16px;', `8px ${LARGE};`));
});

test('a raw part written into a shorthand without the marker gives it the marker', () => {
  const op = set('card', 'padding-top', raw('12px'), plain('8px'));
  const expected = CARD.replace('8px 16px;', '12px 16px 8px; /* off-kit */');
  assert.equal(textOf(applyScss(CARD, op, PLAIN)), expected);
});

test("the spacing of a declaration is the file's own, around the part too", () => {
  const source = '.a {\n  border :  #DDD   1px  solid ;\n}\n';
  const op = set('a', 'border-width', token('border-sm'), plain('1px'));
  roundTrip(source, op, '.a {\n  border :  #DDD   var(--kit-border-sm)  solid ;\n}\n');
  const last = '.a { border: 1px solid #ddd }';
  const colour = set('a', 'border-color', token('color-line'), plain('#ddd'));
  roundTrip(last, colour, `.a { border: 1px solid ${LINE} }`);
});

test('a part the shorthand left out is added to it', () => {
  const source = '.a {\n  border: 1px solid;\n  flex-flow: column;\n}\n';
  const colour = set('a', 'border-color', token('color-line'), null);
  roundTrip(source, colour, source.replace('1px solid;', `1px solid ${LINE};`));
  const wrap = set('a', 'flex-wrap', plain('wrap'), null);
  roundTrip(source, wrap, source.replace('column;', 'column wrap;'));
});

// ---- A value that does not split ----------------------------------------------------------------

const HERO = lines(
  '.hero {',
  '  background: linear-gradient(#fff, #000);',
  '',
  '  // The text.',
  '  color: red;',
  '}',
);
const HERO_COLOUR = HERO.replace('#000);\n', `#000);\n  background-color: ${SURFACE};\n`);

test('a gradient background gains background-color after it and stays as written', () => {
  const op = set('hero', 'background-color', token('color-surface'), null);
  roundTrip(HERO, op, HERO_COLOUR);
  // The longhand is the source from then on: the gradient is never touched.
  const again = set('hero', 'background-color', raw('#eee'), token('color-surface'));
  assert.equal(
    textOf(applyScss(HERO_COLOUR, again, PLAIN)),
    HERO_COLOUR.replace(`${SURFACE};`, '#eee; /* off-kit */'),
  );
});

test('a value with !important, a variable or a comment gains the longhand beside it', () => {
  const important = '.a { padding: 8px !important; }';
  roundTrip(
    important,
    set('a', 'padding-top', token('space-sm'), null),
    `.a { padding: 8px !important; padding-top: ${SMALL}; }`,
  );
  const variable = '.a {\n  border: 1px solid $line;\n}\n';
  roundTrip(
    variable,
    set('a', 'border-color', token('color-line'), null),
    `.a {\n  border: 1px solid $line;\n  border-color: ${LINE};\n}\n`,
  );
  const comment = '.a {\n  margin: 0 /* none */ auto;\n  gap: 4px;\n}\n';
  roundTrip(
    comment,
    set('a', 'margin-left', token('space-sm'), null),
    `.a {\n  margin: 0 /* none */ auto;\n  margin-left: ${SMALL};\n  gap: 4px;\n}\n`,
  );
});

test('a new value the shorthand cannot say goes beside it', () => {
  // Two widths are no part of a border.
  const source = '.a {\n  border: 1px solid #ddd;\n}\n';
  const op = set('a', 'border-width', plain('1px 2px'), plain('1px'));
  assert.equal(
    textOf(applyScss(source, op, PLAIN)),
    '.a {\n  border: 1px solid #ddd;\n  border-width: 1px 2px;\n}\n',
  );
});

test('nothing follows a shorthand that has no semicolon and does not split', () => {
  const source = '.a { background: linear-gradient(#fff, #000) }';
  const op = set('a', 'background-color', token('color-surface'), null);
  assert.deepEqual(applyScss(source, op, PLAIN), { refused: 'invalid' });
});

test('a var no token types leaves the shorthand whole', () => {
  const source = `.a {\n  border: 1px solid ${LINE};\n}\n`;
  const untyped: ScssOptions = { force: false };
  // The panel showed no value for the width: a `before` is stale, and no part is rewritten.
  const stale = set('a', 'border-width', raw('2px'), plain('1px'));
  assert.deepEqual(applyScss(source, stale, untyped), { conflict: 'changed' });
  const fresh = set('a', 'border-width', raw('2px'), null);
  assert.equal(
    textOf(applyScss(source, fresh, untyped)),
    `.a {\n  border: 1px solid ${LINE};\n  border-width: 2px; /* off-kit */\n}\n`,
  );
  // With the kit's types the same rule splits.
  assert.equal(
    textOf(applyScss(source, stale, PLAIN)),
    `.a {\n  border: 2px solid ${LINE}; /* off-kit */\n}\n`,
  );
});

// ---- What the person saw ------------------------------------------------------------------------

test('a stale before on a part is a conflict, as a stale whole value is', () => {
  const stale = set('card', 'border-color', token('color-line'), raw('#eee'));
  assert.deepEqual(applyScss(CARD, stale, PLAIN), { conflict: 'changed' });
  const absent = set('card', 'border-color', token('color-line'), null);
  assert.deepEqual(applyScss(CARD, absent, PLAIN), { conflict: 'changed' });
  // The marker is part of what was seen: the border has it, the padding has not.
  const unmarked = set('card', 'border-color', token('color-line'), plain('#ddd'));
  assert.deepEqual(applyScss(CARD, unmarked, PLAIN), { conflict: 'changed' });
  const marked = set('card', 'padding-top', token('space-sm'), raw('8px'));
  assert.deepEqual(applyScss(CARD, marked, PLAIN), { conflict: 'changed' });
  const gone = remove('card', 'border-color', raw('#eee'));
  assert.deepEqual(applyScss(CARD, gone, PLAIN), { conflict: 'changed' });
});

test('keep mine writes the part over another value', () => {
  const op = set('card', 'border-color', token('color-line'), raw('#eee'));
  assert.equal(
    textOf(applyScss(CARD, op, FORCE)),
    CARD.replace('1px solid #ddd;', `1px solid ${LINE};`),
  );
});

test('a shorthand written twice in one rule is ambiguous', () => {
  const source = '.a {\n  background: red;\n  background: #fff;\n}\n';
  const op = set('a', 'background-color', token('color-surface'), plain('#fff'));
  assert.deepEqual(applyScss(source, op, PLAIN), { refused: 'ambiguous' });
});

// ---- The order of a shorthand and a longhand ----------------------------------------------------

test('a longhand written after its shorthand is the one written', () => {
  const source = '.a {\n  padding: 8px;\n  padding-top: 4px;\n}\n';
  const op = set('a', 'padding-top', token('space-sm'), plain('4px'));
  roundTrip(source, op, source.replace('padding-top: 4px;', `padding-top: ${SMALL};`));
  // The shorthand's own value is another matter.
  const stale = set('a', 'padding-top', token('space-sm'), plain('8px'));
  assert.deepEqual(applyScss(source, stale, PLAIN), { conflict: 'changed' });
});

test('a longhand written before its shorthand loses: the shorthand is written', () => {
  const source = '.a {\n  padding-top: 4px;\n  padding: 8px;\n}\n';
  const op = set('a', 'padding-top', token('space-sm'), plain('8px'));
  roundTrip(source, op, source.replace('padding: 8px;', `padding: ${SMALL} 8px 8px;`));
  const stale = set('a', 'padding-top', token('space-sm'), plain('4px'));
  assert.deepEqual(applyScss(source, stale, PLAIN), { conflict: 'changed' });
});

test('the narrow shorthand written last holds the side', () => {
  const source = '.a {\n  padding: 8px;\n  padding-block: 16px;\n}\n';
  const top = set('a', 'padding-top', token('space-sm'), plain('16px'));
  roundTrip(source, top, source.replace('16px;', `${SMALL} 16px;`));
  const left = set('a', 'padding-left', token('space-sm'), plain('8px'));
  roundTrip(source, left, source.replace('padding: 8px;', `padding: 8px 8px 8px ${SMALL};`));
});

// ---- The marker ---------------------------------------------------------------------------------

test('the marker stays while one raw part is left, and goes with the last one', () => {
  const source = '.a {\n  border: 1px solid #ddd; /* off-kit */\n}\n';
  const colour = set('a', 'border-color', token('color-line'), raw('#ddd'));
  const one = `.a {\n  border: 1px solid ${LINE}; /* off-kit */\n}\n`;
  roundTrip(source, colour, one);
  const width = set('a', 'border-width', token('border-sm'), raw('1px'));
  roundTrip(one, width, `.a {\n  border: var(--kit-border-sm) solid ${LINE};\n}\n`);
});

test('a marker someone spaced otherwise stays as it is while a raw part is left', () => {
  const source = '.a {\n  padding: 8px 16px;\t/* off-kit */\n}\n';
  const op = set('a', 'padding-top', token('space-sm'), raw('8px'));
  roundTrip(source, op, `.a {\n  padding: ${SMALL} 16px 8px;\t/* off-kit */\n}\n`);
});

test('a keyword part is never a raw one', () => {
  const source = '.a {\n  margin: 8px auto; /* off-kit */\n}\n';
  const op = set('a', 'margin-block', token('space-sm'), raw('8px'));
  roundTrip(source, op, `.a {\n  margin: ${SMALL} auto;\n}\n`);
});

// ---- A part taken out ---------------------------------------------------------------------------

test('a part leaves a border, an outline, a background and a flex-flow', () => {
  const source = lines(
    '.a {',
    '  border: 1px solid #ddd; /* off-kit */',
    '  outline: 2px dashed;',
    '  background: #fff url(../img/hero.png); /* off-kit */',
    '  flex-flow: row wrap;',
    '}',
  );
  const gone = (op: ScssOp): string => textOf(applyScss(source, op, PLAIN));
  // The width of the border is still a raw value: its marker stays.
  assert.equal(
    gone(remove('a', 'border-color', raw('#ddd'))),
    source.replace('1px solid #ddd;', '1px solid;'),
  );
  assert.equal(
    gone(remove('a', 'outline-width', plain('2px'))),
    source.replace('2px dashed;', 'dashed;'),
  );
  assert.equal(
    gone(remove('a', 'background-color', raw('#fff'))),
    source.replace('#fff url(../img/hero.png); /* off-kit */', 'url(../img/hero.png);'),
  );
  assert.equal(gone(remove('a', 'flex-wrap', plain('wrap'))), source.replace('row wrap;', 'row;'));
});

test('the last part leaving removes the declaration, and the rule with it when asked', () => {
  const source = '.a {\n  gap: 4px;\n  background: #fff; /* off-kit */\n}\n';
  const op = remove('a', 'background-color', raw('#fff'));
  assert.equal(textOf(applyScss(source, op, PLAIN)), '.a {\n  gap: 4px;\n}\n');
  const alone = '.b {\n  gap: 4px;\n}\n.a {\n  flex-flow: column;\n}\n';
  const last: ScssOp = { ...remove('a', 'flex-direction', plain('column')), dropRule: true };
  const dropped = textOf(applyScss(alone, last, PLAIN));
  assert.deepEqual(
    listRules(dropped).map((rule) => rule.className),
    ['b'],
  );
});

test('a side cannot leave a box or a pair alone, and the box as a whole can', () => {
  const source = '.a {\n  padding: 8px 16px;\n  margin-inline: 0 auto;\n}\n';
  const side = remove('a', 'padding-top', plain('8px'));
  assert.deepEqual(applyScss(source, side, PLAIN), { refused: 'not-found' });
  const pair = remove('a', 'padding-inline', plain('16px'));
  assert.deepEqual(applyScss(source, pair, PLAIN), { refused: 'not-found' });
  const end = remove('a', 'margin-right', plain('auto'));
  assert.deepEqual(applyScss(source, end, PLAIN), { refused: 'not-found' });
  const whole = remove('a', 'padding', plain('8px 16px'));
  assert.equal(textOf(applyScss(source, whole, PLAIN)), '.a {\n  margin-inline: 0 auto;\n}\n');
});

test('a part a shorthand does not hold is not there to remove', () => {
  const source = '.a {\n  border: 1px solid;\n  background: linear-gradient(#fff, #000);\n}\n';
  const colour = remove('a', 'border-color', raw('#ddd'));
  assert.deepEqual(applyScss(source, colour, FORCE), { refused: 'not-found' });
  const back = remove('a', 'background-color', raw('#fff'));
  assert.deepEqual(applyScss(source, back, FORCE), { refused: 'not-found' });
});

// ---- Width and state blocks, nested class rules, line ends --------------------------------------

const BLOCKS = lines(
  '.card {',
  '  padding: 8px;',
  '',
  '  @media (min-width: 768px) {',
  '    padding: 16px 24px;',
  '    background: linear-gradient(#fff, #000);',
  '  }',
  '',
  '  &:hover {',
  '    border: 1px solid #ddd; /* off-kit */',
  '  }',
  '',
  '  &__title {',
  '    border: 1px solid #ddd;',
  '  }',
  '}',
);

test('a part is written inside the shorthand of a width block', () => {
  const op = set('card', 'padding-left', token('space-lg'), plain('24px'), WIDE);
  roundTrip(BLOCKS, op, BLOCKS.replace('16px 24px;', `16px 24px 16px ${LARGE};`));
  // The base value is the rule's own shorthand, read apart from the block's.
  const base = set('card', 'padding-left', token('space-lg'), plain('8px'));
  roundTrip(BLOCKS, base, BLOCKS.replace('padding: 8px;', `padding: 8px 8px 8px ${LARGE};`));
});

test('a part is written inside the shorthand of a state block', () => {
  const op = set('card', 'border-color', token('color-line'), raw('#ddd'), HOVER);
  roundTrip(BLOCKS, op, BLOCKS.replace('1px solid #ddd; /*', `1px solid ${LINE}; /*`));
  const stale = set('card', 'border-color', token('color-line'), raw('#eee'), HOVER);
  assert.deepEqual(applyScss(BLOCKS, stale, PLAIN), { conflict: 'changed' });
});

test('a shorthand of a block that does not split gains the longhand inside that block', () => {
  const op = set('card', 'background-color', token('color-surface'), null, WIDE);
  const expected = BLOCKS.replace('#000);\n', `#000);\n    background-color: ${SURFACE};\n`);
  roundTrip(BLOCKS, op, expected);
});

test('a part leaves a shorthand of a block, and a side of one cannot', () => {
  const colour = remove('card', 'border-color', raw('#ddd'), HOVER);
  assert.equal(
    textOf(applyScss(BLOCKS, colour, PLAIN)),
    BLOCKS.replace('1px solid #ddd; /*', '1px solid; /*'),
  );
  const side = remove('card', 'padding-top', plain('16px'), WIDE);
  assert.deepEqual(applyScss(BLOCKS, side, PLAIN), { refused: 'not-found' });
});

test('a part is written inside the shorthand of a nested class rule', () => {
  const op = set('card__title', 'border-color', token('color-line'), plain('#ddd'));
  roundTrip(BLOCKS, op, BLOCKS.replace('1px solid #ddd;\n', `1px solid ${LINE};\n`));
});

test('a file with CRLF line ends keeps them', () => {
  const part = set('card', 'padding-top', token('space-sm'), plain('8px'));
  const written = CARD.replace('padding: 8px 16px;', `padding: ${SMALL} 16px 8px;`);
  roundTrip(crlf(CARD), part, crlf(written));
  const beside = set('hero', 'background-color', token('color-surface'), null);
  roundTrip(crlf(HERO), beside, crlf(HERO_COLOUR));
  const block = set('card', 'background-color', token('color-surface'), null, WIDE);
  const expected = BLOCKS.replace('#000);\n', `#000);\n    background-color: ${SURFACE};\n`);
  roundTrip(crlf(BLOCKS), block, crlf(expected));
});
