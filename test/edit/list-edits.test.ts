// Data list edits through a whole request (plan 16, task D): the item ops on a `const PLANS`
// array write only the touched items, every one is undone byte for byte by the inverse the
// server makes, and what cannot be written is refused with nothing written.

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

const FREE = "  { name: 'Free', price: '0 a month' },";
const PRO = "  { name: 'Pro', price: '20 a month' },";
const TEAM = "  { name: 'Team', price: '50 a month' },";

function pricing(items: string[], params = ''): string {
  return [
    "import { Card, Heading, Stack, Text } from '@kit';",
    '',
    'const PLANS = [',
    ...items,
    '];',
    '',
    `export function Pricing(${params}) {`,
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
  ].join('\n');
}

const START = pricing([FREE, PRO, TEAM]);
const CARD = 'sections/Pricing:section/Stack/Card';
const HEADING = `${CARD}/Heading`;
const TEXT = `${CARD}/Text`;

function setup(tsx = START) {
  const { store } = tempDrafts();
  createDraft(store, { slug: 'plans', title: 'Plans', kit: BASE, now: NOW });
  writeVersionFiles(store, 'plans', 1, {
    [LAYOUT]: LAYOUT_MD,
    [PRICING]: tsx,
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

/** Applies `op` on v1, checks the new text, then undoes it and checks the text is back. */
async function roundTrip(op: EditOp, expected: string): Promise<void> {
  const { store, deps } = setup();
  const done = applied(await applyEdits(deps, request(store, 1, [op])));
  assert.equal(read(store, 2), expected);
  // The server makes the inverse from the texts: hunks, never list ops.
  assert.ok(done.inverse.length > 0);
  assert.ok(done.inverse.every((one) => one.op === 'patch' && one.file === PRICING));
  assert.deepEqual(done.renames, {});
  applied(await applyEdits(deps, request(store, 2, done.inverse)));
  assert.equal(read(store, 2), START);
}

test('a move writes only the items between, and its inverse gives the file back', async () => {
  await roundTrip({ op: 'moveItem', id: CARD, item: 0, to: 2 }, pricing([PRO, TEAM, FREE]));
  await roundTrip({ op: 'moveItem', id: HEADING, item: 2, to: 1 }, pricing([FREE, TEAM, PRO]));
});

test('duplicating an item puts a copy right after it, and undo takes it out again', async () => {
  await roundTrip({ op: 'duplicateItem', id: TEXT, item: 1 }, pricing([FREE, PRO, PRO, TEAM]));
  await roundTrip({ op: 'duplicateItem', id: CARD, item: 2 }, pricing([FREE, PRO, TEAM, TEAM]));
});

test('deleting an item takes it with one separator, and undo puts it back', async () => {
  await roundTrip({ op: 'removeItem', id: CARD, item: 0 }, pricing([PRO, TEAM]));
  await roundTrip({ op: 'removeItem', id: HEADING, item: 2 }, pricing([FREE, PRO]));
});

test("editing an item's title writes that field, and undo puts the old title back", async () => {
  const op: EditOp = { op: 'setItemText', id: HEADING, item: 1, value: "Pro's", before: 'Pro' };
  await roundTrip(op, pricing([FREE, "  { name: 'Pro\\'s', price: '20 a month' },", TEAM]));
});

test('a text written at its path changes its literal, and undo puts it back', async () => {
  const op: EditOp = {
    op: 'setItemText',
    id: TEXT,
    item: 1,
    path: [1],
    value: '25 a month',
    before: '20 a month',
  };
  await roundTrip(op, pricing([FREE, "  { name: 'Pro', price: '25 a month' },", TEAM]));
});

test('a text at a path that no literal renders is refused; nothing is written', async () => {
  const { store, deps } = setup();
  const op: EditOp = { op: 'setItemText', id: TEXT, item: 1, path: [1], value: 'x', before: 'y' };
  assert.deepEqual(await applyEdits(deps, request(store, 1, [op])), {
    outcome: 'refused',
    version: 1,
    refusals: [{ index: 0, reason: 'computed' }],
  });
  assert.equal(store.readText('plans', `v2/${PRICING}`), undefined);
});

test('a later op of the same request finds the list where the earlier one left it', async () => {
  const { store, deps } = setup();
  const ops: EditOp[] = [
    { op: 'duplicateItem', id: CARD, item: 0 },
    { op: 'setItemText', id: HEADING, item: 1, value: 'Free 2', before: 'Free' },
  ];
  const done = applied(await applyEdits(deps, request(store, 1, ops)));
  const copy = "  { name: 'Free 2', price: '0 a month' },";
  assert.equal(read(store, 2), pricing([FREE, copy, PRO, TEAM]));
  applied(await applyEdits(deps, request(store, 2, done.inverse)));
  assert.equal(read(store, 2), START);
});

test('a gone item, a prop list and a mixed text are refused; nothing is written', async () => {
  const { store, deps } = setup();
  const gone: EditOp = { op: 'removeItem', id: CARD, item: 3 };
  assert.deepEqual(await applyEdits(deps, request(store, 1, [gone])), {
    outcome: 'refused',
    version: 1,
    refusals: [{ index: 0, reason: 'list-item-gone' }],
  });
  const text: EditOp = { op: 'setItemText', id: CARD, item: 0, value: 'x', before: 'Free' };
  const refused = await applyEdits(deps, request(store, 1, [text]));
  assert.equal(refused.outcome, 'refused');
  assert.equal(store.readText('plans', `v2/${PRICING}`), undefined);

  const prop = setup(pricing([FREE, PRO, TEAM], '{ PLANS }: { PLANS: { name: string }[] }'));
  const move: EditOp = { op: 'moveItem', id: CARD, item: 0, to: 1 };
  assert.deepEqual(await applyEdits(prop.deps, request(prop.store, 1, [move])), {
    outcome: 'refused',
    version: 1,
    refusals: [{ index: 0, reason: 'list-not-literal' }],
  });
});

test('a title someone else changed is a conflict, never a silent write', async () => {
  const { store, deps } = setup();
  const op: EditOp = { op: 'setItemText', id: HEADING, item: 1, value: 'Max', before: 'Basic' };
  const result = await applyEdits(deps, request(store, 1, [op]));
  assert.equal(result.outcome, 'conflict');
  assert.equal(store.readText('plans', `v2/${PRICING}`), undefined);
});
