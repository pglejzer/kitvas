// The list ops on a text (plan 16, task D): every op writes only the touched items' text, keeps
// commas, line breaks, indentation, comments and a trailing comma as written, and refuses what it
// cannot read. The inverse through the whole request is in `list-edits.test.ts`.

import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  applyListEdit,
  itemTexts,
  type ListOp,
  type ListResult,
} from '../../src/edit/domain/list/edit.ts';
import { decodeString, encodeString } from '../../src/edit/domain/list/text.ts';

const ID = 'sections/Pricing:section/Stack/Card';
/** Spelt apart, so no plain string here reads like a template's placeholder. */
const DOLLAR = '$';

/** The offset of the first `<tag` in `text`. */
function at(text: string, tag: string): number {
  const found = text.indexOf(`<${tag}`);
  if (found < 0) throw new Error(`no <${tag}`);
  return found;
}

const FREE = "  { name: 'Free', price: '0' },";
const PRO = "  { name: 'Pro', price: '20' },";
const TEAM = "  { name: 'Team', price: '50' },";

/** The pricing section with these lines between `const PLANS = [` and `];`. */
function pricing(items: string[], eol = '\n'): string {
  return [
    "import { Card, Heading, Stack, Text } from '@kit';",
    '',
    'const PLANS = [',
    ...items,
    '];',
    '',
    'export function Pricing() {',
    '  return (',
    '    <section className="pricing">',
    '      <Stack gap="md">',
    '        {PLANS.map((plan) => (',
    '          <Card key={plan.name}>',
    '            <Heading>{plan.name}</Heading>',
    '            <Text>Price: {plan.price}</Text>',
    '          </Card>',
    '        ))}',
    '      </Stack>',
    '    </section>',
    '  );',
    '}',
    '',
  ].join(eol);
}

const PRICING = pricing([FREE, PRO, TEAM]);

/** A section that maps `TAGS`, declared as `array`, into texts that show each item. */
function tags(array: string): string {
  return [
    "import { Text } from '@kit';",
    `const TAGS = ${array};`,
    'export function Tags() {',
    '  return <p>{TAGS.map((tag) => <Text key={tag}>{tag}</Text>)}</p>;',
    '}',
    '',
  ].join('\n');
}

function run(text: string, tag: string, op: ListOp, force = false): ListResult {
  return applyListEdit(text, at(text, tag), op, { force });
}

function edited(text: string, tag: string, op: ListOp, force = false): string {
  const result = run(text, tag, op, force);
  assert.ok('text' in result, JSON.stringify(result));
  return result.text;
}

const move = (item: number, to: number): ListOp => ({ op: 'moveItem', id: ID, item, to });
const duplicate = (item: number): ListOp => ({ op: 'duplicateItem', id: ID, item });
const remove = (item: number): ListOp => ({ op: 'removeItem', id: ID, item });
const retext = (item: number, value: string, before: string): ListOp => ({
  op: 'setItemText',
  id: ID,
  item,
  value,
  before,
});

test('a move swaps only the item texts of the places between; each keeps its separator', () => {
  assert.equal(edited(PRICING, 'Heading', move(0, 2)), pricing([PRO, TEAM, FREE]));
  assert.equal(edited(PRICING, 'Card', move(2, 0)), pricing([TEAM, FREE, PRO]));
  assert.equal(edited(PRICING, 'Text', move(1, 2)), pricing([FREE, TEAM, PRO]));
  assert.equal(edited(PRICING, 'Card', move(1, 1)), PRICING);
});

test('duplicate puts a copy right after the item, with the separator the array uses', () => {
  assert.equal(edited(PRICING, 'Card', duplicate(1)), pricing([FREE, PRO, PRO, TEAM]));
  assert.equal(edited(PRICING, 'Card', duplicate(2)), pricing([FREE, PRO, TEAM, TEAM]));
  assert.equal(edited(PRICING, 'Card', duplicate(0)), pricing([FREE, FREE, PRO, TEAM]));
});

test('remove takes the item and one separator, and a trailing comma stays as written', () => {
  assert.equal(edited(PRICING, 'Card', remove(0)), pricing([PRO, TEAM]));
  assert.equal(edited(PRICING, 'Card', remove(1)), pricing([FREE, TEAM]));
  assert.equal(edited(PRICING, 'Card', remove(2)), pricing([FREE, PRO]));
  // Without a trailing comma, the last item takes the comma before it.
  const bare = pricing([FREE, PRO, TEAM.slice(0, -1)]);
  assert.equal(edited(bare, 'Card', remove(2)), pricing([FREE, PRO.slice(0, -1)]));
  assert.equal(edited(bare, 'Card', duplicate(2)), pricing([FREE, PRO, TEAM, TEAM.slice(0, -1)]));
  // The only item leaves an empty array.
  const one = pricing([FREE]);
  assert.equal(edited(one, 'Card', remove(0)), one.replace(`[\n${FREE}\n]`, '[]'));
});

test('one-line arrays keep their own spacing', () => {
  const spaced = tags("['a', 'b', 'c']");
  assert.equal(edited(spaced, 'Text', duplicate(0)), tags("['a', 'a', 'b', 'c']"));
  assert.equal(edited(spaced, 'Text', duplicate(2)), tags("['a', 'b', 'c', 'c']"));
  assert.equal(edited(spaced, 'Text', remove(1)), tags("['a', 'c']"));
  assert.equal(edited(spaced, 'Text', remove(2)), tags("['a', 'b']"));
  assert.equal(edited(spaced, 'Text', move(2, 0)), tags("['c', 'a', 'b']"));
  assert.equal(edited(tags("['a','b']"), 'Text', duplicate(1)), tags("['a','b','b']"));
  assert.equal(edited(tags("['a']"), 'Text', duplicate(0)), tags("['a', 'a']"));
});

test('a CRLF file keeps CRLF in the separators it writes', () => {
  const crlf = pricing([FREE, PRO, TEAM], '\r\n');
  assert.equal(edited(crlf, 'Card', duplicate(2)), pricing([FREE, PRO, TEAM, TEAM], '\r\n'));
  assert.equal(edited(crlf, 'Card', move(0, 1)), pricing([PRO, FREE, TEAM], '\r\n'));
  assert.equal(edited(crlf, 'Card', remove(2)), pricing([FREE, PRO], '\r\n'));
});

test('comments between items stay where they are', () => {
  const text = pricing([
    '  // the free one',
    "  { name: 'Free' },",
    "  { name: 'Pro' }, // the best",
    "  { name: 'Team' },",
  ]);
  const moved = pricing([
    '  // the free one',
    "  { name: 'Team' },",
    "  { name: 'Free' }, // the best",
    "  { name: 'Pro' },",
  ]);
  assert.equal(edited(text, 'Card', move(2, 0)), moved);
  const copied = pricing([
    '  // the free one',
    "  { name: 'Free' },",
    "  { name: 'Pro' }, // the best",
    "  { name: 'Pro' },",
    "  { name: 'Team' },",
  ]);
  assert.equal(edited(text, 'Card', duplicate(1)), copied);
});

test('the offsets of elements inside the items follow the items they are in', () => {
  const text = [
    "import { Card, Icon } from '@kit';",
    'const ITEMS = [{ icon: <Icon name="a" /> }, { icon: <Icon name="b" /> }];',
    'export function Icons() {',
    '  return <p>{ITEMS.map((item) => <Card key={1}>{item.icon}</Card>)}</p>;',
    '}',
  ].join('\n');
  const result = run(text, 'Card', move(0, 1));
  assert.ok('moved' in result);
  const first = text.indexOf('<Icon name="a"');
  const second = text.indexOf('<Icon name="b"');
  assert.equal(result.moved(first), result.text.indexOf('<Icon name="a"'));
  assert.equal(result.moved(second), result.text.indexOf('<Icon name="b"'));
  const card = text.indexOf('<Card');
  assert.equal(result.moved(card), result.text.indexOf('<Card'));
  const removed = run(text, 'Card', remove(0));
  assert.ok('moved' in removed);
  assert.equal(removed.moved(first), null);
  assert.equal(removed.moved(second), removed.text.indexOf('<Icon name="b"'));
});

test('setItemText writes the field of that item in its own quotes, and nothing else', () => {
  const pro = "  { name: 'Pro plus', price: '20' },";
  assert.equal(
    edited(PRICING, 'Heading', retext(1, 'Pro plus', 'Pro')),
    pricing([FREE, pro, TEAM]),
  );
  const quoted = "  { name: 'It\\'s', price: '0' },";
  assert.equal(edited(PRICING, 'Heading', retext(0, "It's", 'Free')), pricing([quoted, PRO, TEAM]));
  const doubled = pricing(['  { name: "Pro", price: "20" },']);
  assert.equal(
    edited(doubled, 'Heading', retext(0, 'Say "hi"', 'Pro')),
    pricing(['  { name: "Say \\"hi\\"", price: "20" },']),
  );
  assert.equal(edited(PRICING, 'Heading', retext(1, 'Pro', 'Pro')), PRICING);
  // The item itself, when it is the string the text shows.
  const list = tags("['a', 'b', 'c']");
  assert.equal(edited(list, 'Text', retext(1, 'B', 'b')), tags("['a', 'B', 'c']"));
});

test('setItemText reads a field the callback destructures', () => {
  const text = PRICING.replace('(plan) => (', '({ name, price: cost }) => (')
    .replace('{plan.name}</Heading>', '{name}</Heading>')
    .replace('key={plan.name}', 'key={name}');
  const expected = pricing([FREE, "  { name: 'Pro!', price: '20' },", TEAM])
    .replace('(plan) => (', '({ name, price: cost }) => (')
    .replace('{plan.name}</Heading>', '{name}</Heading>')
    .replace('key={plan.name}', 'key={name}');
  assert.equal(edited(text, 'Heading', retext(1, 'Pro!', 'Pro')), expected);
});

test('setItemText on a changed value is a conflict, and "keep mine" writes it anyway', () => {
  assert.deepEqual(run(PRICING, 'Heading', retext(1, 'Max', 'Basic')), { conflict: 'changed' });
  const forced = edited(PRICING, 'Heading', retext(1, 'Max', 'Basic'), true);
  assert.equal(forced, pricing([FREE, "  { name: 'Max', price: '20' },", TEAM]));
});

test('what the ops cannot read is refused with its reason', () => {
  // `Price: {plan.price}` mixes text and the field; a number is no string.
  assert.deepEqual(run(PRICING, 'Text', retext(0, '1', '0')), { refused: 'list-text-not-literal' });
  assert.deepEqual(run(PRICING, 'Card', retext(0, 'x', 'y')), { refused: 'list-text-not-literal' });
  const numbers = pricing(["  { name: 'Free', price: 0 },"]).replace(
    'Price: {plan.price}',
    '{plan.price}',
  );
  assert.deepEqual(run(numbers, 'Text', retext(0, '1', '0')), { refused: 'list-text-not-literal' });
  // An index past the end.
  assert.deepEqual(run(PRICING, 'Card', remove(3)), { refused: 'list-item-gone' });
  assert.deepEqual(run(PRICING, 'Card', move(0, 3)), { refused: 'list-item-gone' });
  assert.deepEqual(run(PRICING, 'Heading', retext(5, 'x', 'y')), { refused: 'list-item-gone' });
  // A list from a prop, and an element no list renders.
  const prop = PRICING.replace('function Pricing() {', 'function Pricing({ PLANS }) {');
  for (const op of [move(0, 1), duplicate(0), remove(0), retext(0, 'x', 'Free')]) {
    assert.deepEqual(run(prop, 'Card', op), { refused: 'list-not-literal' });
  }
  assert.deepEqual(run(PRICING, 'Stack', remove(0)), { refused: 'list-not-literal' });
});

test('itemTexts gives the string each item shows, and null where it shows none', () => {
  assert.deepEqual(itemTexts(PRICING, at(PRICING, 'Heading')), ['Free', 'Pro', 'Team']);
  assert.equal(itemTexts(PRICING, at(PRICING, 'Text')), null);
  assert.equal(itemTexts(PRICING, at(PRICING, 'Card')), null);
  const mixed = pricing([FREE, '  { name: label, price: "1" },']);
  assert.deepEqual(itemTexts(mixed, at(mixed, 'Heading')), ['Free', null]);
  const quotes = tags("['a', `b`]");
  assert.deepEqual(itemTexts(quotes, at(quotes, 'Text')), ['a', 'b']);
});

test('string literals are read with their escapes and written back in their quotes', () => {
  assert.equal(decodeString("'It\\'s'"), "It's");
  assert.equal(decodeString('"a\\nb\\t"'), 'a\nb\t');
  assert.equal(decodeString("'\\u00e9\\x41\\u{1F600}'"), 'éA😀');
  assert.equal(decodeString('`plain`'), 'plain');
  assert.equal(decodeString(`\`a${DOLLAR}{b}\``), null);
  assert.equal(decodeString("'\\1'"), null);
  assert.equal(decodeString("'open"), null);
  assert.equal(encodeString("It's", "'"), "'It\\'s'");
  assert.equal(encodeString('a\nb\\c', '"'), '"a\\nb\\\\c"');
  assert.equal(encodeString(`${DOLLAR}{x}`, '`'), `\`\\${DOLLAR}{x}\``);
  for (const value of ["It's", 'a "b"', 'x\ny', 'back\\slash', `${DOLLAR}{y} and ${DOLLAR}z`]) {
    for (const quote of ["'", '"', '`']) {
      assert.equal(decodeString(encodeString(value, quote)), value, `${quote}${value}`);
    }
  }
});
