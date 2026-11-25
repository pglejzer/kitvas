// The class a style edit gives an element without one (ADR 0067): `<block>__<part>`, the block
// taken from the root element of the JSX it is in, else from the file's name.

import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  blockOf,
  classNameOf,
  type NewClass,
  newClassName,
  rootOf,
} from '../../../src/edit/domain/style/class-name.ts';

const lines = (...text: string[]): string => `${text.join('\n')}\n`;

const PLANS = lines(
  "import { Button, Card, Stack } from '@kit';",
  '',
  'export function Plans() {',
  '  return (',
  '    <section className="plans">',
  '      <Stack gap="lg">',
  '        <Button>Save</Button>',
  '        {items.map((item) => (',
  '          <Card key={item}>',
  '            <Card.Header>{item}</Card.Header>',
  '          </Card>',
  '        ))}',
  '      </Stack>',
  '    </section>',
  '  );',
  '}',
);
const FILE = 'src/tsx/sections/Plans.tsx';

/** The new class of the element whose tag starts at the first `<tag` of the text. */
function nameOf(tsx: string, tag: string, more: Partial<NewClass> = {}): string {
  const at = tsx.indexOf(`<${tag}`);
  assert.ok(at >= 0, tag);
  return newClassName({ tag, tsx, at, file: FILE, scss: '', taken: new Set(), ...more });
}

test('the name is the tag in kebab case, a class kitvas may write', () => {
  assert.equal(classNameOf('Card.Header'), 'card-header');
  assert.equal(classNameOf('PriceTag'), 'price-tag');
  assert.equal(classNameOf('h2'), 'h2');
  assert.equal(classNameOf('9Lives'), 'el-9-lives');
});

test("an element's new class carries the block of its section's root", () => {
  assert.equal(rootOf(PLANS, PLANS.indexOf('<Card.Header')), PLANS.indexOf('<section'));
  assert.equal(blockOf(PLANS, PLANS.indexOf('<section'), FILE), 'plans');
  assert.equal(nameOf(PLANS, 'Button'), 'plans__button');
  assert.equal(nameOf(PLANS, 'Stack'), 'plans__stack');
  // Inside a `.map`, in the same section.
  assert.equal(nameOf(PLANS, 'Card'), 'plans__card');
  assert.equal(nameOf(PLANS, 'Card.Header'), 'plans__card-header');
});

test('a name the TSX or the SCSS uses gets the next number', () => {
  assert.equal(nameOf(PLANS, 'Button', { taken: new Set(['plans__button']) }), 'plans__button-2');
  const both = new Set(['plans__button', 'plans__button-2']);
  assert.equal(nameOf(PLANS, 'Button', { taken: both }), 'plans__button-3');
  // A rule nested as `&__button` is the rule of `plans__button`.
  const nested = lines('.plans {', '  &__button {', '    gap: 1px;', '  }', '}');
  assert.equal(nameOf(PLANS, 'Button', { scss: nested }), 'plans__button-2');
  // Any selector that names it, not only a rule of the class alone.
  const hover = lines('.plans__button:hover {', '  color: red;', '}');
  assert.equal(nameOf(PLANS, 'Button', { scss: hover }), 'plans__button-2');
  // A longer name that starts with it is another class.
  const longer = lines('.plans__button-row {', '  gap: 1px;', '}');
  assert.equal(nameOf(PLANS, 'Button', { scss: longer }), 'plans__button');
});

const PRICING = 'src/tsx/sections/PricingTable.tsx';

test('a root without one class gives the block of the file name, and takes the block itself', () => {
  const bare = PLANS.replace('<section className="plans">', '<section>');
  assert.equal(nameOf(bare, 'Button', { file: PRICING }), 'pricing-table__button');
  assert.equal(nameOf(bare, 'section', { file: PRICING }), 'pricing-table');
  // A block someone has already: the root is a part of it like any other element.
  const taken = new Set(['pricing-table']);
  assert.equal(nameOf(bare, 'section', { file: PRICING, taken }), 'pricing-table__section');
  const two = PLANS.replace('className="plans"', 'className="plans dark"');
  assert.equal(nameOf(two, 'Button', { file: PRICING }), 'pricing-table__button');
});

test("a helper component's root that is a part of the block names the block, not itself", () => {
  const helper = lines(
    "import { Button } from '@kit';",
    '',
    'function PlanCard() {',
    '  return (',
    '    <article className="plans__card">',
    '      <Button>Buy</Button>',
    '    </article>',
    '  );',
    '}',
  );
  assert.equal(nameOf(helper, 'Button'), 'plans__button');
  assert.equal(nameOf(helper.replace('plans__card', 'plans--dark'), 'Button'), 'plans__button');
  assert.equal(nameOf(helper.replace('plans__card', 'plan-card'), 'Button'), 'plan-card__button');
});

test('a long name is cut to leave room for its number, never ending in a dash', () => {
  const block = 'a'.repeat(50);
  const long = PLANS.replace('className="plans"', `className="${block}"`).replace(
    /Button/g,
    'AbcDef',
  );
  const name = nameOf(long, 'AbcDef');
  assert.equal(name, `${block}__abc`);
  assert.ok(name.length <= 56);
});
