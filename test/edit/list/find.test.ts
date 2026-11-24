// Finding the array a `.map` renders (plan 16, task D): inline and `const` arrays are literal
// lists; props, imports and computed arrays are read-only with the reason; shadowed names follow
// JavaScript's scopes; only one copy per item counts as an item.

import assert from 'node:assert/strict';
import { test } from 'node:test';
import { findList, listInfo } from '../../../src/edit/domain/list/find.ts';

/** The offset of the `nth` `<tag` in `text`. */
function at(text: string, tag: string, nth = 0): number {
  let from = -1;
  for (let i = 0; i <= nth; i += 1) {
    from = text.indexOf(`<${tag}`, from + 1);
    if (from < 0) throw new Error(`no <${tag} number ${nth}`);
  }
  return from;
}

const lines = (...parts: string[]): string => parts.join('\n');

/** A section that maps a `const` array of its own file. */
const PRICING = lines(
  "import { Card, Heading, Stack, Text } from '@kit';",
  '',
  'const PLANS = [',
  "  { name: 'Free', price: '0' },",
  "  { name: 'Pro', price: '20' },",
  "  { name: 'Team', price: '50' },",
  '];',
  '',
  'export function Pricing() {',
  '  return (',
  '    <section className="pricing">',
  '      <Stack gap="md">',
  '        {PLANS.map((plan) => (',
  '          <Card key={plan.name}>',
  '            <Heading>{plan.name}</Heading>',
  '            <Text>{plan.price}</Text>',
  '          </Card>',
  '        ))}',
  '      </Stack>',
  '    </section>',
  '  );',
  '}',
  '',
);

/** A section whose `.map` reads `receiver`, with `head` above the component. */
function mapping(receiver: string, head: string[] = [], params = ''): string {
  return lines(
    "import { Card, Stack } from '@kit';",
    ...head,
    '',
    `export function Plans(${params}) {`,
    '  return (',
    '    <Stack>',
    `      {${receiver}.map((plan) => (`,
    '        <Card key={plan.name}>{plan.name}</Card>',
    '      ))}',
    '    </Stack>',
    '  );',
    '}',
    '',
  );
}

const LITERAL3 = { kind: 'literal', count: 3, reason: null } as const;
const readOnly = (kind: 'prop' | 'import' | 'computed') => ({
  kind,
  count: null,
  reason: 'list-not-literal',
});

test('a const array of the file is a literal list for every element the callback returns', () => {
  assert.deepEqual(listInfo(PRICING, at(PRICING, 'Card')), LITERAL3);
  assert.deepEqual(listInfo(PRICING, at(PRICING, 'Heading')), LITERAL3);
  assert.deepEqual(listInfo(PRICING, at(PRICING, 'Text')), LITERAL3);
});

test('an element no .map renders is in no list', () => {
  assert.equal(listInfo(PRICING, at(PRICING, 'Stack')), null);
  assert.equal(listInfo(PRICING, at(PRICING, 'section')), null);
  assert.equal(findList(PRICING, 0), null);
});

test('an inline array literal is a literal list, and its items are read in order', () => {
  const text = lines(
    "import { Card } from '@kit';",
    'export function A() {',
    "  return <ul>{[{ name: 'a' }, { name: 'b' }].map((plan) => <Card>{plan.name}</Card>)}</ul>;",
    '}',
  );
  const list = findList(text, at(text, 'Card'));
  assert.equal(list?.kind, 'literal');
  if (list?.kind !== 'literal') return;
  assert.deepEqual(
    list.array.items.map((item) => text.slice(item.span.start, item.span.end)),
    ["{ name: 'a' }", "{ name: 'b' }"],
  );
  assert.deepEqual(list.param, { kind: 'name', name: 'plan' });
});

test('a typed const, an `as const` array and a `satisfies` one are literal lists', () => {
  const items = "[{ name: 'a' }, { name: 'b' }, { name: 'c' }]";
  for (const head of [
    `const PLANS: { name: string }[] = ${items};`,
    `const PLANS = ${items} as const;`,
    `export const PLANS = ${items} satisfies { name: string }[];`,
  ]) {
    const text = mapping('PLANS', [head]);
    assert.deepEqual(listInfo(text, at(text, 'Card')), LITERAL3, head);
  }
});

test('a list from a prop is read-only, destructured or read through props', () => {
  const destructured = mapping('plans', [], '{ plans }: { plans: { name: string }[] }');
  assert.deepEqual(listInfo(destructured, at(destructured, 'Card')), readOnly('prop'));
  const member = mapping('props.plans', [], 'props: { plans: { name: string }[] }');
  assert.deepEqual(listInfo(member, at(member, 'Card')), readOnly('prop'));
  const arrow = lines(
    "import { Card } from '@kit';",
    'export const Plans = ({ plans }) => (',
    '  <div>{plans.map((plan) => <Card>{plan.name}</Card>)}</div>',
    ');',
  );
  assert.deepEqual(listInfo(arrow, at(arrow, 'Card')), readOnly('prop'));
});

test('an imported list is read-only', () => {
  const text = mapping('PLANS', ["import { PLANS } from '../../data';"]);
  assert.deepEqual(listInfo(text, at(text, 'Card')), readOnly('import'));
});

test('computed lists are read-only: calls, let, spreads, holes and globals', () => {
  const items = "[{ name: 'a' }, { name: 'b' }]";
  const cases: [string, string[]][] = [
    ['PLANS.filter(Boolean)', [`const PLANS = ${items};`]],
    ['Object.values(PLANS)', ["const PLANS = { a: { name: 'a' } };"]],
    ['PLANS', [`let PLANS = ${items};`]],
    ['PLANS', ['const PLANS = makePlans();']],
    ['PLANS', [`const PLANS = ${items}.slice(1);`]],
    ['PLANS', [`const MORE = ${items};`, `const PLANS = [...MORE, { name: 'c' }];`]],
    ['PLANS', ["const PLANS = [{ name: 'a' }, , { name: 'c' }];"]],
    ['window.PLANS', []],
    ['PLANS', []],
  ];
  for (const [receiver, head] of cases) {
    const text = mapping(receiver, head);
    const label = `${receiver} ${head.join(' ')}`;
    assert.deepEqual(listInfo(text, at(text, 'Card')), readOnly('computed'), label);
  }
});

test('shadowed names follow the nearest scope: a parameter hides a module const', () => {
  const items = "[{ name: 'a' }, { name: 'b' }]";
  const hidden = mapping('PLANS', [`const PLANS = ${items};`], '{ PLANS }');
  assert.deepEqual(listInfo(hidden, at(hidden, 'Card')), readOnly('prop'));
  // A const inside the component hides an import of the same name.
  const inner = lines(
    "import { Card } from '@kit';",
    "import { PLANS } from '../../data';",
    'export function Plans() {',
    `  const PLANS = ${items};`,
    '  return <div>{PLANS.map((plan) => <Card>{plan.name}</Card>)}</div>;',
    '}',
  );
  assert.deepEqual(listInfo(inner, at(inner, 'Card')), { kind: 'literal', count: 2, reason: null });
  // A name bound in another function is not in scope here.
  const elsewhere = lines(
    "import { Card } from '@kit';",
    `function other() { const PLANS = ${items}; return PLANS; }`,
    'export function Plans() {',
    '  return <div>{PLANS.map((plan) => <Card>{plan.name}</Card>)}</div>;',
    '}',
  );
  assert.deepEqual(listInfo(elsewhere, at(elsewhere, 'Card')), readOnly('computed'));
});

test('an element of a nested map, or behind a condition in the callback, is no item', () => {
  const text = lines(
    "import { Badge, Card, Text } from '@kit';",
    "const PLANS = [{ name: 'a', tags: ['x'] }, { name: 'b', tags: [] }];",
    "const TAGS = ['x', 'y'];",
    'export function Plans() {',
    '  return (',
    '    <div>',
    '      {PLANS.map((plan) => (',
    '        <Card key={plan.name}>',
    '          {plan.name === "a" && <Badge>Best</Badge>}',
    '          {TAGS.map((tag) => <Text key={tag}>{tag}</Text>)}',
    '        </Card>',
    '      ))}',
    '    </div>',
    '  );',
    '}',
  );
  assert.deepEqual(listInfo(text, at(text, 'Card')), { kind: 'literal', count: 2, reason: null });
  assert.deepEqual(listInfo(text, at(text, 'Badge')), readOnly('computed'));
  assert.deepEqual(listInfo(text, at(text, 'Text')), readOnly('computed'));
});

test('a block body with one return and a function are lists; an early return is not', () => {
  const items = "const PLANS = [{ name: 'a' }, { name: 'b' }];";
  const block = lines(
    "import { Card } from '@kit';",
    items,
    'export function Plans() {',
    '  return (',
    '    <div>',
    '      {PLANS.map((plan) => {',
    '        const label = plan.name;',
    '        return <Card key={label}>{plan.name}</Card>;',
    '      })}',
    '    </div>',
    '  );',
    '}',
  );
  const two = { kind: 'literal', count: 2, reason: null };
  assert.deepEqual(listInfo(block, at(block, 'Card')), two);
  const fn = block.replace('PLANS.map((plan) => {', 'PLANS.map(function (plan) {');
  assert.deepEqual(listInfo(fn, at(fn, 'Card')), two);
  const early = block.replace(
    '        const label = plan.name;',
    "        if (plan.name === 'b') return null;\n        const label = plan.name;",
  );
  assert.deepEqual(listInfo(early, at(early, 'Card')), readOnly('computed'));
});

test('a list mapped into a variable before the return is a literal list', () => {
  const text = lines(
    "import { Card, Stack } from '@kit';",
    "const PLANS = [{ name: 'a' }, { name: 'b' }];",
    'export function Plans() {',
    '  const cards = PLANS.map((plan) => <Card key={plan.name}>{plan.name}</Card>);',
    '  return <Stack>{cards}</Stack>;',
    '}',
  );
  assert.deepEqual(listInfo(text, at(text, 'Card')), { kind: 'literal', count: 2, reason: null });
});

test('the callback parameter is read as a name or as the fields its pattern binds', () => {
  const named = findList(PRICING, at(PRICING, 'Heading'));
  assert.ok(named?.kind === 'literal');
  assert.deepEqual(named.param, { kind: 'name', name: 'plan' });
  const fields = PRICING.replace('(plan) => (', '({ name, price: cost }, index) => (');
  const read = findList(fields, at(fields, 'Heading'));
  assert.ok(read?.kind === 'literal');
  assert.deepEqual(read.param.kind === 'fields' ? [...read.param.fields] : [], [
    ['name', 'name'],
    ['cost', 'price'],
  ]);
  const typed = PRICING.replace('(plan) => (', '(plan: { name: string }) => (');
  const typedList = findList(typed, at(typed, 'Heading'));
  assert.ok(typedList?.kind === 'literal');
  assert.deepEqual(typedList.param, { kind: 'name', name: 'plan' });
});
