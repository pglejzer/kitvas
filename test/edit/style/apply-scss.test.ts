import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  applyScss,
  listRules,
  readRule,
  type ScssOp,
  scssBalanced,
} from '../../../src/edit/domain/style/apply-scss.ts';
import {
  type ApplyResult,
  type EditOp,
  inverse,
  type RuleView,
  type StyleValue,
} from '../../../src/edit/index.ts';

const ID = 'sections/Pricing:section/Stack';
const PLAIN = { force: false };
const FORCE = { force: true };

const token = (name: string): StyleValue => ({ token: `--kit-${name}` });
const raw = (value: string): StyleValue => ({ raw: value });

function set(
  className: string,
  property: string,
  value: StyleValue,
  before: StyleValue | null,
  newRule = false,
): ScssOp {
  return { op: 'setStyle', id: ID, className, property, value, before, newRule };
}

function remove(className: string, property: string, before: StyleValue, dropRule = false): ScssOp {
  return { op: 'removeStyle', id: ID, className, property, before, dropRule };
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
  if (rule === null || rule === 'ambiguous') assert.fail(`no single rule .${className}`);
  return rule;
}

/** Applies `op`, checks the result, then applies its inverse and checks the original is back. */
function roundTrip(source: string, op: ScssOp, expected: string): void {
  const applied = textOf(applyScss(source, op, PLAIN));
  assert.equal(applied, expected);
  assert.equal(textOf(applyScss(applied, scssOp(inverse(op)), PLAIN)), source);
}

const names = (text: string): string[] => listRules(text).map((rule) => rule.className);

// ---- Reading ------------------------------------------------------------------------------------

test('listRules lists only top-level rules whose selector is one class, in order', () => {
  const source = [
    '// styles',
    '$pad: 16px;',
    '.a { color: red; }',
    'h1 { color: red; }',
    '.b, .c { color: red; }',
    '.d:hover { color: red; }',
    '/* one */ .e /* two */ { color: red; }',
    '@media (min-width: 40rem) { .f { color: red; } }',
    '.g .h { color: red; }',
    '.i.j { color: red; }',
    '.k-2_x { color: red; }',
    '',
  ].join('\n');
  assert.deepEqual(names(source), ['a', 'e', 'k-2_x']);
});

test('a rule reads its own declarations as written, with their spans', () => {
  const source =
    '.card {\n  gap: var(--kit-space-md);\n  color:  #f00 ; /* off-kit */\n  width: 10px; /* note */\n}\n';
  const rule = ruleOf(source, 'card');
  assert.equal(source.slice(rule.span.start, rule.span.end), source.trimEnd());
  assert.deepEqual(
    rule.declarations.map((d) => [d.property, d.value, d.offKit]),
    [
      ['gap', 'var(--kit-space-md)', false],
      ['color', '#f00', true],
      ['width', '10px', false],
    ],
  );
  assert.deepEqual(
    rule.declarations.map((d) => source.slice(d.span.start, d.span.end)),
    ['gap: var(--kit-space-md);', 'color:  #f00 ; /* off-kit */', 'width: 10px;'],
  );
  assert.deepEqual(rule.nested, []);
});

test('the marker counts only after the semicolon on the same line', () => {
  const source = '.a {\n  gap: 1px;\t/* off-kit */\n  color: #f00;\n  /* off-kit */\n}\n';
  const [gap, color] = ruleOf(source, 'a').declarations;
  assert.equal(gap?.offKit, true);
  assert.equal(color?.offKit, false);
});

test('a last declaration without a semicolon is read, with its marker', () => {
  const rule = ruleOf('.a { gap: 1px /* off-kit */ }\n.b { color: red }\n', 'a');
  assert.deepEqual(
    rule.declarations.map((d) => [d.property, d.value, d.offKit]),
    [['gap', '1px', true]],
  );
  assert.equal(ruleOf('.a { gap: 1px }\n.b { color: red }\n', 'b').declarations[0]?.value, 'red');
});

test('a property set only in a block kitvas does not read is nested, and is not edited', () => {
  const source = [
    '.card {',
    '  gap: var(--kit-space-md);',
    '',
    '  &.is-open {',
    '    color: var(--kit-color-ink);',
    '    gap: var(--kit-space-lg);',
    '  }',
    '',
    '  @media (min-width: 40rem) {',
    '    padding: var(--kit-space-lg);',
    '    .title { margin: 0; }',
    '  }',
    '}',
    '',
  ].join('\n');
  const rule = ruleOf(source, 'card');
  assert.deepEqual(
    rule.declarations.map((d) => d.property),
    ['gap'],
  );
  assert.deepEqual(rule.nested, ['color', 'padding', 'margin']);
  assert.deepEqual(applyScss(source, set('card', 'color', token('color-ink'), null), PLAIN), {
    refused: 'nested',
  });
  assert.deepEqual(applyScss(source, remove('card', 'padding', token('space-lg')), FORCE), {
    refused: 'nested',
  });
  // The rule's own `gap` is still editable beside the nested one.
  roundTrip(
    source,
    set('card', 'gap', token('space-sm'), token('space-md')),
    source.replace('gap: var(--kit-space-md)', 'gap: var(--kit-space-sm)'),
  );
});

test('braces in comments and strings open and close nothing', () => {
  const source = [
    '/* } .x { */',
    '.a {',
    '  /* } { */',
    '  content: "}";',
    "  quotes: '{' '\\'}';",
    "  // } it's a comment",
    '  gap: 1px;',
    '}',
    '.b {',
    '  color: red;',
    '}',
    '',
  ].join('\n');
  assert.deepEqual(names(source), ['a', 'b']);
  assert.deepEqual(
    ruleOf(source, 'a').declarations.map((d) => [d.property, d.value]),
    [
      ['content', '"}"'],
      ['quotes', "'{' '\\'}'"],
      ['gap', '1px'],
    ],
  );
  assert.equal(scssBalanced(source), true);
});

test('interpolation counts as braces and never as a block', () => {
  const source = [
    '.a-#{$n} { color: red; }',
    '.a {',
    '  width: calc(#{$w} + 1px);',
    '  content: "a#{"}"}b";',
    '  &-#{$n} {',
    '    gap: 1px;',
    '  }',
    '}',
    '',
  ].join('\n');
  assert.deepEqual(names(source), ['a']);
  const rule = ruleOf(source, 'a');
  assert.deepEqual(
    rule.declarations.map((d) => [d.property, d.value]),
    [
      ['width', 'calc(#{$w} + 1px)'],
      ['content', '"a#{"}"}b"'],
    ],
  );
  assert.deepEqual(rule.nested, ['gap']);
  assert.equal(scssBalanced(source), true);
});

test('an unquoted url keeps its semicolon and its slashes', () => {
  const source = '.a {\n  background: url(data:image/png;base64,AA//BB);\n  gap: 1px;\n}\n';
  assert.deepEqual(
    ruleOf(source, 'a').declarations.map((d) => [d.property, d.value]),
    [
      ['background', 'url(data:image/png;base64,AA//BB)'],
      ['gap', '1px'],
    ],
  );
});

test('readRule answers null without the rule and ambiguous with two', () => {
  const source = '.a { color: red; }\n.b { color: red; }\n.a { gap: 1px; }\n';
  assert.equal(readRule(source, 'c'), null);
  assert.equal(readRule(source, 'a'), 'ambiguous');
  assert.equal(ruleOf(source, 'b').className, 'b');
});

test('scssBalanced holds for balanced braces outside strings and comments only', () => {
  assert.equal(scssBalanced(''), true);
  assert.equal(scssBalanced('.a { &:hover { gap: 1px; } }'), true);
  assert.equal(scssBalanced('.a { /* } */ }'), true);
  assert.equal(scssBalanced('.a { content: "}"; }'), true);
  assert.equal(scssBalanced("// it's {\n.a {}"), true);
  assert.equal(scssBalanced('.a {'), false);
  assert.equal(scssBalanced('.a { } }'), false);
  assert.equal(scssBalanced('} .a {'), false);
  assert.equal(scssBalanced('.a { content: "x; }'), false);
  assert.equal(scssBalanced('.a { } /* open'), false);
  assert.equal(scssBalanced('.a { width: #{$x; }'), false);
});

// ---- setStyle -----------------------------------------------------------------------------------

const TWO = '.a {\n  gap: var(--kit-space-sm);\n  color: red;\n}\n';

test('setStyle on an existing declaration changes only that declaration', () => {
  const op = set('a', 'gap', token('space-md'), token('space-sm'));
  const result = applyScss(TWO, op, PLAIN);
  const expected = '.a {\n  gap: var(--kit-space-md);\n  color: red;\n}\n';
  assert.equal(textOf(result), expected);
  const start = expected.indexOf('gap');
  assert.deepEqual('changed' in result ? result.changed : null, [
    { start, end: start + 'gap: var(--kit-space-md);'.length },
  ]);
  roundTrip(TWO, op, expected);
});

test('a raw value gets the marker after the semicolon, and a token takes it away', () => {
  roundTrip(
    TWO,
    set('a', 'gap', raw('13px'), token('space-sm')),
    '.a {\n  gap: 13px; /* off-kit */\n  color: red;\n}\n',
  );
  roundTrip(
    '.a {\n  gap: 13px; /* off-kit */ // why\n}\n',
    set('a', 'gap', raw('14px'), raw('13px')),
    '.a {\n  gap: 14px; /* off-kit */ // why\n}\n',
  );
});

test('the spacing a declaration was written with stays', () => {
  roundTrip(
    '.a {\n\tgap:var(--kit-space-sm) ;\n}\n',
    set('a', 'gap', raw('1px'), token('space-sm')),
    '.a {\n\tgap:1px ; /* off-kit */\n}\n',
  );
  roundTrip(
    '.a { gap: var(--kit-space-sm) }\n',
    set('a', 'gap', raw('1px'), token('space-sm')),
    '.a { gap: 1px /* off-kit */ }\n',
  );
});

test('a declaration that no longer holds the value the person saw is a conflict', () => {
  const lg = token('space-lg');
  assert.deepEqual(applyScss(TWO, set('a', 'gap', lg, token('space-md')), PLAIN), {
    conflict: 'changed',
  });
  // Present where the person saw none, and absent where the person saw one.
  assert.deepEqual(applyScss(TWO, set('a', 'gap', lg, null), PLAIN), { conflict: 'changed' });
  assert.deepEqual(applyScss(TWO, set('a', 'margin', lg, token('space-sm')), PLAIN), {
    conflict: 'changed',
  });
  // The same text without the marker is another value than the raw one.
  assert.deepEqual(applyScss(TWO, set('a', 'gap', lg, raw('var(--kit-space-sm)')), PLAIN), {
    conflict: 'changed',
  });
  assert.deepEqual(applyScss(TWO, remove('a', 'gap', lg), PLAIN), { conflict: 'changed' });
  assert.deepEqual(applyScss(TWO, remove('a', 'margin', lg), PLAIN), { conflict: 'changed' });
});

test('force writes over a value that changed', () => {
  assert.equal(
    textOf(applyScss(TWO, set('a', 'gap', token('space-lg'), token('space-md')), FORCE)),
    '.a {\n  gap: var(--kit-space-lg);\n  color: red;\n}\n',
  );
  assert.equal(
    textOf(applyScss(TWO, set('a', 'color', token('color-ink'), null), FORCE)),
    '.a {\n  gap: var(--kit-space-sm);\n  color: var(--kit-color-ink);\n}\n',
  );
  assert.equal(
    textOf(applyScss(TWO, remove('a', 'color', token('color-ink')), FORCE)),
    '.a {\n  gap: var(--kit-space-sm);\n}\n',
  );
  assert.deepEqual(applyScss(TWO, remove('a', 'margin', token('space-sm')), FORCE), {
    refused: 'not-found',
  });
});

test('two declarations of the property, or two rules of the class, are ambiguous', () => {
  const twice = '.a {\n  gap: 1px;\n  gap: 2px;\n}\n';
  assert.deepEqual(applyScss(twice, set('a', 'gap', token('space-sm'), null), FORCE), {
    refused: 'ambiguous',
  });
  assert.deepEqual(applyScss(twice, remove('a', 'gap', raw('1px')), PLAIN), {
    refused: 'ambiguous',
  });
  const rules = '.a { gap: 1px; }\n.a { color: red; }\n';
  assert.deepEqual(applyScss(rules, set('a', 'margin', token('space-sm'), null), PLAIN), {
    refused: 'ambiguous',
  });
  assert.deepEqual(applyScss(rules, set('a', 'margin', token('space-sm'), null, true), PLAIN), {
    refused: 'ambiguous',
  });
});

test('a missing rule is not-found for setStyle without newRule and for removeStyle', () => {
  assert.deepEqual(applyScss(TWO, set('b', 'gap', token('space-sm'), null), PLAIN), {
    refused: 'not-found',
  });
  assert.deepEqual(applyScss(TWO, remove('b', 'gap', token('space-sm'), true), PLAIN), {
    refused: 'not-found',
  });
  // A rule nested in a media query is not the top-level rule.
  const inMedia = '@media (min-width: 1px) {\n  .b {\n    gap: 1px;\n  }\n}\n';
  assert.deepEqual(applyScss(inMedia, set('b', 'gap', token('space-sm'), null), PLAIN), {
    refused: 'not-found',
  });
});

// ---- A new declaration ----------------------------------------------------------------------------

test('a new declaration is the last line of the body, with the indent of the other lines', () => {
  const op = set('a', 'margin', token('space-md'), null);
  roundTrip(
    TWO,
    op,
    '.a {\n  gap: var(--kit-space-sm);\n  color: red;\n  margin: var(--kit-space-md);\n}\n',
  );
  const result = applyScss(TWO, op, PLAIN);
  const start = TWO.indexOf('}');
  assert.deepEqual('changed' in result ? result.changed : null, [
    { start, end: start + '  margin: var(--kit-space-md);\n'.length },
  ]);
});

test('tabs stay tabs and CRLF stays CRLF', () => {
  roundTrip(
    '.a {\n\tcolor: red;\n}\n',
    set('a', 'gap', token('space-md'), null),
    '.a {\n\tcolor: red;\n\tgap: var(--kit-space-md);\n}\n',
  );
  roundTrip(
    '.a {\r\n    color: red;\r\n}\r\n',
    set('a', 'gap', raw('1px'), null),
    '.a {\r\n    color: red;\r\n    gap: 1px; /* off-kit */\r\n}\r\n',
  );
});

test('a new declaration goes after nested blocks and comments, above the closing brace', () => {
  const source = '.a {\n  color: red;\n\n  &.open {\n    color: blue;\n  }\n  // end\n}\n';
  roundTrip(
    source,
    set('a', 'gap', token('space-md'), null),
    '.a {\n  color: red;\n\n  &.open {\n    color: blue;\n  }\n  // end\n  gap: var(--kit-space-md);\n}\n',
  );
});

test('a new declaration goes above the first width or state block, so the block still wins', () => {
  const source = '.a {\n  color: red;\n\n  &:hover {\n    color: blue;\n  }\n  // end\n}\n';
  roundTrip(
    source,
    set('a', 'gap', token('space-md'), null),
    '.a {\n  color: red;\n  gap: var(--kit-space-md);\n\n  &:hover {\n    color: blue;\n  }\n  // end\n}\n',
  );
  // A property set only in such a block is no longer nested: the base takes its own value.
  assert.deepEqual(ruleOf(source, 'a').nested, []);
  roundTrip(
    '.a { &:hover { color: blue; } }\n',
    set('a', 'gap', raw('1px'), null),
    '.a { gap: 1px; /* off-kit */ &:hover { color: blue; } }\n',
  );
  roundTrip(
    '.a {\n  @media (min-width: 768px) {\n    gap: 2px;\n  }\n}\n',
    set('a', 'gap', token('space-md'), null),
    '.a {\n  gap: var(--kit-space-md);\n  @media (min-width: 768px) {\n    gap: 2px;\n  }\n}\n',
  );
});

test('an empty body takes the first indent of the file, else two spaces', () => {
  roundTrip(
    '.x {\n\tcolor: red;\n}\n.a {\n}\n',
    set('a', 'gap', token('space-md'), null),
    '.x {\n\tcolor: red;\n}\n.a {\n\tgap: var(--kit-space-md);\n}\n',
  );
  roundTrip(
    '.a {\n}\n',
    set('a', 'gap', token('space-md'), null),
    '.a {\n  gap: var(--kit-space-md);\n}\n',
  );
});

test('a one-line body takes the declaration before its brace, and gives it back exactly', () => {
  const op = set('a', 'gap', token('space-md'), null);
  roundTrip('.a { color: red; }\n', op, '.a { color: red; gap: var(--kit-space-md); }\n');
  roundTrip('.a { }', op, '.a { gap: var(--kit-space-md); }');
  roundTrip('.a {}', op, '.a {gap: var(--kit-space-md); }');
});

test('nothing is appended after a declaration that has no semicolon', () => {
  const source = '.a {\n  color: red\n}\n';
  assert.deepEqual(applyScss(source, set('a', 'gap', token('space-md'), null), PLAIN), {
    refused: 'invalid',
  });
  // The declaration itself is still editable, and keeps having no semicolon.
  assert.equal(
    textOf(applyScss(source, set('a', 'color', token('color-ink'), null), FORCE)),
    '.a {\n  color: var(--kit-color-ink)\n}\n',
  );
});

test('a rule the file ends inside is refused as invalid', () => {
  assert.deepEqual(applyScss('.a {\n  color: red;\n', set('a', 'gap', raw('1px'), null), PLAIN), {
    refused: 'invalid',
  });
});

// ---- A new rule -------------------------------------------------------------------------------------

test('newRule in an empty file writes the rule alone', () => {
  roundTrip(
    '',
    set('hero', 'gap', token('space-md'), null, true),
    '.hero {\n  gap: var(--kit-space-md);\n}\n',
  );
});

test('newRule appends the rule after one blank line, in the indent of the file', () => {
  roundTrip(
    '.a {\n\tcolor: red;\n}\n',
    set('hero', 'gap', raw('3px'), null, true),
    '.a {\n\tcolor: red;\n}\n\n.hero {\n\tgap: 3px; /* off-kit */\n}\n',
  );
  roundTrip(
    '@use "x";\n\n',
    set('hero', 'gap', token('space-md'), null, true),
    '@use "x";\n\n\n.hero {\n  gap: var(--kit-space-md);\n}\n',
  );
});

test('newRule keeps CRLF, and a file without a final line ending stays without one', () => {
  roundTrip(
    '.a {\r\n  color: red;\r\n}\r\n',
    set('hero', 'gap', token('space-md'), null, true),
    '.a {\r\n  color: red;\r\n}\r\n\r\n.hero {\r\n  gap: var(--kit-space-md);\r\n}\r\n',
  );
  roundTrip(
    '.a { color: red; }',
    set('hero', 'gap', token('space-md'), null, true),
    '.a { color: red; }\n\n.hero {\n  gap: var(--kit-space-md);\n}',
  );
});

test('newRule on a rule that exists after all behaves as a plain setStyle', () => {
  assert.equal(
    textOf(applyScss(TWO, set('a', 'margin', token('space-md'), null, true), PLAIN)),
    '.a {\n  gap: var(--kit-space-sm);\n  color: red;\n  margin: var(--kit-space-md);\n}\n',
  );
});

test('newRule does not create a rule the person saw a value in', () => {
  const op = set('hero', 'gap', token('space-md'), token('space-sm'), true);
  assert.deepEqual(applyScss(TWO, op, PLAIN), { refused: 'not-found' });
});

// ---- removeStyle ------------------------------------------------------------------------------------

test('removeStyle takes the whole line of a declaration that is alone on it', () => {
  const result = applyScss(TWO, remove('a', 'gap', token('space-sm')), PLAIN);
  assert.equal(textOf(result), '.a {\n  color: red;\n}\n');
  assert.deepEqual('changed' in result ? result.changed : null, [{ start: 5, end: 5 }]);
  assert.equal(
    textOf(
      applyScss(
        '.a {\r\n\tgap: 1px; /* off-kit */\r\n\tcolor: red;\r\n}\r\n',
        remove('a', 'gap', raw('1px')),
        PLAIN,
      ),
    ),
    '.a {\r\n\tcolor: red;\r\n}\r\n',
  );
});

test('removeStyle takes the declaration and one space when the line holds more', () => {
  assert.equal(
    textOf(
      applyScss(
        '.a { color: red; gap: var(--kit-space-sm); }\n',
        remove('a', 'gap', token('space-sm')),
        PLAIN,
      ),
    ),
    '.a { color: red; }\n',
  );
  assert.equal(
    textOf(
      applyScss(
        '.a {\n  gap: 1px; /* off-kit */ // why\n}\n',
        remove('a', 'gap', raw('1px')),
        PLAIN,
      ),
    ),
    '.a {\n  // why\n}\n',
  );
});

test('dropRule removes a rule whose body is empty afterwards, with one blank line before it', () => {
  const source =
    '.a {\n  color: red;\n}\n\n.b {\n  gap: var(--kit-space-md);\n}\n\n.c {\n  color: red;\n}\n';
  assert.equal(
    textOf(applyScss(source, remove('b', 'gap', token('space-md'), true), PLAIN)),
    '.a {\n  color: red;\n}\n\n.c {\n  color: red;\n}\n',
  );
  assert.equal(
    textOf(
      applyScss(
        '.b {\n  gap: 1px; /* off-kit */\n}\n',
        remove('b', 'gap', raw('1px'), true),
        PLAIN,
      ),
    ),
    '',
  );
});

test('dropRule keeps a rule that still holds a declaration, a block or a comment', () => {
  assert.equal(
    textOf(applyScss(TWO, remove('a', 'gap', token('space-sm'), true), PLAIN)),
    '.a {\n  color: red;\n}\n',
  );
  assert.equal(
    textOf(
      applyScss(
        '.a {\n  /* keep */\n  gap: var(--kit-space-sm);\n}\n',
        remove('a', 'gap', token('space-sm'), true),
        PLAIN,
      ),
    ),
    '.a {\n  /* keep */\n}\n',
  );
  assert.equal(
    textOf(
      applyScss('.a {\n  gap: 1px; /* off-kit */\n}\n', remove('a', 'gap', raw('1px')), PLAIN),
    ),
    '.a {\n}\n',
  );
});

test('a rule created and then dropped leaves every byte of a hard file as it was', () => {
  const source = [
    '@use "../core/mixins";',
    "// it's { a comment",
    '.card {',
    '\tcontent: "}";',
    '\t&:hover { color: red }',
    '\t@media (min-width: #{$bp}) {',
    '\t\tgap: 1px; /* off-kit */',
    '\t}',
    '}',
    '',
    '',
  ].join('\r\n');
  const create = set('hero', 'gap', raw('3px'), null, true);
  const created = textOf(applyScss(source, create, PLAIN));
  assert.equal(created, `${source}\r\n.hero {\r\n\tgap: 3px; /* off-kit */\r\n}\r\n`);
  assert.equal(scssBalanced(created), true);

  const more = set('hero', 'color', token('color-ink'), null);
  const two = textOf(applyScss(created, more, PLAIN));
  assert.equal(
    two,
    `${source}\r\n.hero {\r\n\tgap: 3px; /* off-kit */\r\n\tcolor: var(--kit-color-ink);\r\n}\r\n`,
  );
  const one = textOf(applyScss(two, scssOp(inverse(more)), PLAIN));
  assert.equal(one, created);
  assert.equal(textOf(applyScss(one, scssOp(inverse(create)), PLAIN)), source);
});
