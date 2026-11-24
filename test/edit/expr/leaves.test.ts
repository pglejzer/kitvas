// The operands a value can come from, and the class every value of an expression `className`
// starts with (ADR 0060).

import assert from 'node:assert/strict';
import { test } from 'node:test';
import { constantClass } from '../../../src/edit/domain/expr/class-start.ts';
import { type LeafOptions, valueLeaves } from '../../../src/edit/domain/expr/leaves.ts';
import type { Reader } from '../../../src/edit/domain/list/path.ts';
import { jsTokens } from '../../../src/edit/domain/tsx/tsx-reader.ts';

/** Spelt apart, so no plain string here reads like a template's placeholder. */
const DOLLAR = '$';
const TONE = `${DOLLAR}{tone}`;
const SIZE = `${DOLLAR}{size}`;

/** The operands of the code `source`, as written. */
function leaves(source: string, options: LeafOptions = {}): string[] {
  const reader: Reader = { text: source, tokens: jsTokens(source, 0, true) };
  return valueLeaves(reader, 0, reader.tokens.length, options).map((leaf) => {
    const from = reader.tokens[leaf.from]?.start ?? 0;
    const to = reader.tokens[leaf.to - 1]?.end ?? 0;
    return source.slice(from, to);
  });
}

test('a condition gives its branches, nested ones too, and never its test', () => {
  const billed = "plan.free ? 'free forever' : annual ? plan.billed : 'billed monthly'";
  assert.deepEqual(leaves(billed), ["'free forever'", 'plan.billed', "'billed monthly'"]);
  assert.deepEqual(leaves("a ? b ? 'x' : 'y' : 'z'"), ["'x'", "'y'", "'z'"]);
});

test('either side of || and ??, the right side of &&, inside any brackets', () => {
  assert.deepEqual(leaves("label || 'Save'"), ['label', "'Save'"]);
  assert.deepEqual(leaves("(label ?? ('Save'))"), ['label', "'Save'"]);
  assert.deepEqual(leaves("open && 'Close'"), ["'Close'"]);
  assert.deepEqual(leaves("open && 'Close'", { andLeft: true }), ['open', "'Close'"]);
});

test('optional chaining and a comparison are no condition or pair of their own', () => {
  assert.deepEqual(leaves('plan?.name'), ['plan?.name']);
  assert.deepEqual(leaves("count >= 2 ? 'many' : 'one'"), ["'many'", "'one'"]);
  assert.deepEqual(leaves("a?.b ?? 'none'"), ['a?.b', "'none'"]);
});

test('a comma, an assignment or an arrow makes the value one operand', () => {
  assert.deepEqual(leaves("(x, 'a')"), ["x, 'a'"]);
  assert.deepEqual(leaves("x = 'a'"), ["x = 'a'"]);
  assert.deepEqual(leaves("() => 'a' || 'b'"), ["() => 'a' || 'b'"]);
  assert.deepEqual(leaves('format(a ? b : c)'), ['format(a ? b : c)']);
  assert.deepEqual(leaves(''), []);
});

test('an expression className gives the first class all of its values share', () => {
  const card = "plan.featured ? 'plans__card plans__card--featured' : 'plans__card'";
  assert.equal(constantClass(card), 'plans__card');
  assert.equal(constantClass("open ? 'menu menu--open' : 'menu'"), 'menu');
  // The text before a template's first `${…}` holds a whole first class.
  assert.equal(constantClass(`\`card ${TONE}\``), 'card');
  assert.equal(constantClass(`wide ? \`hero hero--${SIZE}\` : 'hero'`), 'hero');
  assert.equal(constantClass("'plain'"), 'plain');
});

test('an expression className with no class shared by every value gives none', () => {
  assert.equal(constantClass("featured ? 'card--featured card' : 'card'"), null);
  // The class name may go on past `${…}`: `card-${tone}` is no class `card`.
  assert.equal(constantClass(`\`card-${TONE}\``), null);
  // A falsy left side gives no class at all.
  assert.equal(constantClass("featured && 'card'"), null);
  assert.equal(constantClass("cx('card', featured)"), null);
  assert.equal(constantClass('styles.card'), null);
  // A first class kitvas may not write.
  assert.equal(constantClass("open ? 'Menu menu--open' : 'Menu'"), null);
  assert.equal(constantClass("open ? '' : ' '"), null);
});
