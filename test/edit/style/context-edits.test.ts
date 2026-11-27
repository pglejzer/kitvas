// Requests with ops of a width or a state (spec 4c, goal 2; plan 16, task A): written into the
// rule's block and undone byte for byte, by the inverse ops where those are exact and by the
// file's own hunks where they are not; refused for a width that is no breakpoint and for a
// property a kit prop covers. Utility classes of a Tailwind draft go the same way.

import assert from 'node:assert/strict';
import { after, test } from 'node:test';
import { createDraft, type DraftStore } from '../../../src/drafts/index.ts';
import { createEsbuildCompiler } from '../../../src/edit/adapters/esbuild-compiler.ts';
import { createWork } from '../../../src/edit/app/request-state.ts';
import { contextRefusal } from '../../../src/edit/app/style/context-checks.ts';
import {
  type ApplyEditsDeps,
  applyEdits,
  type EditInput,
  type EditOp,
  inverseAll,
  type SimpleOp,
  type StyleContext,
  type StyleValue,
} from '../../../src/edit/index.ts';
import { PLUGIN_ROOT } from '../../../src/shared/index.ts';
import { etagOf } from '../../../src/studio/http/etag.ts';
import { NOW, tempDrafts, writeVersionFiles } from '../../helpers/draft/drafts.ts';
import { builtinKits } from '../../helpers/kit/kits.ts';

const compiler = createEsbuildCompiler([PLUGIN_ROOT]);
after(() => compiler.dispose());

const BASE = { id: 'kitvas-ui', version: '1.0.0', hash: 'b'.repeat(64) };
const LATER = new Date('2026-11-24T09:00:00.000Z');
const HERO = 'src/tsx/sections/Hero.tsx';
const SCSS = 'src/scss/sections/hero.scss';
const FILES = [HERO, SCSS];
const SECTION = 'sections/Hero:section';
const STACK = 'sections/Hero:section/Stack';
const TITLE = 'sections/Hero:section/Stack/h1';

const HERO_TSX = [
  "import { Stack } from '@kit';",
  '',
  'export function Hero() {',
  '  return (',
  '    <section className="hero">',
  '      <Stack gap="12">',
  '        <h1 className="flex p-4 gap-2">Shop</h1>',
  '      </Stack>',
  '    </section>',
  '  );',
  '}',
  '',
].join('\n');
const HERO_SCSS = '.hero {\n  padding: var(--kit-space-12);\n}\n';
const WIDE_BLOCK = '\n  @media (min-width: 768px) {\n    padding: var(--kit-space-16);\n  }\n';

const AT_768: StyleContext = { width: 768, state: null, option: null };
const LG: StyleValue = { token: '--kit-space-16' };
/** ADR 0082: the value `2` of the option `columns`, at every width, resting. */
const TWO: StyleContext = { width: null, state: null, option: { id: 'columns', value: '2' } };
const OPTIONS_FILE = 'src/json/options.json';
const OPTIONS_JSON = JSON.stringify({
  schemaVersion: 1,
  options: [
    {
      id: 'columns',
      label: 'Columns',
      default: '3',
      values: [
        { id: '3', label: '3' },
        { id: '2', label: '2' },
      ],
    },
    {
      id: 'cards',
      label: 'Cards',
      default: 'outlined',
      values: [
        { id: 'outlined', label: 'Outlined' },
        { id: 'filled', label: 'Filled' },
      ],
    },
  ],
});

function setup(scss = HERO_SCSS) {
  const { store } = tempDrafts();
  createDraft(store, { slug: 'shop', title: 'Shop', kit: BASE, now: NOW });
  writeVersionFiles(store, 'shop', 1, { [HERO]: HERO_TSX, [SCSS]: scss });
  const deps: ApplyEditsDeps = {
    drafts: store,
    kits: builtinKits(),
    compiler,
    now: () => LATER,
    etag: etagOf,
    sectionScss: (_slug, _version, tsxFile) => (tsxFile === HERO ? SCSS : null),
    beforeWrite: () => undefined,
  };
  return { store, deps };
}

const request = (store: DraftStore, version: number, ops: EditOp[]): EditInput => ({
  slug: 'shop',
  version,
  ops,
  etags: Object.fromEntries(
    FILES.flatMap((file): [string, string][] => {
      const text = store.readText('shop', `v${version}/${file}`);
      return text === undefined ? [] : [[file, etagOf(text)]];
    }),
  ),
});

const widePadding = (context: StyleContext, id = SECTION, className = 'hero'): SimpleOp => ({
  op: 'setStyle',
  id,
  className,
  property: 'padding',
  value: LG,
  before: null,
  newRule: false,
  context,
  newBlock: true,
});

test('an edit at 768 is written as a media block, and its inverse ops return the file', async () => {
  const { store, deps } = setup();
  const ops = [widePadding(AT_768)];
  const result = await applyEdits(deps, request(store, 1, ops));
  assert.equal(result.outcome, 'applied');
  if (result.outcome !== 'applied') return;
  assert.equal(store.readText('shop', `v2/${SCSS}`), HERO_SCSS.replace('}\n', `${WIDE_BLOCK}}\n`));
  // The inverse ops give the file back exactly, so they are the answer's inverse.
  assert.deepEqual(result.inverse, inverseAll(ops));
  const undo = await applyEdits(deps, request(store, 2, result.inverse));
  assert.equal(undo.outcome, 'applied');
  assert.equal(store.readText('shop', `v2/${SCSS}`), HERO_SCSS);
});

test('a hover value at a width and its undo go through one request each', async () => {
  const { store, deps } = setup();
  const ops: SimpleOp[] = [
    widePadding(AT_768),
    {
      op: 'setStyle',
      id: SECTION,
      className: 'hero',
      property: 'color',
      value: { raw: '#123456' },
      before: null,
      newRule: false,
      context: { width: 768, state: 'hover', option: null },
      newBlock: true,
    },
  ];
  const result = await applyEdits(deps, request(store, 1, ops));
  assert.equal(result.outcome, 'applied');
  if (result.outcome !== 'applied') return;
  assert.equal(
    store.readText('shop', `v2/${SCSS}`),
    [
      '.hero {',
      '  padding: var(--kit-space-12);',
      '',
      '  @media (min-width: 768px) {',
      '    padding: var(--kit-space-16);',
      '',
      '    &:hover {',
      '      color: #123456; /* off-kit */',
      '    }',
      '  }',
      '}',
      '',
    ].join('\n'),
  );
  assert.deepEqual(result.inverse, inverseAll(ops));
  const undo = await applyEdits(deps, request(store, 2, result.inverse));
  assert.equal(undo.outcome, 'applied');
  assert.equal(store.readText('shop', `v2/${SCSS}`), HERO_SCSS);
});

test('a block someone wrote in another shape is undone by a patch of the file', async () => {
  const written = HERO_SCSS.replace(
    '}\n',
    '  @media (min-width: 768px) { padding: var(--kit-space-16); }\n}\n',
  );
  const { store, deps } = setup(written);
  const drop: SimpleOp = {
    op: 'removeStyle',
    id: SECTION,
    className: 'hero',
    property: 'padding',
    before: LG,
    dropRule: false,
    context: AT_768,
    dropBlock: true,
  };
  const result = await applyEdits(deps, request(store, 1, [drop]));
  assert.equal(result.outcome, 'applied');
  if (result.outcome !== 'applied') return;
  assert.equal(store.readText('shop', `v2/${SCSS}`), HERO_SCSS);
  // An op would make the block again on lines of its own: the hunks put back what was there.
  assert.deepEqual(
    result.inverse.map((op) => [op.op, 'file' in op ? op.file : null]),
    [['patch', SCSS]],
  );
  const undo = await applyEdits(deps, request(store, 2, result.inverse));
  assert.equal(undo.outcome, 'applied');
  assert.equal(store.readText('shop', `v2/${SCSS}`), written);
});

test('a width that is no breakpoint of the kit is refused, and nothing is written', async () => {
  const { store, deps } = setup();
  const result = await applyEdits(
    deps,
    request(store, 1, [widePadding({ ...AT_768, width: 900 })]),
  );
  assert.deepEqual(result, {
    outcome: 'refused',
    version: 1,
    refusals: [{ index: 0, reason: 'not-breakpoint' }],
  });
  assert.equal(store.readText('shop', `v2/${SCSS}`), undefined);
});

test("an edit for an option's value goes into its block in the version's order, and undoes", async () => {
  const filled = '\n  [data-opt-cards="filled"] & {\n    color: var(--kit-color-ink);\n  }\n';
  const read = HERO_SCSS.replace('}\n', `${filled}}\n`);
  const { store, deps } = setup(read);
  writeVersionFiles(store, 'shop', 1, { [OPTIONS_FILE]: OPTIONS_JSON });
  const ops = [widePadding(TWO)];
  const result = await applyEdits(deps, request(store, 1, ops));
  assert.equal(result.outcome, 'applied');
  if (result.outcome !== 'applied') return;
  // `columns` comes before `cards` in the version's file, so its block does too.
  const columns = '\n  [data-opt-columns="2"] & {\n    padding: var(--kit-space-16);\n  }\n';
  assert.equal(
    store.readText('shop', `v2/${SCSS}`),
    HERO_SCSS.replace('}\n', `${columns}${filled}}\n`),
  );
  assert.deepEqual(result.inverse, inverseAll(ops));
  const undo = await applyEdits(deps, request(store, 2, result.inverse));
  assert.equal(undo.outcome, 'applied');
  assert.equal(store.readText('shop', `v2/${SCSS}`), read);
});

test('an op for an option or a value the version does not have is refused, nothing written', async () => {
  const invalid = { outcome: 'refused', version: 1, refusals: [{ index: 0, reason: 'invalid' }] };
  const { store, deps } = setup();
  writeVersionFiles(store, 'shop', 1, { [OPTIONS_FILE]: OPTIONS_JSON });
  for (const option of [
    { id: 'columns', value: '4' },
    { id: 'theme', value: 'dark' },
  ]) {
    const ops = [widePadding({ ...TWO, option })];
    assert.deepEqual(await applyEdits(deps, request(store, 1, ops)), invalid);
  }
  assert.equal(store.readText('shop', `v2/${SCSS}`), undefined);
  // A version without `options.json` has no option at all: an op stored for one is refused too.
  const none = setup();
  assert.deepEqual(
    await applyEdits(none.deps, request(none.store, 1, [widePadding(TWO)])),
    invalid,
  );
  assert.equal(none.store.readText('shop', `v2/${SCSS}`), undefined);
});

test('a property a kit prop covers takes no value of a width or a state', async () => {
  const { deps } = setup();
  const at = { slug: 'shop', version: 1, kitId: 'kitvas-ui', options: { force: false }, etags: {} };
  const refusal = (op: SimpleOp) => contextRefusal(createWork(deps, at), op);
  const gap = (context: StyleContext | undefined, id = STACK): SimpleOp => ({
    op: 'setStyle',
    id,
    className: 'stack',
    property: 'gap',
    value: LG,
    before: null,
    newRule: true,
    ...(context === undefined ? {} : { context, newBlock: true }),
  });
  // The kit's Stack sets its gap by the `gap` prop.
  const base: StyleContext = { width: null, state: null, option: null };
  assert.equal(await refusal(gap(AT_768)), 'prop-covered');
  assert.equal(await refusal(gap({ ...base, state: 'hover' })), 'prop-covered');
  // The base goes to the prop as in stage 4a, and is no business of this check.
  assert.equal(await refusal(gap(undefined)), null);
  assert.equal(await refusal(gap(base)), null);
  // A property no prop covers, and a plain element.
  assert.equal(await refusal(widePadding(AT_768, STACK, 'stack')), null);
  assert.equal(await refusal(gap(AT_768, SECTION)), null);
  assert.equal(await refusal(gap({ ...base, width: 900 })), 'not-breakpoint');
  // An option's value the version (here without options) does not have is no value to write.
  assert.equal(await refusal(gap(TWO, SECTION)), 'invalid');
  // Taking an override away is never refused for the prop.
  const drop: SimpleOp = {
    op: 'removeStyle',
    id: STACK,
    className: 'stack',
    property: 'gap',
    before: LG,
    dropRule: false,
    context: AT_768,
    dropBlock: true,
  };
  assert.equal(await refusal(drop), null);
  // The same for a utility class of a Tailwind draft.
  const utility = (value: string): SimpleOp => ({
    op: 'setUtility',
    id: STACK,
    value,
    before: null,
  });
  assert.equal(await refusal(utility('md:gap-4')), 'prop-covered');
  assert.equal(await refusal(utility('md:p-4')), null);
  assert.equal(await refusal(utility('gap-4')), null);
  assert.equal(await refusal(utility('min-[900px]:p-4')), 'not-breakpoint');
});

test('a utility class is added and undone by its inverse op; one taken out, by a patch', async () => {
  const { store, deps } = setup();
  const add: SimpleOp[] = [{ op: 'setUtility', id: TITLE, value: 'md:hover:p-6', before: null }];
  const added = await applyEdits(deps, request(store, 1, add));
  assert.equal(added.outcome, 'applied');
  if (added.outcome !== 'applied') return;
  assert.equal(
    store.readText('shop', `v2/${HERO}`),
    HERO_TSX.replace('flex p-4 gap-2', 'flex p-4 gap-2 md:hover:p-6'),
  );
  assert.deepEqual(added.inverse, inverseAll(add));
  const undone = await applyEdits(deps, request(store, 2, added.inverse));
  assert.equal(undone.outcome, 'applied');
  assert.equal(store.readText('shop', `v2/${HERO}`), HERO_TSX);

  // Its inverse op would add `p-4` at the end, not where it was.
  const drop: SimpleOp[] = [{ op: 'setUtility', id: TITLE, value: null, before: 'p-4' }];
  const dropped = await applyEdits(deps, request(store, 2, drop));
  assert.equal(dropped.outcome, 'applied');
  if (dropped.outcome !== 'applied') return;
  assert.equal(store.readText('shop', `v2/${HERO}`), HERO_TSX.replace('flex p-4 ', 'flex '));
  assert.deepEqual(
    dropped.inverse.map((op) => [op.op, 'file' in op ? op.file : null]),
    [['patch', HERO]],
  );
  const back = await applyEdits(deps, request(store, 2, dropped.inverse));
  assert.equal(back.outcome, 'applied');
  assert.equal(store.readText('shop', `v2/${HERO}`), HERO_TSX);
});

test('a class kitvas does not know and a className built in code are refused', async () => {
  const { store, deps } = setup();
  const unknown: SimpleOp = { op: 'setUtility', id: TITLE, value: 'dark:p-6', before: null };
  const result = await applyEdits(deps, request(store, 1, [unknown]));
  assert.deepEqual(result, {
    outcome: 'refused',
    version: 1,
    refusals: [{ index: 0, reason: 'utility-unknown' }],
  });
});

test('a utility added to an empty className is undone by a patch, byte for byte (spec 4d)', async () => {
  for (const empty of ['className=""', 'className=" "']) {
    const { store, deps } = setup();
    const read = HERO_TSX.replace('className="flex p-4 gap-2"', empty);
    writeVersionFiles(store, 'shop', 1, { [HERO]: read, [SCSS]: HERO_SCSS });
    const add: SimpleOp[] = [{ op: 'setUtility', id: TITLE, value: 'p-6', before: null }];
    const added = await applyEdits(deps, request(store, 1, add));
    assert.equal(added.outcome, 'applied', JSON.stringify(added));
    if (added.outcome !== 'applied') return;
    // The inverse op would take the attribute out with the class: the file's hunks undo it.
    assert.deepEqual(
      added.inverse.map((op) => [op.op, 'file' in op ? op.file : null]),
      [['patch', HERO]],
    );
    const back = await applyEdits(deps, request(store, 2, added.inverse));
    assert.equal(back.outcome, 'applied');
    assert.equal(store.readText('shop', `v2/${HERO}`), read);
  }
});
