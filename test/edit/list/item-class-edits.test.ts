// "This item" through a whole request (ADR 0072): the modifier goes into the card's `className`
// and its rule nests under the section's block; the answer's inverse gives both files back byte
// for byte from every form of `className`; a class for another copy is a conflict; a second write
// of the same item leaves the TSX alone.

import assert from 'node:assert/strict';
import { after, test } from 'node:test';
import { createDraft, type DraftStore } from '../../../src/drafts/index.ts';
import { createEsbuildCompiler } from '../../../src/edit/adapters/esbuild-compiler.ts';
import {
  type ApplyEditsDeps,
  applyEdits,
  type EditOp,
  type EditResult,
  sectionScss,
} from '../../../src/edit/index.ts';
import { PLUGIN_ROOT } from '../../../src/shared/index.ts';
import { etagOf } from '../../../src/studio/http/etag.ts';
import { NOW, tempDrafts, writeVersionFiles } from '../../helpers/draft/drafts.ts';
import { builtinKits } from '../../helpers/kit/kits.ts';

const compiler = createEsbuildCompiler([PLUGIN_ROOT]);
after(() => compiler.dispose());

const BASE = { id: 'kitvas-ui', version: '1.0.0', hash: 'b'.repeat(64) };
const LATER = new Date('2026-11-25T09:00:00.000Z');

const LAYOUT = 'md/layout.md';
const PLANS = 'src/tsx/sections/Plans.tsx';
const PLANS_SCSS = 'src/scss/sections/plans.scss';
const FILES = [LAYOUT, PLANS, PLANS_SCSS];
const CARD = 'sections/Plans:section/Card';

/** Spelt apart, so no plain string here reads like a template's placeholder. */
const DOLLAR = '$';
const TICK = '`';
const slot = (code: string): string => `${DOLLAR}{${code}}`;
const MODIFIER = `plans__card--${slot('plan.id')}`;
const FEATURED = "plan.featured ? 'plans__card plans__card--featured' : 'plans__card'";

const LAYOUT_MD = '# Layout: Plans\n\n## plans\nPurpose: Show the plans.\nComponents: Card, Text\n';
const SCSS = [
  '.plans {',
  '  &__card {',
  '    background: var(--kit-color-panel);',
  '  }',
  '}',
  '',
].join('\n');

/** The plans section of the owner's draft, its cards' `className` written as `className`. */
function plans(className: string): string {
  return [
    "import { Card, Text } from '@kit';",
    '',
    'const plans = [',
    "  { id: 'starter', name: 'Starter' },",
    "  { id: 'pro', name: 'Pro', featured: true },",
    "  { id: 'business', name: 'Business' },",
    '];',
    '',
    'export function Plans() {',
    '  return (',
    '    <section className="plans">',
    '      {plans.map((plan) => (',
    `        <Card key={plan.id} as="article" padding="lg" className=${className}>`,
    '          <Text className="plans__price">{plan.name}</Text>',
    '        </Card>',
    '      ))}',
    '    </section>',
    '  );',
    '}',
    '',
  ].join('\n');
}

/** Each form a `className` is written in, and what "This item" makes of it. */
const FORMS: [string, string][] = [
  ['"plans__card"', `{${TICK}plans__card ${MODIFIER}${TICK}}`],
  ["'plans__card'", `{${TICK}plans__card ${MODIFIER}${TICK}}`],
  [
    `{${TICK}plans__card ${slot('plan.tone')}${TICK}}`,
    `{${TICK}plans__card ${slot('plan.tone')} ${MODIFIER}${TICK}}`,
  ],
  [`{${FEATURED}}`, `{${TICK}${slot(FEATURED)} ${MODIFIER}${TICK}}`],
];

function setup(className: string) {
  const { store } = tempDrafts();
  createDraft(store, { slug: 'plans', title: 'Plans', kit: BASE, now: NOW });
  writeVersionFiles(store, 'plans', 1, {
    [LAYOUT]: LAYOUT_MD,
    [PLANS]: plans(className),
    [PLANS_SCSS]: SCSS,
  });
  const deps: ApplyEditsDeps = {
    drafts: store,
    compiler,
    kits: builtinKits(),
    now: () => LATER,
    etag: etagOf,
    sectionScss: (slug, version, file) => sectionScss(store, slug, version, file),
  };
  return { store, deps };
}

const read = (store: DraftStore, version: number, file: string): string =>
  store.readText('plans', `v${version}/${file}`) ?? '';

const etagsOf = (store: DraftStore, version: number): Record<string, string> =>
  Object.fromEntries(
    FILES.flatMap((file): [string, string][] => {
      const text = store.readText('plans', `v${version}/${file}`);
      return text === undefined ? [] : [[file, etagOf(text)]];
    }),
  );

const request = (store: DraftStore, version: number, ops: EditOp[]) => ({
  slug: 'plans',
  version,
  ops,
  etags: etagsOf(store, version),
});

function applied(result: EditResult): Extract<EditResult, { outcome: 'applied' }> {
  assert.equal(result.outcome, 'applied', JSON.stringify(result));
  if (result.outcome !== 'applied') throw new Error('not applied');
  return result;
}

const itemClass = (className = 'plans__card--pro'): EditOp => ({
  op: 'addItemClass',
  id: CARD,
  path: [1],
  className,
});

const background: EditOp = {
  op: 'setStyle',
  id: CARD,
  className: 'plans__card--pro',
  property: 'background-color',
  value: { token: '--kit-color-ink-soft' },
  before: null,
  newRule: true,
};

test('this item writes the class into the TSX and a nested rule under the block', async () => {
  const { store, deps } = setup(`{${FEATURED}}`);
  applied(await applyEdits(deps, request(store, 1, [itemClass(), background])));
  assert.equal(read(store, 2, PLANS), plans(`{${TICK}${slot(FEATURED)} ${MODIFIER}${TICK}}`));
  // Inside `.plans`, after the shared `&__card`, so it wins over it.
  assert.match(
    read(store, 2, PLANS_SCSS),
    /^\.plans \{\n {2}&__card \{\n {4}background: var\(--kit-color-panel\);\n {2}\}\n\n? {2}&__card--pro \{\n {4}background-color: var\(--kit-color-ink-soft\);\n {2}\}\n\}\n$/,
  );
});

test('undo puts both files back byte for byte', async () => {
  for (const [form, written] of FORMS) {
    const { store, deps } = setup(form);
    const done = applied(await applyEdits(deps, request(store, 1, [itemClass(), background])));
    assert.equal(read(store, 2, PLANS), plans(written), form);
    assert.ok(
      done.inverse.every((op) => op.op === 'patch'),
      form,
    );
    applied(await applyEdits(deps, request(store, 2, done.inverse)));
    assert.equal(read(store, 2, PLANS), plans(form), form);
    assert.equal(read(store, 2, PLANS_SCSS), SCSS, form);
  }
});

test('an op whose class does not match the copy is a conflict', async () => {
  const { store, deps } = setup(`{${FEATURED}}`);
  const result = await applyEdits(deps, request(store, 1, [itemClass('plans__card--starter')]));
  assert.equal(result.outcome, 'conflict', JSON.stringify(result));
  if (result.outcome !== 'conflict') return;
  assert.equal(result.reason, 'changed');
  assert.equal(result.file, PLANS);
  assert.equal(store.readText('plans', `v2/${PLANS}`), undefined);
});

test('a second item write leaves the TSX alone', async () => {
  const { store, deps } = setup(`{${FEATURED}}`);
  applied(await applyEdits(deps, request(store, 1, [itemClass(), background])));
  const tsx = read(store, 2, PLANS);
  const border: EditOp = {
    op: 'setStyle',
    id: CARD,
    className: 'plans__card--pro',
    property: 'border-color',
    value: { token: '--kit-color-line' },
    before: null,
    newRule: false,
  };
  const done = applied(await applyEdits(deps, request(store, 2, [itemClass(), border])));
  assert.equal(read(store, 2, PLANS), tsx);
  assert.match(
    read(store, 2, PLANS_SCSS),
    /&__card--pro \{\n {4}background-color: var\(--kit-color-ink-soft\);\n {4}border-color: var\(--kit-color-line\);\n {2}\}/,
  );
  // Only the rule changed, so only the rule is given back.
  assert.deepEqual(
    done.inverse.map((op) => ('file' in op ? op.file : null)),
    [PLANS_SCSS],
  );
  // The gesture alone, with the class in the TSX already, changes no file.
  const again = applied(await applyEdits(deps, request(store, 2, [itemClass()])));
  assert.deepEqual(again.etags, {});
  assert.equal(read(store, 2, PLANS), tsx);
});
