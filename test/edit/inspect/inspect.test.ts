import assert from 'node:assert/strict';
import { after, test } from 'node:test';
import { createDraft, type DraftStore } from '../../../src/drafts/index.ts';
import { createEsbuildCompiler } from '../../../src/edit/adapters/esbuild-compiler.ts';
import { classNameOf, inspectElement, textSourceOf } from '../../../src/edit/app/inspect.ts';
import type { KitStore } from '../../../src/kit/index.ts';
import { KitvasError, PLUGIN_ROOT } from '../../../src/shared/index.ts';
import { etagOf } from '../../../src/studio/http/etag.ts';
import { NOW, tempDrafts } from '../../helpers/draft/drafts.ts';
import { builtinKits } from '../../helpers/kit/kits.ts';

const BASE = { id: 'kitvas-ui', version: '1.0.0', hash: 'b'.repeat(64) };

const PRICING_TSX = [
  "import { Button, Card, Stack, Text } from '@kit';",
  '',
  "const plans = [{ name: 'Free' }, { name: 'Pro' }];",
  '',
  'export function Pricing({ state }: { state: string }) {',
  "  const tone = state === 'error' ? 'danger' : 'neutral';",
  '  return (',
  '    <section className="pricing">',
  '      <Stack gap="12">',
  '        <Text tone="muted">Plans</Text>',
  '        {plans.map((plan) => (',
  '          <Card key={plan.name}>',
  '            <Text>{plan.name}</Text>',
  '          </Card>',
  '        ))}',
  '        <Button tone={tone}>Buy</Button>',
  '        <p>Cancel whenever you like.</p>',
  '        <Text className="button-2">Billed monthly.</Text>',
  '      </Stack>',
  '    </section>',
  '  );',
  '}',
  '',
].join('\n');

const PRICING_SCSS = [
  '.pricing {',
  '  padding: var(--kit-space-16);',
  '}',
  '',
  '.button {',
  '  color: var(--kit-color-ink);',
  '}',
  '',
].join('\n');

const PRICING = {
  'md/layout.md': '# Layout: Shop\n\n## pricing\nPurpose: Show the plans.\nComponents: Stack\n',
  'src/tsx/sections/Pricing.tsx': PRICING_TSX,
  'src/scss/sections/pricing.scss': PRICING_SCSS,
};

const HERO = {
  'md/layout.md': '# Layout: Shop\n\n## hero\nPurpose: Say hello.\nComponents: Text\n',
  'src/tsx/sections/Hero.tsx': [
    'export function Hero(_props: { state: string }) {',
    '  return <div className="p-4 md:p-6">Hello</div>;',
    '}',
    '',
  ].join('\n'),
  // A partial is the section's SCSS too: `@use 'sections/hero'` finds it.
  'src/scss/sections/_hero.scss': '.hero {\n  color: var(--kit-color-ink);\n}\n',
};

const compiler = createEsbuildCompiler([PLUGIN_ROOT]);
after(() => compiler.dispose());

/** The `shop` draft on the kitvas UI kit, with `files` written into its version 1. */
function draftWith(files: Record<string, string>): DraftStore {
  const { store } = tempDrafts();
  createDraft(store, { slug: 'shop', title: 'Shop', kit: BASE, now: NOW });
  for (const [path, text] of Object.entries(files)) store.writeText('shop', `v1/${path}`, text);
  return store;
}

const inspectIn = (drafts: DraftStore, id: string, kits: KitStore = builtinKits()) =>
  inspectElement({ drafts, kits, compiler, etag: etagOf }, 'shop', id);

type RawKit = { runtime: { styles: Record<string, unknown> } };

/** The built-in kits, with kitvas UI marked as a Tailwind kit. */
function tailwindKits(): KitStore {
  const kits = builtinKits();
  return {
    ...kits,
    read(id) {
      const files = kits.read(id);
      if (files === undefined) return undefined;
      const json = structuredClone(files.kitJson) as RawKit;
      json.runtime.styles.tailwind = { entry: 'src/app/globals.css' };
      return { ...files, kitJson: json };
    },
  };
}

const isCode = (code: string) => (error: unknown) =>
  error instanceof KitvasError && error.code === code;

test("a kitvas UI Stack's gap comes from its gap prop, the place an edit writes", async () => {
  const stack = await inspectIn(draftWith(PRICING), 'sections/Pricing:section/Stack');
  assert.equal(stack.version, 1);
  assert.equal(stack.tag, 'Stack');
  assert.equal(stack.file, 'src/tsx/sections/Pricing.tsx');
  assert.equal(stack.etag, etagOf(PRICING_TSX));
  assert.equal(stack.component?.name, 'Stack');
  assert.equal(stack.component?.takesClassName, true);
  assert.deepEqual(stack.props, [
    { name: 'gap', kind: 'literal', value: { kind: 'string', value: '12' } },
  ]);
  assert.deepEqual(stack.styles.gap, { kind: 'prop', prop: 'gap' });
  // Stack has no padding prop and no class: its padding is the kit's.
  assert.deepEqual(stack.styles.padding, { kind: 'kit' });
  assert.equal(stack.text, null);
  assert.equal(stack.textRefusal, 'no-text');
});

test('a prop written as an expression is read-only and keeps its source', async () => {
  const button = await inspectIn(draftWith(PRICING), 'sections/Pricing:section/Stack/Button');
  const tone = button.props.find((prop) => prop.name === 'tone');
  assert.equal(tone?.kind, 'expr');
  assert.match(tone?.kind === 'expr' ? tone.source : '', /tone/);
  assert.equal(button.spread, false);
  assert.equal(button.text, 'Buy');
  assert.equal(button.textRefusal, null);
});

test('an element of a mapped list is one site, and its computed text is no text', async () => {
  const drafts = draftWith(PRICING);
  const card = await inspectIn(drafts, 'sections/Pricing:section/Stack/Card');
  assert.equal(card.tag, 'Card');
  assert.equal(card.component?.name, 'Card');
  // Card's padding prop takes the names of the space tokens.
  assert.deepEqual(card.styles.padding, { kind: 'prop', prop: 'padding' });
  const name = await inspectIn(drafts, 'sections/Pricing:section/Stack/Card/Text');
  assert.equal(name.text, null);
  assert.equal(name.textRefusal, 'no-text');
});

test('a plain element is no kit component, and its plain text can be edited', async () => {
  const note = await inspectIn(draftWith(PRICING), 'sections/Pricing:section/Stack/p');
  assert.equal(note.tag, 'p');
  assert.equal(note.component, null);
  assert.deepEqual(note.props, []);
  assert.equal(note.text, 'Cancel whenever you like.');
  assert.equal(note.className, null);
  assert.deepEqual(note.styles.padding, { kind: 'kit' });
});

test('an element without a class gets a new class named after its section', async () => {
  const drafts = draftWith(PRICING);
  // The section's root has the class `pricing`: the block of every new class under it. The bare
  // `.button` of the SCSS and the `button-2` of the TSX are other names.
  const button = await inspectIn(drafts, 'sections/Pricing:section/Stack/Button');
  assert.deepEqual(button.styleClass, { className: 'pricing__button', exists: false });
  assert.equal(button.scss?.file, 'src/scss/sections/pricing.scss');
  assert.equal(button.scss?.rule, false);
  assert.deepEqual(button.scss?.declarations, []);
  const stack = await inspectIn(drafts, 'sections/Pricing:section/Stack');
  assert.deepEqual(stack.styleClass, { className: 'pricing__stack', exists: false });
  // A name either file uses already takes the next number.
  const used = PRICING_TSX.replace('className="button-2"', 'className="pricing__button"');
  assert.notEqual(used, PRICING_TSX);
  const taken = draftWith({ ...PRICING, 'src/tsx/sections/Pricing.tsx': used });
  const second = await inspectIn(taken, 'sections/Pricing:section/Stack/Button');
  assert.deepEqual(second.styleClass, { className: 'pricing__button-2', exists: false });
});

test('a class with a rule is the style class, and its declaration is the source', async () => {
  const section = await inspectIn(draftWith(PRICING), 'sections/Pricing:section');
  assert.deepEqual(section.className, { kind: 'string', value: 'pricing' });
  assert.deepEqual(section.styleClass, { className: 'pricing', exists: true });
  assert.deepEqual(section.scss, {
    file: 'src/scss/sections/pricing.scss',
    etag: etagOf(PRICING_SCSS),
    rule: true,
    declarations: [{ property: 'padding', value: 'var(--kit-space-16)', offKit: false }],
    nested: [],
  });
  assert.deepEqual(section.styles.padding, {
    kind: 'scss',
    className: 'pricing',
    value: 'var(--kit-space-16)',
    offKit: false,
  });
});

test('a Tailwind kit gives the utility class as the source of a style it sets', async () => {
  const hero = await inspectIn(draftWith(HERO), 'sections/Hero:div', tailwindKits());
  assert.equal(hero.styles.padding.kind, 'utility');
  assert.equal(hero.text, 'Hello');
  assert.equal(hero.scss?.file, 'src/scss/sections/_hero.scss');
  // The same element on an SCSS kit: no utility, and no rule for `p-4`.
  const plain = await inspectIn(draftWith(HERO), 'sections/Hero:div');
  assert.deepEqual(plain.styles.padding, { kind: 'kit' });
});

test("the answer lists the kit's breakpoints and every value of a width or a state", async () => {
  const scss = [
    '.pricing {',
    '  padding: var(--kit-space-16);',
    '',
    '  @media (min-width: 768px) {',
    '    padding: 40px; /* off-kit */',
    '',
    '    &:hover {',
    '      color: var(--kit-color-ink);',
    '    }',
    '  }',
    '',
    '  &:focus-visible {',
    '    outline-width: var(--kit-space-4);',
    '  }',
    '}',
    '',
  ].join('\n');
  const drafts = draftWith({ ...PRICING, 'src/scss/sections/pricing.scss': scss });
  const section = await inspectIn(drafts, 'sections/Pricing:section');
  assert.deepEqual(section.breakpoints, [768, 1280]);
  // What the width's `padding` holds (ADR 0070): its two pairs, then its four sides.
  const held = ['block', 'inline', 'top', 'right', 'bottom', 'left'].map((part) => ({
    context: { width: 768, state: null, option: null },
    property: `padding-${part}`,
    value: '40px',
    offKit: true,
    utility: null,
    via: 'padding',
  }));
  assert.deepEqual(section.overrides, [
    {
      context: { width: 768, state: null, option: null },
      property: 'padding',
      value: '40px',
      offKit: true,
      utility: null,
    },
    ...held,
    {
      context: { width: 768, state: 'hover', option: null },
      property: 'color',
      value: 'var(--kit-color-ink)',
      offKit: false,
      utility: null,
    },
    {
      context: { width: null, state: 'focus-visible', option: null },
      property: 'outline-width',
      value: 'var(--kit-space-4)',
      offKit: false,
      utility: null,
    },
  ]);
  // The base is still the rule's own declaration, and no block is `nested`.
  assert.deepEqual(section.styles.padding, {
    kind: 'scss',
    className: 'pricing',
    value: 'var(--kit-space-16)',
    offKit: false,
  });
  assert.deepEqual(section.scss?.nested, []);
  // An element without a rule has none.
  const stack = await inspectIn(drafts, 'sections/Pricing:section/Stack');
  assert.deepEqual(stack.overrides, []);
});

test("the values of an option's block carry the option, with its width and state", async () => {
  const scss = [
    '.pricing {',
    '  color: var(--kit-color-ink);',
    '',
    '  [data-opt-columns="2"] & {',
    '    color: var(--kit-color-muted);',
    '',
    '    @media (min-width: 768px) {',
    '      &:hover {',
    '        outline-width: var(--kit-space-4);',
    '      }',
    '    }',
    '  }',
    '}',
    '',
  ].join('\n');
  const drafts = draftWith({ ...PRICING, 'src/scss/sections/pricing.scss': scss });
  const section = await inspectIn(drafts, 'sections/Pricing:section');
  const option = { id: 'columns', value: '2' };
  assert.deepEqual(section.overrides, [
    {
      context: { width: null, state: null, option },
      property: 'color',
      value: 'var(--kit-color-muted)',
      offKit: false,
      utility: null,
    },
    {
      context: { width: 768, state: 'hover', option },
      property: 'outline-width',
      value: 'var(--kit-space-4)',
      offKit: false,
      utility: null,
    },
  ]);
  // The base is the rule's own value: an option's block is no base and nothing `nested`.
  assert.deepEqual(section.styles.color, {
    kind: 'scss',
    className: 'pricing',
    value: 'var(--kit-color-ink)',
    offKit: false,
  });
  assert.deepEqual(section.scss?.nested, []);
});

test('a Tailwind draft lists its prefixed utilities as the overrides', async () => {
  const hero = await inspectIn(draftWith(HERO), 'sections/Hero:div', tailwindKits());
  assert.deepEqual(hero.styles.padding, { kind: 'utility', className: 'p-4' });
  const padding = hero.overrides.filter((each) => each.property === 'padding');
  assert.deepEqual(padding, [
    {
      context: { width: 768, state: null, option: null },
      property: 'padding',
      // `6` names the kit's `space.6`, so the value is that token.
      value: 'var(--kit-space-6)',
      offKit: false,
      utility: 'md:p-6',
    },
  ]);
  // The same classes on an SCSS kit are no utilities at all.
  assert.deepEqual((await inspectIn(draftWith(HERO), 'sections/Hero:div')).overrides, []);
});

test('an element that is not in the current text is not found', async () => {
  const drafts = draftWith(PRICING);
  await assert.rejects(
    inspectIn(drafts, 'sections/Pricing:section/Grid'),
    isCode('EDIT_ELEMENT_NOT_FOUND'),
  );
  await assert.rejects(inspectIn(drafts, 'sections/Gone:div'), isCode('EDIT_ELEMENT_NOT_FOUND'));
});

test('the answer gives the line of the tag, and every style property of the panel', async () => {
  const drafts = draftWith(PRICING);
  const stack = await inspectIn(drafts, 'sections/Pricing:section/Stack');
  assert.equal(stack.line, 9);
  assert.equal(Object.keys(stack.styles).length, 40);
  // The kit's Stack sets the flex keywords by its own props (plan 15).
  assert.deepEqual(stack.styles['flex-direction'], { kind: 'prop', prop: 'direction' });
  assert.deepEqual(stack.styles['align-items'], { kind: 'prop', prop: 'align' });
  assert.deepEqual(stack.styles['justify-content'], { kind: 'prop', prop: 'justify' });
  assert.deepEqual(stack.styles['flex-wrap'], { kind: 'prop', prop: 'wrap' });
  assert.deepEqual(stack.styles['padding-top'], { kind: 'kit' });
  const section = await inspectIn(drafts, 'sections/Pricing:section');
  assert.equal(section.line, 8);
});

test('the answer lists the image files of the version, sorted, and only plain names', async () => {
  const drafts = draftWith(PRICING);
  const id = 'sections/Pricing:section';
  // Without a way to list the folder, there are none to pick.
  assert.deepEqual((await inspectIn(drafts, id)).images, []);
  const asked: [string, number][] = [];
  const answer = await inspectElement(
    {
      drafts,
      kits: builtinKits(),
      compiler,
      etag: etagOf,
      images: (slug, version) => {
        asked.push([slug, version]);
        return ['b.png', 'a.webp', 'bad name.png', 'notes.txt', '.hidden.png', 'logo.SVG'];
      },
    },
    'shop',
    id,
  );
  assert.deepEqual(answer.images, ['a.webp', 'b.png', 'logo.SVG']);
  assert.deepEqual(asked, [['shop', 1]]);
});

/** Texts in a condition and in a nested list of a `.map`, and a card's `className` in code. */
const PLANS = {
  'md/layout.md': '# Layout: Shop\n\n## plans\nPurpose: Show the plans.\nComponents: Card\n',
  'src/tsx/sections/Plans.tsx': [
    "import { Button, Card, Stack, Text } from '@kit';",
    '',
    'const plans = [',
    "  { name: 'Starter', free: true, action: 'Start for free', features: ['Up to 3 projects'] },",
    "  { name: 'Pro', featured: true, action: 'Try Pro free', features: ['Unlimited', 'SSO'] },",
    '];',
    '',
    'export function Plans({ state }: { state: string }) {',
    "  const loading = state === 'loading';",
    '  return (',
    '    <section className="plans">',
    '      {plans.map((plan) => (',
    "        <Card key={plan.name} className={plan.featured ? 'plans__card plans__card--featured' : 'plans__card'}>",
    '          <Stack gap="16">',
    '            {loading ? (',
    '              <Text>Loading prices…</Text>',
    '            ) : (',
    '              <>',
    "                <Text>{plan.free ? 'free forever' : 'billed monthly'}</Text>",
    '                <Button>{plan.action}</Button>',
    '                <ul>',
    '                  {plan.features.map((feature) => (',
    '                    <li key={feature}>',
    '                      <Text as="span">{feature}</Text>',
    '                    </li>',
    '                  ))}',
    '                </ul>',
    '              </>',
    '            )}',
    '          </Stack>',
    '        </Card>',
    '      ))}',
    '    </section>',
    '  );',
    '}',
    '',
  ].join('\n'),
  'src/scss/sections/plans.scss': '.plans__card {\n  padding: var(--kit-space-16);\n}\n',
};

const CARD = 'sections/Plans:section/Card';
const STACK = `${CARD}/Stack`;

test('a text in code names the list roots around it, outer first, by their ids', async () => {
  const drafts = draftWith(PLANS);
  const button = await inspectIn(drafts, `${STACK}/Button`);
  assert.equal(button.text, null);
  assert.deepEqual(button.expression, { roots: [CARD] });
  const feature = await inspectIn(drafts, `${STACK}/ul/li/Text`);
  assert.deepEqual(feature.expression, { roots: [CARD, `${STACK}/ul/li`] });
  // Plain text, and elements as children, are no text in code.
  assert.equal((await inspectIn(drafts, `${STACK}/Text`)).expression, null);
  assert.equal((await inspectIn(drafts, STACK)).expression, null);
});

test('textSourceOf says whether one literal of the file renders the text of a copy', async () => {
  const deps = { drafts: draftWith(PLANS), compiler };
  const feature = `${STACK}/ul/li/Text`;
  assert.equal(await textSourceOf(deps, 'shop', `${STACK}/Button`, 'Try Pro free', [1]), null);
  assert.equal(await textSourceOf(deps, 'shop', feature, 'SSO', [1, 1]), null);
  assert.equal(await textSourceOf(deps, 'shop', feature, 'SSO', [0, 0]), 'computed');
  assert.equal(await textSourceOf(deps, 'shop', feature, 'SSO', [1, 4]), 'list-item-gone');
  assert.equal(await textSourceOf(deps, 'shop', `${STACK}/Text.2`, 'free forever', [0]), null);
  assert.equal(await textSourceOf(deps, 'shop', STACK, 'Pro', [1]), 'no-text');
  assert.equal(await textSourceOf(deps, 'shop', `${STACK}/Gone`, 'Pro', [1]), 'not-found');
});

test('a className in code whose values share a first class has it as its style class', async () => {
  const card = await inspectIn(draftWith(PLANS), CARD);
  assert.equal(card.className?.kind, 'expr');
  assert.deepEqual(card.styleClass, { className: 'plans__card', exists: true });
  assert.equal(card.scss?.rule, true);
});

test('a new class name is the tag in kebab case', () => {
  assert.equal(classNameOf('Card.Header'), 'card-header');
  assert.equal(classNameOf('PriceTag'), 'price-tag');
  assert.equal(classNameOf('h2'), 'h2');
});

/** Spelt apart, so no plain string here reads like a template's placeholder. */
const DOLLAR = '$';
const TICK = '`';

/** The plans after "This item" on the Pro card (ADR 0072): the modifier in the TSX, its rule. */
const ITEM_PLANS = {
  'md/layout.md': '# Layout: Shop\n\n## plans\nPurpose: Show the plans.\nComponents: Card\n',
  'src/tsx/sections/Plans.tsx': [
    "import { Card, Text } from '@kit';",
    '',
    "const plans = [{ id: 'starter', name: 'Starter' }, { id: 'pro', name: 'Pro', featured: true }];",
    '',
    'export function Plans() {',
    '  return (',
    '    <section className="plans">',
    '      {plans.map((plan) => (',
    `        <Card key={plan.id} className={${TICK}${DOLLAR}{plan.featured ? 'plans__card plans__card--featured' : 'plans__card'} plans__card--${DOLLAR}{plan.id}${TICK}}>`,
    '          <Text>{plan.name}</Text>',
    '        </Card>',
    '      ))}',
    '    </section>',
    '  );',
    '}',
    '',
  ].join('\n'),
  'src/scss/sections/plans.scss': [
    '.plans {',
    '  &__card {',
    '    background: var(--kit-color-panel);',
    '    border: 1px solid var(--kit-color-line);',
    '  }',
    '',
    '  &__card--pro {',
    '    background-color: var(--kit-color-ink-soft);',
    '  }',
    '}',
    '',
  ].join('\n'),
};

const ITEM_CARD = 'sections/Plans:section/Card';

const inspectItem = (
  drafts: DraftStore,
  id: string,
  path: number[],
  kits: KitStore = builtinKits(),
) => inspectElement({ drafts, kits, compiler, etag: etagOf }, 'shop', id, path, 'item');

test("scope item reads the item's own rule", async () => {
  const drafts = draftWith(ITEM_PLANS);
  const card = await inspectItem(drafts, ITEM_CARD, [1]);
  assert.deepEqual(card.itemScope, { className: 'plans__card--pro', inTsx: true, path: [1] });
  assert.deepEqual(card.styleClass, { className: 'plans__card--pro', exists: true });
  assert.equal(card.scss?.rule, true);
  assert.deepEqual(card.scss?.declarations, [
    { property: 'background-color', value: 'var(--kit-color-ink-soft)', offKit: false },
  ]);
  assert.deepEqual(card.styles['background-color'], {
    kind: 'scss',
    className: 'plans__card--pro',
    value: 'var(--kit-color-ink-soft)',
    offKit: false,
  });
  // Set only on the shared rule: its class, and no part of its shorthand, since a write in this
  // scope goes into the item's rule.
  const border = card.styles['border-color'];
  assert.equal(border.kind === 'scss' ? border.className : null, 'plans__card');
  assert.equal('via' in border, false);
  // Without the scope the card reads the shared rule, through the wrapped template too.
  const all = await inspectIn(drafts, ITEM_CARD);
  assert.equal(all.itemScope, null);
  assert.deepEqual(all.styleClass, { className: 'plans__card', exists: true });
  const shared = all.styles['border-color'];
  assert.equal(shared.kind === 'scss' ? shared.via : null, 'border');
});

test('scope item on an element in no list says why it has no item', async () => {
  const drafts = draftWith(ITEM_PLANS);
  const section = await inspectItem(drafts, 'sections/Plans:section', []);
  assert.deepEqual(section.itemScope, { refused: 'not-list-item' });
  // The rest of the answer is the element's own, as without the scope.
  assert.deepEqual(section.styleClass, { className: 'plans', exists: true });
  const gone = await inspectItem(drafts, ITEM_CARD, [5]);
  assert.deepEqual(gone.itemScope, { refused: 'list-item-gone' });
  // `key={plan.name}` gives `Pro`: kitvas writes no class name in capitals.
  const named = await inspectItem(draftWith(PLANS), CARD, [1]);
  assert.deepEqual(named.itemScope, { refused: 'item-key' });
  assert.deepEqual(named.styleClass, { className: 'plans__card', exists: true });
});

test('a Tailwind draft refuses the scope', async () => {
  const card = await inspectItem(draftWith(ITEM_PLANS), ITEM_CARD, [1], tailwindKits());
  assert.deepEqual(card.itemScope, { refused: 'utility' });
});
