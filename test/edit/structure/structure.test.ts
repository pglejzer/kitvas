import assert from 'node:assert/strict';
import { after, test } from 'node:test';
import { createDraft, type DraftStore, entryTsx } from '../../../src/drafts/index.ts';
import { createEsbuildCompiler } from '../../../src/edit/adapters/esbuild-compiler.ts';
import { inspectElement } from '../../../src/edit/app/inspect.ts';
import {
  readStructure,
  readSubtree,
  type StructureEntryView,
  type StructureView,
} from '../../../src/edit/app/structure/structure.ts';
import { hashOf } from '../../../src/edit/domain/ops.ts';
import { KitvasError, PLUGIN_ROOT } from '../../../src/shared/index.ts';
import { etagOf } from '../../../src/studio/http/etag.ts';
import { NOW, tempDrafts } from '../../helpers/draft/drafts.ts';
import { builtinKits } from '../../helpers/kit/kits.ts';

const BASE = { id: 'base', version: '1.0.0', hash: 'b'.repeat(64) };
const PRICING_FILE = 'src/tsx/sections/Pricing.tsx';
const HERO_FILE = 'src/tsx/sections/Hero.tsx';
const SCSS_FILE = 'src/scss/sections/pricing.scss';
const P = 'sections/Pricing:section';

const PRICING_TSX = [
  "import { Button, Card, Checkbox, Input, Stack, Text } from '@kit';",
  '',
  "const plans = [{ name: 'Free' }, { name: 'Pro' }];",
  '',
  'export function Pricing(_props: { state: string }) {',
  '  return (',
  '    <section className="pricing">',
  '      <Stack gap="md">',
  '        <Text tone="muted">Plans</Text>',
  '        {plans.map((plan) => (',
  '          <Card key={plan.name}>',
  '            <Text>{plan.name}</Text>',
  '          </Card>',
  '        ))}',
  '        <Input label="Email" />',
  '        <Checkbox label={<Text>Add a helmet</Text>} />',
  '        <p>',
  '          Billed <strong>monthly</strong>.',
  '        </p>',
  '        <Button>Buy</Button>',
  '      </Stack>',
  '    </section>',
  '  );',
  '}',
  '',
].join('\n');

const HERO_TSX = [
  'export function Hero(_props: { state: string }) {',
  '  return <h1>Hello</h1>;',
  '}',
  '',
].join('\n');

const PRICING_SCSS = '.pricing {\n  padding: var(--kit-space-lg);\n}\n';

/** Pricing first, then Hero: the page order is the layout's, not the files' names. */
const LAYOUT = [
  '# Layout: Shop',
  '',
  '## pricing',
  'Purpose: Show the plans.',
  'Components: Stack, Card',
  '',
  '## hero',
  'Purpose: Say hello.',
  'Components: Heading',
  '',
].join('\n');

const SECTIONS = [{ id: 'pricing' }, { id: 'hero' }];

const compiler = createEsbuildCompiler([PLUGIN_ROOT]);
after(() => compiler.dispose());

/**
 * The `shop` draft on the Base kit with the two sections and the generated entry in version 1;
 * `files` replace some of them (`null`: that file is not written).
 */
function shop(files: Record<string, string | null> = {}): DraftStore {
  const { store } = tempDrafts();
  createDraft(store, { slug: 'shop', title: 'Shop', kit: BASE, now: NOW });
  const all: Record<string, string | null> = {
    'md/layout.md': LAYOUT,
    [PRICING_FILE]: PRICING_TSX,
    [HERO_FILE]: HERO_TSX,
    [SCSS_FILE]: PRICING_SCSS,
    'src/tsx/index.tsx': entryTsx(SECTIONS),
    ...files,
  };
  for (const [path, text] of Object.entries(all)) {
    if (text !== null) store.writeText('shop', `v1/${path}`, text);
  }
  return store;
}

const structureOf = (drafts: DraftStore): Promise<StructureView> =>
  readStructure({ drafts, kits: builtinKits(), compiler, etag: etagOf }, 'shop');

function entry(structure: StructureView, id: string): StructureEntryView {
  const found = structure.elements.find((each) => each.id === id);
  assert.ok(found, `no entry ${id}`);
  return found;
}

const isCode = (code: string) => (error: unknown) =>
  error instanceof KitvasError && error.code === code;

/** The Card of the mapped list, from its `<` to the end of `</Card>`. */
const CARD_SOURCE = PRICING_TSX.slice(
  PRICING_TSX.indexOf('<Card key'),
  PRICING_TSX.indexOf('</Card>') + '</Card>'.length,
);

test('every element of the latest version is listed in page order with its parent', async () => {
  const structure = await structureOf(shop());
  assert.equal(structure.version, 1);
  assert.deepEqual(
    structure.elements.map((each) => each.id),
    [
      P,
      `${P}/Stack`,
      `${P}/Stack/Text`,
      `${P}/Stack/Card`,
      `${P}/Stack/Card/Text`,
      `${P}/Stack/Input`,
      `${P}/Stack/Checkbox`,
      `${P}/Stack/Checkbox/Text`,
      `${P}/Stack/p`,
      `${P}/Stack/p/strong`,
      `${P}/Stack/Button`,
      'sections/Hero:h1',
    ],
  );
  assert.equal(entry(structure, P).parent, null);
  assert.equal(entry(structure, `${P}/Stack`).parent, P);
  assert.equal(entry(structure, `${P}/Stack/Checkbox/Text`).parent, `${P}/Stack/Checkbox`);
  assert.equal(entry(structure, 'sections/Hero:h1').file, HERO_FILE);
  assert.deepEqual(structure.etags, {
    [HERO_FILE]: etagOf(HERO_TSX),
    [PRICING_FILE]: etagOf(PRICING_TSX),
    [SCSS_FILE]: etagOf(PRICING_SCSS),
  });
});

test('an element says where its < is, and the structure names the version folder', async () => {
  const drafts = shop();
  const structure = await structureOf(drafts);
  const section = entry(structure, P);
  assert.deepEqual([section.file, section.line, section.column], [PRICING_FILE, 7, 5]);
  const hero = entry(structure, 'sections/Hero:h1');
  assert.deepEqual([hero.file, hero.line, hero.column], [HERO_FILE, 2, 10]);
  assert.equal(structure.folder, `${drafts.dir('shop').replaceAll('\\', '/')}/v1`);
  assert.equal(structure.folder.includes('\\'), false);
});

test('an item of a mapped list cannot move as an element; a plain child inside it can', async () => {
  const structure = await structureOf(shop());
  const card = entry(structure, `${P}/Stack/Card`);
  assert.equal(card.movable, 'in-expression');
  assert.equal(card.root, null);
  assert.equal(card.parent, `${P}/Stack`);
  // Only the element's own place counts: a child of the template moves like any other.
  assert.equal(entry(structure, `${P}/Stack/Card/Text`).movable, null);
  // Its siblings outside the expression move as usual.
  assert.equal(entry(structure, `${P}/Stack/Text`).movable, null);
  assert.equal(entry(structure, `${P}/Stack/Button`).movable, null);
});

test('the element a map over a literal array returns is a list item, nothing else is', async () => {
  const structure = await structureOf(shop());
  assert.equal(entry(structure, `${P}/Stack/Card`).item, true);
  // Deeper in the callback: part of the item, not an item of its own.
  assert.equal(entry(structure, `${P}/Stack/Card/Text`).item, false);
  // Outside any map, in an expression or not.
  const plain = [P, `${P}/Stack`, `${P}/Stack/Text`, `${P}/Stack/Checkbox/Text`, `${P}/Stack/p`];
  for (const id of plain) assert.equal(entry(structure, id).item, false, id);
});

test('an element names the roots of the lists around it, outer first', async () => {
  const structure = await structureOf(shop());
  const card = `${P}/Stack/Card`;
  assert.deepEqual(entry(structure, card).lists, [card]);
  assert.deepEqual(entry(structure, `${card}/Text`).lists, [card]);
  const outside = [P, `${P}/Stack`, `${P}/Stack/Text`, `${P}/Stack/Checkbox/Text`, `${P}/Stack/p`];
  for (const id of outside) assert.deepEqual(entry(structure, id).lists, [], id);
});

/** The plans with a list of features in each: a list inside a list item. */
const NESTED_TSX = [
  "import { Card, Heading, Stack } from '@kit';",
  '',
  'const PLANS = [',
  "  { name: 'Starter', features: ['Up to 3 projects', 'Kanban views'] },",
  "  { name: 'Business', features: ['Everything in Pro'] },",
  '];',
  '',
  'export function Pricing(_props: { state: string }) {',
  '  return (',
  '    <section className="pricing">',
  '      <Stack gap="md">',
  '        {PLANS.map((plan) => (',
  '          <Card key={plan.name}>',
  '            <Heading>{plan.name}</Heading>',
  '            <ul>',
  '              {plan.features.map((feature) => (',
  '                <li key={feature}>',
  '                  <span>{feature}</span>',
  '                </li>',
  '              ))}',
  '            </ul>',
  '          </Card>',
  '        ))}',
  '      </Stack>',
  '    </section>',
  '  );',
  '}',
  '',
].join('\n');

test('the root of a list inside a list item is an item too, and its parts are not', async () => {
  const structure = await structureOf(shop({ [PRICING_FILE]: NESTED_TSX }));
  const card = `${P}/Stack/Card`;
  const row = `${card}/ul/li`;
  const facts = (id: string) => {
    const { lists, item, movable } = entry(structure, id);
    return { lists, item, movable };
  };
  assert.deepEqual(facts(card), { lists: [card], item: true, movable: 'in-expression' });
  assert.deepEqual(facts(`${card}/Heading`), { lists: [card], item: false, movable: null });
  assert.deepEqual(facts(`${card}/ul`), { lists: [card], item: false, movable: null });
  assert.deepEqual(facts(row), { lists: [card, row], item: true, movable: 'in-expression' });
  assert.deepEqual(facts(`${row}/span`), { lists: [card, row], item: false, movable: null });
});

test('a list whose copies cannot be counted is named by no root', async () => {
  // A condition at the top of the callback: some items render another element.
  const either = NESTED_TSX.replace(
    '                <li key={feature}>',
    '                feature === \'\' ? <li key="none" /> : <li key={feature}>',
  )
    .replace('{plan.features.map((feature) => (', '{plan.features.map((feature) =>')
    .replace('              ))}', '              )}');
  assert.notEqual(either, NESTED_TSX);
  const structure = await structureOf(shop({ [PRICING_FILE]: either }));
  const rows = structure.elements.filter((each) => each.tag === 'li');
  assert.equal(rows.length, 2);
  for (const row of rows) assert.deepEqual([row.lists, row.item], [null, false], row.id);
  // The outer list is still counted.
  const card = `${P}/Stack/Card`;
  assert.deepEqual(entry(structure, card).lists, [card]);
  assert.equal(entry(structure, card).item, true);
});

test('an inner list over anything but a field of the outer item makes no item', async () => {
  const computed = NESTED_TSX.replace('plan.features.map(', 'plan.features.slice(1).map(');
  assert.notEqual(computed, NESTED_TSX);
  const structure = await structureOf(shop({ [PRICING_FILE]: computed }));
  const row = entry(structure, `${P}/Stack/Card/ul/li`);
  assert.deepEqual([row.lists, row.item], [[`${P}/Stack/Card`, row.id], false]);
});

test('an element mapped over a list the editor cannot change is no list item', async () => {
  // The same section with its plans coming in as a prop.
  const typed = PRICING_TSX.replace(
    "const plans = [{ name: 'Free' }, { name: 'Pro' }];",
    'type Plan = { name: string };',
  );
  const mapped = typed.replace(
    'export function Pricing(_props: { state: string }) {',
    'export function Pricing({ plans }: { state: string; plans: Plan[] }) {',
  );
  assert.notEqual(mapped, typed);
  const structure = await structureOf(shop({ [PRICING_FILE]: mapped }));
  const card = entry(structure, `${P}/Stack/Card`);
  assert.equal(card.movable, 'in-expression');
  assert.equal(card.item, false);
});

test('a section root moves only as a section; a slot root never leaves its prop', async () => {
  const structure = await structureOf(shop());
  const section = entry(structure, P);
  assert.equal(section.root, 'section');
  assert.equal(section.movable, 'section-root');
  assert.equal(entry(structure, 'sections/Hero:h1').root, 'section');
  const slot = entry(structure, `${P}/Stack/Checkbox/Text`);
  assert.equal(slot.root, 'slot');
  assert.equal(slot.movable, 'slot-root');
  assert.equal(slot.text, 'Add a helmet');
  const stack = entry(structure, `${P}/Stack`);
  assert.equal(stack.root, null);
  assert.equal(stack.movable, null);
});

test('accepts and interactive follow the catalog and the HTML tag', async () => {
  const structure = await structureOf(shop());
  const facts = (id: string) => {
    const { component, accepts, interactive } = entry(structure, id);
    return { component, accepts, interactive };
  };
  assert.deepEqual(facts(`${P}/Stack`), { component: 'Stack', accepts: true, interactive: false });
  assert.deepEqual(facts(`${P}/Stack/Input`), {
    component: 'Input',
    accepts: false,
    interactive: true,
  });
  // Checkbox's `label` is a node, but it has no children.
  assert.deepEqual(facts(`${P}/Stack/Checkbox`), {
    component: 'Checkbox',
    accepts: false,
    interactive: true,
  });
  assert.deepEqual(facts(`${P}/Stack/Button`), {
    component: 'Button',
    accepts: true,
    interactive: true,
  });
  assert.deepEqual(facts(`${P}/Stack/p`), { component: null, accepts: true, interactive: false });
  assert.deepEqual(facts(P), { component: null, accepts: true, interactive: false });
});

test('text mixed with elements is marked, and props and text are read as written', async () => {
  const structure = await structureOf(shop());
  assert.equal(entry(structure, `${P}/Stack/p`).mixed, true);
  assert.equal(entry(structure, `${P}/Stack`).mixed, false);
  const plans = entry(structure, `${P}/Stack/Text`);
  assert.deepEqual(plans.props, ['tone']);
  assert.equal(plans.text, 'Plans');
  assert.equal(plans.tag, 'Text');
  assert.deepEqual(entry(structure, P).props, ['className']);
  assert.deepEqual(entry(structure, `${P}/Stack`).props, ['gap']);
  assert.deepEqual(entry(structure, `${P}/Stack/Card`).props, ['key']);
  // `{plan.name}` is an expression, not a text.
  assert.equal(entry(structure, `${P}/Stack/Card/Text`).text, null);
});

test('a long text is cut to 80 characters', async () => {
  const hero = HERO_TSX.replace('Hello', 'A'.repeat(120));
  const structure = await structureOf(shop({ [HERO_FILE]: hero }));
  assert.equal(entry(structure, 'sections/Hero:h1').text, 'A'.repeat(80));
});

test("the hash is over the element's whole source, and the subtree is that source", async () => {
  const drafts = shop();
  const structure = await structureOf(drafts);
  assert.equal(entry(structure, `${P}/Stack/Card`).hash, hashOf(CARD_SOURCE));
  const subtree = await readSubtree({ drafts, compiler }, 'shop', `${P}/Stack/Card`);
  assert.deepEqual(subtree, {
    id: `${P}/Stack/Card`,
    file: PRICING_FILE,
    hash: hashOf(CARD_SOURCE),
    source: CARD_SOURCE,
  });
  const button = await readSubtree({ drafts, compiler }, 'shop', `${P}/Stack/Button`);
  assert.equal(button.source, '<Button>Buy</Button>');
});

test('the subtree of an element that is not there is refused as not found', async () => {
  const drafts = shop();
  await assert.rejects(
    readSubtree({ drafts, compiler }, 'shop', `${P}/Grid`),
    isCode('EDIT_ELEMENT_NOT_FOUND'),
  );
  await assert.rejects(
    readSubtree({ drafts, compiler }, 'shop', 'sections/Gone:div'),
    isCode('EDIT_ELEMENT_NOT_FOUND'),
  );
});

test('each section names its root element, in layout order, never one of index.tsx', async () => {
  const structure = await structureOf(shop());
  assert.deepEqual(structure.sections, [
    { id: 'pricing', element: P, purpose: 'Show the plans.' },
    { id: 'hero', element: 'sections/Hero:h1', purpose: 'Say hello.' },
  ]);
  // The layers tree shows each section by that root, so the ids must be the same.
  for (const section of structure.sections) {
    assert.equal(entry(structure, section.element ?? '').root, 'section');
  }
  // No build is needed: the roots come from the section files themselves.
  const unbuilt = await structureOf(shop({ 'src/tsx/index.tsx': null }));
  assert.deepEqual(
    unbuilt.sections.map((section) => section.element),
    [P, 'sections/Hero:h1'],
  );
  // A section whose file does not compile has no root to show.
  const broken = await structureOf(shop({ [HERO_FILE]: HERO_TSX.replace('</h1>', '</h2>') }));
  assert.equal(broken.sections[1]?.element, null);
});

test('a file that does not compile lists no elements but keeps its ETag', async () => {
  // A closing tag that does not match: esbuild refuses the file.
  const broken = HERO_TSX.replace('</h1>', '</h2>');
  const structure = await structureOf(shop({ [HERO_FILE]: broken }));
  assert.equal(
    structure.elements.some((each) => each.file === HERO_FILE),
    false,
  );
  assert.equal(structure.etags[HERO_FILE], etagOf(broken));
  assert.equal(entry(structure, P).root, 'section');
});

test('inspect answers the same hash and move refusal as the structure', async () => {
  const drafts = shop();
  const structure = await structureOf(drafts);
  for (const id of [P, `${P}/Stack`, `${P}/Stack/Card`, `${P}/Stack/Checkbox/Text`]) {
    const inspected = await inspectElement(
      { drafts, kits: builtinKits(), compiler, etag: etagOf },
      'shop',
      id,
    );
    const listed = entry(structure, id);
    assert.equal(inspected.hash, listed.hash, id);
    assert.equal(inspected.movable, listed.movable, id);
  }
});
