// Item ops by path through a whole request (ADR 0065): a row of one plan's features is removed,
// several rows in one request, a row moved into another plan's features with one inverse for both
// arrays; a part of an item is an element of the template, changed by the element ops.

import assert from 'node:assert/strict';
import { after, test } from 'node:test';
import { createDraft, type DraftStore } from '../../src/drafts/index.ts';
import { createEsbuildCompiler } from '../../src/edit/adapters/esbuild-compiler.ts';
import {
  type ApplyEditsDeps,
  applyEdits,
  type EditOp,
  type EditResult,
  sectionScss,
} from '../../src/edit/index.ts';
import { PLUGIN_ROOT } from '../../src/shared/index.ts';
import { etagOf } from '../../src/studio/http/etag.ts';
import { NOW, tempDrafts, writeVersionFiles } from '../helpers/drafts.ts';
import { builtinKits } from '../helpers/kits.ts';

const compiler = createEsbuildCompiler([PLUGIN_ROOT]);
after(() => compiler.dispose());

const BASE = { id: 'base', version: '1.0.0', hash: 'b'.repeat(64) };
const LATER = new Date('2026-11-24T09:00:00.000Z');

const LAYOUT = 'md/layout.md';
const PRICING = 'src/tsx/sections/Pricing.tsx';
const PRICING_SCSS = 'src/scss/sections/pricing.scss';
const FILES = [LAYOUT, PRICING, PRICING_SCSS];

const LAYOUT_MD = [
  '# Layout: Plans',
  '',
  '## pricing',
  'Purpose: Show the plans.',
  'Components: Stack, Card, Heading, Text',
  '',
].join('\n');

const quoted = (texts: string[]): string => texts.map((text) => `'${text}'`).join(', ');

/** The pricing section with these features in Starter, Pro and Business. */
function pricing(starter: string[], pro: string[], business: string[]): string {
  return [
    "import { Card, Heading, Stack, Text } from '@kit';",
    '',
    'const PLANS = [',
    `  { name: 'Starter', features: [${quoted(starter)}] },`,
    `  { name: 'Pro', features: [${quoted(pro)}] },`,
    `  { name: 'Business', features: [${quoted(business)}] },`,
    '];',
    '',
    'export function Pricing() {',
    '  return (',
    '    <section className="pricing">',
    '      <Stack gap="md">',
    '        <Text>Pick a plan</Text>',
    '        {PLANS.map((plan) => (',
    '          <Card key={plan.name}>',
    '            <Heading>{plan.name}</Heading>',
    '            <ul>',
    '              {plan.features.map((feature) => (',
    '                <li key={feature}>{feature}</li>',
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
}

const STARTER = ['Up to 3 projects', 'Kanban and list views'];
const PRO = ['Everything in Starter', 'Timeline', 'Guests'];
const BUSINESS = ['Everything in Pro'];
const START = pricing(STARTER, PRO, BUSINESS);

const STACK = 'sections/Pricing:section/Stack';
const NOTE = `${STACK}/Text`;
const CARD = `${STACK}/Card`;
const HEADING = `${CARD}/Heading`;
const LIST = `${CARD}/ul`;
const ROW = `${LIST}/li`;

function setup() {
  const { store } = tempDrafts();
  createDraft(store, { slug: 'plans', title: 'Plans', kit: BASE, now: NOW });
  writeVersionFiles(store, 'plans', 1, {
    [LAYOUT]: LAYOUT_MD,
    [PRICING]: START,
    [PRICING_SCSS]: '.pricing {\n  padding: var(--kit-space-lg);\n}\n',
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

const read = (store: DraftStore, version: number): string =>
  store.readText('plans', `v${version}/${PRICING}`) ?? '';

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

/** Applies `ops` on v1 as one request, checks the text, then undoes them with the one inverse. */
async function roundTrip(ops: EditOp[], expected: string): Promise<void> {
  const { store, deps } = setup();
  const done = applied(await applyEdits(deps, request(store, 1, ops)));
  assert.equal(read(store, 2), expected);
  assert.ok(done.inverse.length > 0);
  assert.ok(done.inverse.every((one) => one.op === 'patch' && one.file === PRICING));
  applied(await applyEdits(deps, request(store, 2, done.inverse)));
  assert.equal(read(store, 2), START);
}

async function refusedWith(op: EditOp): Promise<string> {
  const { store, deps } = setup();
  const result = await applyEdits(deps, request(store, 1, [op]));
  assert.equal(result.outcome, 'refused', JSON.stringify(result));
  assert.equal(store.readText('plans', `v2/${PRICING}`), undefined);
  return result.outcome === 'refused' ? (result.refusals[0]?.reason ?? '') : '';
}

const remove = (path: number[]): EditOp => ({
  op: 'removeItem',
  id: ROW,
  item: path[path.length - 1] ?? 0,
  path,
});

test('a row of one plan is removed from that plan only, and undo puts it back', async () => {
  const left = ['Everything in Starter', 'Guests'];
  await roundTrip([remove([1, 1])], pricing(STARTER, left, BUSINESS));
  await roundTrip([remove([2, 0])], pricing(STARTER, PRO, []));
});

test('several rows leave in one request, last place first, with one undo for all', async () => {
  await roundTrip([remove([1, 2]), remove([1, 1]), remove([1, 0])], pricing(STARTER, [], BUSINESS));
  await roundTrip(
    [remove([2, 0]), remove([1, 2]), remove([0, 1]), remove([0, 0])],
    pricing([], ['Everything in Starter', 'Timeline'], []),
  );
});

test('a row dragged in its own plan changes that plan only', async () => {
  const op: EditOp = { op: 'moveItem', id: ROW, item: 0, to: 1, path: [0, 0], toPath: [0, 1] };
  await roundTrip([op], pricing(['Kanban and list views', 'Up to 3 projects'], PRO, BUSINESS));
});

test('a row moved into another plan leaves its array and stands in the other; one undo takes both back', async () => {
  const op: EditOp = { op: 'moveItem', id: ROW, item: 0, to: 1, path: [2, 0], toPath: [0, 1] };
  await roundTrip(
    [op],
    pricing(['Up to 3 projects', 'Everything in Pro', 'Kanban and list views'], PRO, []),
  );
  const back: EditOp = { op: 'moveItem', id: ROW, item: 1, to: 1, path: [0, 1], toPath: [2, 1] };
  await roundTrip(
    [back],
    pricing(['Up to 3 projects'], PRO, ['Everything in Pro', 'Kanban and list views']),
  );
});

test('an item op by path is refused with its reason; nothing is written', async () => {
  assert.equal(await refusedWith(remove([1, 3])), 'list-item-gone');
  assert.equal(await refusedWith(remove([1])), 'not-found');
  assert.equal(await refusedWith({ op: 'removeItem', id: ROW, item: 0 }), 'list-not-literal');
  // A part of the plan's card is no item of the plans.
  assert.equal(
    await refusedWith({ op: 'removeItem', id: HEADING, item: 0, path: [0] }),
    'not-list-item',
  );
  assert.equal(
    await refusedWith({ op: 'duplicateItem', id: LIST, item: 0, path: [0] }),
    'not-list-item',
  );
  const across: EditOp = { op: 'moveItem', id: ROW, item: 0, to: 4, path: [0, 0], toPath: [1, 4] };
  assert.equal(await refusedWith(across), 'list-item-gone');
});

test('a part of an item is deleted from the template, and undo puts it back', async () => {
  const { store, deps } = setup();
  const op: EditOp = { op: 'removeElement', id: HEADING };
  const done = applied(await applyEdits(deps, request(store, 1, [op])));
  const text = read(store, 2);
  assert.equal(text.includes('<Heading'), false);
  // The list and its data are as they were.
  assert.ok(text.includes('{plan.features.map((feature) => ('));
  assert.ok(text.includes(`features: [${quoted(PRO)}]`));
  applied(await applyEdits(deps, request(store, 2, done.inverse)));
  assert.equal(read(store, 2), START);
});

test('a part of an item moves inside its item, and never out of the callback it reads', async () => {
  const { store, deps } = setup();
  const inside: EditOp = { op: 'moveElement', id: HEADING, anchor: LIST, place: 'after' };
  const done = applied(await applyEdits(deps, request(store, 1, [inside])));
  const text = read(store, 2);
  assert.ok(text.indexOf('<Heading') > text.indexOf('</ul>'));
  assert.ok(text.indexOf('<Heading') < text.indexOf('</Card>'));
  applied(await applyEdits(deps, request(store, 2, done.inverse)));
  assert.equal(read(store, 2), START);
  // `{plan.name}` reads the callback's parameter: outside the callback there is no `plan`.
  const out: EditOp = { op: 'moveElement', id: HEADING, anchor: NOTE, place: 'after' };
  assert.equal(await refusedWith(out), 'scope');
});

test('the item itself never moves or leaves as an element', async () => {
  assert.equal(await refusedWith({ op: 'removeElement', id: ROW }), 'in-expression');
  assert.equal(await refusedWith({ op: 'removeElement', id: CARD }), 'in-expression');
});
