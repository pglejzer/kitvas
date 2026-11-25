// One list item's own class (ADR 0072): the innermost list's key names each copy, the modifier
// goes into the element's `className` once in every form it is written in, and a key that cannot
// name every copy apart is refused.

import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  addItemClassText,
  itemClassAt,
  wrappedClass,
} from '../../../src/edit/domain/list/item-class.ts';
import type { Refusal } from '../../../src/edit/domain/types.ts';

/** Spelt apart, so no plain string here reads like a template's placeholder. */
const DOLLAR = '$';
const TICK = '`';
/** `${code}`, as a template literal of the draft writes it. */
const slot = (code: string): string => `${DOLLAR}{${code}}`;
/** The modifier a template reads: `plans__card--${plan.id}`. */
const modifier = (base: string, expr = 'plan.id'): string => `${base}--${slot(expr)}`;

const FEATURED = "plan.featured ? 'plans__card plans__card--featured' : 'plans__card'";
const PLANS = "{ id: 'starter' }, { id: 'pro', featured: true }, { id: 'business' }";

/** `className: null`: the card has none. */
type Fixture = { items?: string; params?: string; key?: string; className?: string | null };

/** The plans of the spec: three cards from one `.map`, a price inside each. */
function plans(fixture: Fixture = {}): string {
  const { items = PLANS, params = 'plan', key = '{plan.id}' } = fixture;
  const className = fixture.className === undefined ? `{${FEATURED}}` : fixture.className;
  const attribute = className === null ? '' : ` className=${className}`;
  return [
    `const plans = [${items}];`,
    'export function Plans() {',
    `  return <div>{plans.map((${params}) => (`,
    `    <Card key=${key}${attribute}>`,
    '      <Text className="plans__price">x</Text>',
    '    </Card>))}</div>;',
    '}',
    '',
  ].join('\n');
}

/** Plans whose feature rows come from a list inside each plan's item. */
function features(starter: string, pro: string, key = '{feature.id}'): string {
  return [
    `const plans = [{ id: 'starter', features: [${starter}] }, { id: 'pro', features: [${pro}] }];`,
    'export function Plans() {',
    '  return <div>{plans.map((plan) => (',
    '    <Card key={plan.id} className="plans__card">',
    '      <ul>{plan.features.map((feature) => (',
    `        <li key=${key} className="plans__feature">x</li>))}</ul>`,
    '    </Card>))}</div>;',
    '}',
    '',
  ].join('\n');
}

function at(text: string, tag: string): number {
  const found = text.indexOf(`<${tag}`);
  if (found < 0) throw new Error(`no <${tag}`);
  return found;
}

const cardClass = (text: string, path: number[]) =>
  itemClassAt(text, at(text, 'Card'), path, 'plans__card');

test("the copy's key names the class", () => {
  const text = plans();
  assert.deepEqual(cardClass(text, [1]), {
    className: 'plans__card--pro',
    expr: 'plan.id',
    inTsx: false,
  });
  assert.deepEqual(cardClass(text, [0]), {
    className: 'plans__card--starter',
    expr: 'plan.id',
    inTsx: false,
  });
});

test("a part of the item takes the item's key too", () => {
  const text = plans();
  assert.deepEqual(itemClassAt(text, at(text, 'Text'), [1], 'plans__price'), {
    className: 'plans__price--pro',
    expr: 'plan.id',
    inTsx: false,
  });
});

test('a field a pattern binds names the class as well', () => {
  const text = plans({
    params: '{ id, featured }',
    key: '{id}',
    className: "{featured ? 'plans__card plans__card--featured' : 'plans__card'}",
  });
  assert.deepEqual(cardClass(text, [1]), {
    className: 'plans__card--pro',
    expr: 'id',
    inTsx: false,
  });
});

test('duplicate key values are refused', () => {
  const text = plans({ items: "{ id: 'starter' }, { id: 'pro' }, { id: 'pro' }" });
  assert.equal(cardClass(text, [1]), 'item-key');
  // The starter's own value is fine, but one class would style both other cards.
  assert.equal(cardClass(text, [0]), 'item-key');
});

test('a key value that is no class name is refused', () => {
  assert.equal(
    cardClass(plans({ items: "{ id: 'starter' }, { id: 'pro plan' }" }), [0]),
    'item-key',
  );
  // kitvas writes class names in lower case only.
  assert.equal(cardClass(plans({ items: "{ id: 'starter' }, { id: 'Pro' }" }), [0]), 'item-key');
  assert.equal(cardClass(plans({ items: "{ id: 'starter' }, { id: 2 }" }), [0]), 'item-key');
});

test('a key that is not a field of the item is refused', () => {
  const index = plans({ params: 'plan, index', key: '{index}' });
  assert.equal(cardClass(index, [1]), 'item-key');
  assert.equal(cardClass(plans({ key: "{plan.id + 'x'}" }), [1]), 'item-key');
  assert.equal(cardClass(plans({ key: '"pro"' }), [1]), 'item-key');
  assert.equal(cardClass(plans({ key: '{plan.meta.id}' }), [1]), 'item-key');
});

test('an item without the key field is refused', () => {
  const text = plans({ items: "{ id: 'starter' }, { name: 'Pro' }, { id: 'business' }" });
  assert.equal(cardClass(text, [0]), 'item-key');
});

test('a list that is no literal array is refused as today', () => {
  const prop = [
    'export function Plans({ plans }: { plans: { id: string }[] }) {',
    '  return <div>{plans.map((plan) => (',
    '    <Card key={plan.id} className="plans__card">x</Card>))}</div>;',
    '}',
    '',
  ].join('\n');
  assert.equal(cardClass(prop, [1]), 'list-not-literal');
  // An element in no list has no item at all; a path that names no copy is the list's refusal.
  const text = plans();
  assert.equal(itemClassAt(text, at(text, 'div'), [], 'plans'), 'not-list-item');
  assert.equal(cardClass(text, [5]), 'list-item-gone');
  assert.equal(cardClass(text, []), 'not-found');
});

test("the innermost list's key counts", () => {
  // A feature that is a string is no object with a field.
  const strings = features("'a', 'b'", "'c'", '{feature}');
  assert.equal(itemClassAt(strings, at(strings, 'li'), [1, 0], 'plans__feature'), 'item-key');
  const rows = features("{ id: 'sso' }", "{ id: 'api' }, { id: 'sla' }");
  assert.deepEqual(itemClassAt(rows, at(rows, 'li'), [1, 1], 'plans__feature'), {
    className: 'plans__feature--sla',
    expr: 'feature.id',
    inTsx: false,
  });
  // The outer list's key names a plan, not a row.
  const outer = features("{ id: 'sso' }", "{ id: 'api' }", '{plan.id}');
  assert.equal(itemClassAt(outer, at(outer, 'li'), [1, 0], 'plans__feature'), 'item-key');
  // The same row in two plans: one class would style a row of each.
  const twice = features("{ id: 'sso' }", "{ id: 'sso' }, { id: 'api' }");
  assert.equal(itemClassAt(twice, at(twice, 'li'), [1, 1], 'plans__feature'), 'item-key');
});

test('a class already given is seen', () => {
  const text = plans({ className: `{${TICK}plans__card ${modifier('plans__card')}${TICK}}` });
  assert.deepEqual(cardClass(text, [1]), {
    className: 'plans__card--pro',
    expr: 'plan.id',
    inTsx: true,
  });
});

/** The text after `addItemClassText` on the card written with `className`, or its refusal. */
function added(className: string | null): string | Refusal {
  const text = plans({ className });
  const result = addItemClassText(text, at(text, 'Card'), 'plans__card', 'plan.id');
  return 'refused' in result ? result.refused : result.text;
}

const WITH_MODIFIER = `{${TICK}plans__card ${modifier('plans__card')}${TICK}}`;

test('a string className becomes a template literal with the modifier', () => {
  assert.equal(added('"plans__card"'), plans({ className: WITH_MODIFIER }));
  assert.equal(added("'plans__card'"), plans({ className: WITH_MODIFIER }));
});

test('a template className takes the modifier before its closing backtick', () => {
  const tone = `{${TICK}plans__card ${slot('plan.tone')}${TICK}}`;
  const expected = `{${TICK}plans__card ${slot('plan.tone')} ${modifier('plans__card')}${TICK}}`;
  assert.equal(added(tone), plans({ className: expected }));
});

test('any other expression className is wrapped in a template with the modifier', () => {
  const expected = `{${TICK}${slot("cond ? 'a' : 'b'")} ${modifier('plans__card')}${TICK}}`;
  assert.equal(added("{cond ? 'a' : 'b'}"), plans({ className: expected }));
  const featured = `{${TICK}${slot(FEATURED)} ${modifier('plans__card')}${TICK}}`;
  assert.equal(added(`{${FEATURED}}`), plans({ className: featured }));
});

test('a className that gives the modifier already is left as it is', () => {
  assert.equal(added(WITH_MODIFIER), plans({ className: WITH_MODIFIER }));
  const text = plans({ className: WITH_MODIFIER });
  const result = addItemClassText(text, at(text, 'Card'), 'plans__card', 'plan.id');
  if ('refused' in result) assert.fail(result.refused);
  assert.equal(result.moved(text.length - 1), text.length - 1);
});

test('no className, and a string a template would read otherwise, are refused', () => {
  assert.equal(added(null), 'no-classname');
  assert.equal(added(`"plans__card ${slot('x')}"`), 'invalid');
  assert.equal(added(`"plans${TICK}card"`), 'invalid');
  assert.equal(added('"plans\\card"'), 'invalid');
});

test('the template written around an expression keeps its first class', () => {
  const wrapped = `${TICK}${slot(FEATURED)} ${modifier('plans__card')}${TICK}`;
  assert.equal(wrappedClass(wrapped), 'plans__card');
  assert.equal(wrappedClass(`${TICK}${slot("open ? 'menu menu--open' : 'menu'")}${TICK}`), 'menu');
  // Text right after the `}` would go on with the last class; a name gives no class at all.
  assert.equal(wrappedClass(`${TICK}${slot("'card'")}-wide${TICK}`), null);
  assert.equal(wrappedClass(`${TICK}${slot('tone')} card${TICK}`), null);
  assert.equal(wrappedClass(FEATURED), null);
  assert.equal(wrappedClass(`${TICK}card ${slot('tone')}${TICK}`), null);
});
