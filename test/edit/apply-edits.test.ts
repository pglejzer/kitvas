import assert from 'node:assert/strict';
import { after, test } from 'node:test';
import { addVersion, type DraftStore, loadDraft } from '../../src/drafts/index.ts';
import { createEsbuildCompiler } from '../../src/edit/adapters/esbuild-compiler.ts';
import {
  type ApplyEditsDeps,
  applyEdits,
  type EditCompiler,
  type EditInput,
  type EditOp,
  inverseAll,
  type Refusal,
} from '../../src/edit/index.ts';
import { KitvasError, PLUGIN_ROOT } from '../../src/shared/index.ts';
import { etagOf } from '../../src/studio/http/etag.ts';
import { readVersionFiles, shopDraft, writeVersionFiles } from '../helpers/drafts.ts';

const compiler = createEsbuildCompiler([PLUGIN_ROOT]);
after(() => compiler.dispose());

const LATER = new Date('2026-11-23T09:00:00.000Z');
const HERO = 'src/tsx/sections/Hero.tsx';
const SCSS = 'src/scss/sections/hero.scss';
/** A section without an SCSS file. */
const LIST = 'src/tsx/sections/List.tsx';
const FILES = [HERO, SCSS, LIST];

const HERO_TSX = [
  "import { Button } from '@kit';",
  '',
  'export function Hero({ tone }: { tone: string }) {',
  '  return (',
  '    <section className="hero">',
  '      <h1>Shop</h1>',
  '      <p>State: {tone}</p>',
  '      <Button variant={tone}>Buy</Button>',
  '      <Button variant="plain">Later</Button>',
  '    </section>',
  '  );',
  '}',
  '',
].join('\n');
const HERO_SCSS = '.hero {\n  color: var(--kit-color-ink);\n}\n';
const LIST_TSX = [
  'export function List() {',
  '  return <ul className="list"><li>One</li></ul>;',
  '}',
  '',
].join('\n');

const LATER_BUTTON = 'sections/Hero:section/Button.2';

const variant = (from: string, to: string): EditOp => ({
  op: 'setProp',
  id: LATER_BUTTON,
  name: 'variant',
  value: { kind: 'string', value: to },
  before: { kind: 'string', value: from },
  after: null,
});
const heading = (from: string, to: string): EditOp => ({
  op: 'setText',
  id: 'sections/Hero:section/h1',
  value: to,
  before: from,
});
const colour = (raw: string): EditOp => ({
  op: 'setStyle',
  id: 'sections/Hero:section',
  className: 'hero',
  property: 'color',
  value: { raw },
  before: { token: '--kit-color-ink' },
  newRule: false,
});

type Written = { slug: string; version: number; etags: Record<string, string> };

/** The `shop` draft at v1 with its sections, and the editor's deps on the real compiler. */
function setup(over: Partial<ApplyEditsDeps> = {}) {
  const { store } = shopDraft();
  writeVersionFiles(store, 'shop', 1, { [HERO]: HERO_TSX, [SCSS]: HERO_SCSS, [LIST]: LIST_TSX });
  const written: Written[] = [];
  const deps: ApplyEditsDeps = {
    drafts: store,
    compiler,
    now: () => LATER,
    etag: etagOf,
    sectionScss: (_slug, _version, tsxFile) => (tsxFile === HERO ? SCSS : null),
    beforeWrite: (slug, version, etags) => {
      written.push({ slug, version, etags });
    },
    ...over,
  };
  return { store, deps, written };
}

/** The ETags of a version's files, as the editor last heard them. */
const etagsOf = (store: DraftStore, version: number): Record<string, string> =>
  Object.fromEntries(
    FILES.flatMap((file): [string, string][] => {
      const text = store.readText('shop', `v${version}/${file}`);
      return text === undefined ? [] : [[file, etagOf(text)]];
    }),
  );

const request = (
  store: DraftStore,
  version: number,
  ops: EditOp[],
  over: Partial<EditInput> = {},
): EditInput => ({ slug: 'shop', version, ops, etags: etagsOf(store, version), ...over });

/** draft.json and every file of v1 and v2: what "nothing was written" compares. */
const snapshot = (store: DraftStore) => ({
  draft: store.readText('shop', 'draft.json'),
  v1: readVersionFiles(store, 'shop', 1, FILES),
  v2: readVersionFiles(store, 'shop', 2, FILES),
});

const versions = (store: DraftStore): number[] =>
  loadDraft(store, 'shop').versions.map((version) => version.number);

test('the first edit starts the next version, writes into it and opens the session', async () => {
  const { store, deps, written } = setup();
  const result = await applyEdits(deps, request(store, 1, [variant('plain', 'primary')]));
  const text = HERO_TSX.replace('variant="plain"', 'variant="primary"');
  const etags = { [HERO]: etagOf(text) };
  assert.deepEqual(result, { outcome: 'applied', version: 2, started: true, etags, merged: false });
  assert.equal(store.readText('shop', `v2/${HERO}`), text);
  assert.equal(store.readText('shop', `v2/${SCSS}`), HERO_SCSS);
  assert.equal(store.readText('shop', `v1/${HERO}`), HERO_TSX);
  assert.deepEqual(loadDraft(store, 'shop').edit, { version: 2, startedAt: LATER.toISOString() });
  assert.deepEqual(written, [{ slug: 'shop', version: 2, etags }]);
});

test('a later edit of the session goes into the same version', async () => {
  const { store, deps } = setup();
  await applyEdits(deps, request(store, 1, [variant('plain', 'primary')]));
  const result = await applyEdits(deps, request(store, 2, [heading('Shop', 'Store')]));
  const text = HERO_TSX.replace('variant="plain"', 'variant="primary"').replace(
    '<h1>Shop</h1>',
    '<h1>Store</h1>',
  );
  assert.deepEqual(result, {
    outcome: 'applied',
    version: 2,
    started: false,
    etags: { [HERO]: etagOf(text) },
    merged: false,
  });
  assert.equal(store.readText('shop', `v2/${HERO}`), text);
  assert.deepEqual(versions(store), [1, 2]);
});

test('a TSX and an SCSS change land together, and their inverse undoes both', async () => {
  const { store, deps } = setup();
  const ops: EditOp[] = [
    { op: 'addClass', id: 'sections/Hero:section/h1', className: 'title' },
    {
      op: 'setStyle',
      id: 'sections/Hero:section/h1',
      className: 'title',
      property: 'color',
      value: { token: '--kit-color-accent' },
      before: null,
      newRule: true,
    },
  ];
  const applied = await applyEdits(deps, request(store, 1, ops));
  assert.equal(applied.outcome, 'applied');
  if (applied.outcome !== 'applied') return;
  assert.deepEqual(Object.keys(applied.etags).sort(), [SCSS, HERO]);
  const tsx = store.readText('shop', `v2/${HERO}`) ?? '';
  const scss = store.readText('shop', `v2/${SCSS}`) ?? '';
  assert.equal(tsx, HERO_TSX.replace('<h1>Shop</h1>', '<h1 className="title">Shop</h1>'));
  assert.ok(scss.startsWith(HERO_SCSS), scss);
  assert.match(scss, /\.title \{\s*color: var\(--kit-color-accent\);\s*\}\n$/);

  const undo = await applyEdits(deps, request(store, 2, inverseAll(ops)));
  assert.equal(undo.outcome, 'applied');
  assert.equal(store.readText('shop', `v2/${HERO}`), HERO_TSX);
  assert.equal(store.readText('shop', `v2/${SCSS}`), HERO_SCSS);
});

test('an edit on a version that is not the latest is EDIT_STALE_VERSION', async () => {
  const { store, deps } = setup();
  addVersion(store, 'shop', LATER);
  await assert.rejects(
    applyEdits(deps, request(store, 1, [variant('plain', 'primary')])),
    (error: unknown) =>
      error instanceof KitvasError &&
      error.code === 'EDIT_STALE_VERSION' &&
      error.params.version === 1 &&
      error.params.latest === 2,
  );
});

test('a refused op writes nothing, not even the ops before it', async () => {
  const { store, deps, written } = setup();
  const before = snapshot(store);
  const noText: EditOp = { op: 'setText', id: 'sections/Hero:section/p', value: 'x', before: 'y' };
  const result = await applyEdits(deps, request(store, 1, [variant('plain', 'primary'), noText]));
  assert.deepEqual(result, {
    outcome: 'refused',
    version: 1,
    refusals: [{ index: 1, reason: 'no-text' }],
  });
  assert.deepEqual(snapshot(store), before);
  assert.deepEqual(written, []);
});

test('a TSX change with an SCSS change that would not balance writes neither file', async () => {
  const { store, deps, written } = setup();
  const before = snapshot(store);
  // A raw value with an open quote leaves a string open to the end of its line.
  const ops = [variant('plain', 'primary'), colour('"x')];
  const result = await applyEdits(deps, request(store, 1, ops));
  assert.deepEqual(result, {
    outcome: 'refused',
    version: 1,
    refusals: [{ index: 1, reason: 'invalid' }],
  });
  assert.deepEqual(snapshot(store), before);
  assert.deepEqual(written, []);
});

test('a change to a second TSX file that would not compile writes neither file', async () => {
  // This compiler refuses any text with the word "Broken" in it.
  const picky: EditCompiler = {
    jsxDev: (text, file) =>
      text.includes('Broken') ? Promise.resolve(null) : compiler.jsxDev(text, file),
  };
  const { store, deps } = setup({ compiler: picky });
  const before = snapshot(store);
  const item: EditOp = {
    op: 'setText',
    id: 'sections/List:ul/li',
    value: 'Broken',
    before: 'One',
  };
  const ops = [variant('plain', 'primary'), item];
  const result = await applyEdits(deps, request(store, 1, ops));
  assert.deepEqual(result, {
    outcome: 'refused',
    version: 1,
    refusals: [{ index: 1, reason: 'invalid' }],
  });
  assert.deepEqual(snapshot(store), before);
});

test('a change by Claude elsewhere in the file is kept, and the edit is merged', async () => {
  const { store, deps } = setup();
  const etags = etagsOf(store, 1);
  const claude = HERO_TSX.replace('<h1>Shop</h1>', '<h1>Shop now</h1>').replace(
    '      <Button variant={tone}>',
    '      <p>New</p>\n      <Button variant={tone}>',
  );
  store.writeText('shop', `v1/${HERO}`, claude);
  const ops = [variant('plain', 'primary')];
  const result = await applyEdits(deps, request(store, 1, ops, { etags }));
  const text = claude.replace('variant="plain"', 'variant="primary"');
  assert.deepEqual(result, {
    outcome: 'applied',
    version: 2,
    started: true,
    etags: { [HERO]: etagOf(text) },
    merged: true,
  });
  assert.equal(store.readText('shop', `v2/${HERO}`), text);
});

test('a prop Claude changed too is a conflict with the current text', async () => {
  const { store, deps } = setup();
  const etags = etagsOf(store, 1);
  const claude = HERO_TSX.replace('variant="plain"', 'variant="ghost"');
  store.writeText('shop', `v1/${HERO}`, claude);
  const before = snapshot(store);
  const ops = [heading('Shop', 'Store'), variant('plain', 'primary')];
  const result = await applyEdits(deps, request(store, 1, ops, { etags }));
  assert.deepEqual(result, {
    outcome: 'conflict',
    version: 1,
    index: 1,
    reason: 'changed',
    file: HERO,
    text: claude,
    etag: etagOf(claude),
  });
  assert.deepEqual(snapshot(store), before);
});

test('an element Claude deleted is a conflict: gone', async () => {
  const { store, deps } = setup();
  const etags = etagsOf(store, 1);
  const claude = HERO_TSX.replace('      <Button variant="plain">Later</Button>\n', '');
  store.writeText('shop', `v1/${HERO}`, claude);
  const before = snapshot(store);
  const ops = [variant('plain', 'primary')];
  const result = await applyEdits(deps, request(store, 1, ops, { etags }));
  assert.deepEqual(result, {
    outcome: 'conflict',
    version: 1,
    index: 0,
    reason: 'gone',
    file: HERO,
    text: claude,
    etag: etagOf(claude),
  });
  assert.deepEqual(snapshot(store), before);
});

test('keep mine writes over a value someone else changed', async () => {
  const { store, deps } = setup();
  const claude = HERO_TSX.replace('variant="plain"', 'variant="ghost"');
  store.writeText('shop', `v1/${HERO}`, claude);
  const ops = [variant('plain', 'primary')];
  const result = await applyEdits(deps, request(store, 1, ops, { force: true }));
  const text = claude.replace('variant="ghost"', 'variant="primary"');
  assert.deepEqual(result, {
    outcome: 'applied',
    version: 2,
    started: true,
    etags: { [HERO]: etagOf(text) },
    merged: false,
  });
  assert.equal(store.readText('shop', `v2/${HERO}`), text);
});

test('every refusal leaves draft.json and every file byte for byte', async () => {
  const { store, deps, written } = setup();
  const before = snapshot(store);
  const hero = 'sections/Hero:section';
  const cases: { op: EditOp; force?: boolean; reason: Refusal }[] = [
    { op: { op: 'setText', id: `${hero}/p`, value: 'x', before: 'y' }, reason: 'no-text' },
    {
      op: {
        op: 'setProp',
        id: `${hero}/Button`,
        name: 'variant',
        value: { kind: 'string', value: 'plain' },
        before: { kind: 'string', value: 'solid' },
        after: null,
      },
      force: true,
      reason: 'computed',
    },
    { op: { op: 'addClass', id: hero, className: 'other' }, reason: 'has-class' },
    { op: heading('Shop', 'a < b'), reason: 'invalid' },
    { op: { op: 'setText', id: `${hero}/h2`, value: 'x', before: 'y' }, reason: 'not-found' },
    {
      op: {
        op: 'setStyle',
        id: 'sections/List:ul',
        className: 'list',
        property: 'gap',
        value: { token: '--kit-space-md' },
        before: null,
        newRule: true,
      },
      reason: 'not-found',
    },
    {
      op: {
        op: 'setStyle',
        id: hero,
        className: 'nope',
        property: 'gap',
        value: { token: '--kit-space-md' },
        before: null,
        newRule: false,
      },
      reason: 'not-found',
    },
  ];
  for (const { op, force, reason } of cases) {
    const result = await applyEdits(deps, request(store, 1, [op], { force: force === true }));
    assert.deepEqual(result, { outcome: 'refused', version: 1, refusals: [{ index: 0, reason }] });
    assert.deepEqual(snapshot(store), before, reason);
  }
  assert.deepEqual(written, []);
});

test('an edit that leaves the text as it was starts no version', async () => {
  const { store, deps, written } = setup();
  const result = await applyEdits(deps, request(store, 1, [variant('plain', 'plain')]));
  assert.deepEqual(result, {
    outcome: 'applied',
    version: 1,
    started: false,
    etags: {},
    merged: false,
  });
  assert.deepEqual(versions(store), [1]);
  assert.deepEqual(written, []);
});

test('two requests at once run in turn: the second meets the new version', async () => {
  const { store, deps } = setup();
  const [first, second] = await Promise.allSettled([
    applyEdits(deps, request(store, 1, [variant('plain', 'primary')])),
    applyEdits(deps, request(store, 1, [heading('Shop', 'Store')])),
  ]);
  assert.equal(first.status === 'fulfilled' && first.value.outcome, 'applied');
  assert.ok(
    second.status === 'rejected' &&
      second.reason instanceof KitvasError &&
      second.reason.code === 'EDIT_STALE_VERSION',
  );
  assert.deepEqual(versions(store), [1, 2]);
});

test('a file written while the edit is placed is read again, so that change is kept', async () => {
  const { store, deps } = setup();
  const claude = HERO_TSX.replace('<h1>Shop</h1>', '<h1>Shop now</h1>');
  let calls = 0;
  // The first compile stands for the moment Claude saves the file.
  const racing: EditCompiler = {
    jsxDev(text, file) {
      calls += 1;
      if (calls === 1) store.writeText('shop', `v1/${HERO}`, claude);
      return compiler.jsxDev(text, file);
    },
  };
  const ops = [variant('plain', 'primary')];
  const result = await applyEdits({ ...deps, compiler: racing }, request(store, 1, ops));
  const text = claude.replace('variant="plain"', 'variant="primary"');
  assert.deepEqual(result, {
    outcome: 'applied',
    version: 2,
    started: true,
    etags: { [HERO]: etagOf(text) },
    merged: true,
  });
  assert.equal(store.readText('shop', `v2/${HERO}`), text);
});

test('a file that keeps changing while the edit is placed is a conflict', async () => {
  const { store, deps, written } = setup();
  let calls = 0;
  // Every compile stands for another save by Claude.
  const busy: EditCompiler = {
    jsxDev(text, file) {
      calls += 1;
      store.writeText('shop', `v1/${HERO}`, HERO_TSX.replace('Shop', `Shop ${calls}`));
      return compiler.jsxDev(text, file);
    },
  };
  const ops = [variant('plain', 'primary')];
  const result = await applyEdits({ ...deps, compiler: busy }, request(store, 1, ops));
  const current = store.readText('shop', `v1/${HERO}`) ?? '';
  assert.deepEqual(result, {
    outcome: 'conflict',
    version: 1,
    index: 0,
    reason: 'changed',
    file: HERO,
    text: current,
    etag: etagOf(current),
  });
  assert.deepEqual(versions(store), [1]);
  assert.deepEqual(written, []);
});
