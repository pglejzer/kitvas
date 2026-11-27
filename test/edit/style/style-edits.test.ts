// A request of the plan 15 style properties (task C): a keyword from its list and an image of the
// version are written and undone by their inverse ops; another word or a missing image is refused
// and writes nothing; a change from a word someone wrote outside the list is undone by a patch.

import assert from 'node:assert/strict';
import { after, test } from 'node:test';
import type { DraftStore } from '../../../src/drafts/index.ts';
import { createEsbuildCompiler } from '../../../src/edit/adapters/esbuild-compiler.ts';
import {
  type ApplyEditsDeps,
  applyEdits,
  type EditInput,
  type EditOp,
  imageUrl,
  inverseAll,
  plainValue,
  type SimpleOp,
  type StyleValue,
} from '../../../src/edit/index.ts';
import { PLUGIN_ROOT } from '../../../src/shared/index.ts';
import { etagOf } from '../../../src/studio/http/etag.ts';
import { readVersionFiles, shopDraft, writeVersionFiles } from '../../helpers/draft/drafts.ts';
import { builtinKits } from '../../helpers/kit/kits.ts';

const compiler = createEsbuildCompiler([PLUGIN_ROOT]);
after(() => compiler.dispose());

const LATER = new Date('2026-11-24T09:00:00.000Z');
const HERO = 'src/tsx/sections/Hero.tsx';
const SCSS = 'src/scss/sections/hero.scss';
const FILES = [HERO, SCSS];

const HERO_TSX = [
  'export function Hero() {',
  '  return (',
  '    <section className="hero">',
  '      <h1>Shop</h1>',
  '    </section>',
  '  );',
  '}',
  '',
].join('\n');
const HERO_SCSS = '.hero {\n  display: grid;\n  align-items: start;\n}\n';

function setup(images: Record<string, string> = {}) {
  const { store } = shopDraft();
  writeVersionFiles(store, 'shop', 1, { [HERO]: HERO_TSX, [SCSS]: HERO_SCSS, ...images });
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

const etagsOf = (store: DraftStore, version: number): Record<string, string> =>
  Object.fromEntries(
    FILES.flatMap((file): [string, string][] => {
      const text = store.readText('shop', `v${version}/${file}`);
      return text === undefined ? [] : [[file, etagOf(text)]];
    }),
  );

const request = (store: DraftStore, version: number, ops: EditOp[]): EditInput => ({
  slug: 'shop',
  version,
  ops,
  etags: etagsOf(store, version),
});

const style = (property: string, value: StyleValue, before: StyleValue | null): SimpleOp => ({
  op: 'setStyle',
  id: 'sections/Hero:section',
  className: 'hero',
  property,
  value,
  before,
  newRule: false,
});

test('a keyword of the list is written plain, and its inverse ops undo it', async () => {
  const { store, deps } = setup();
  const ops = [style('display', plainValue('flex'), plainValue('grid'))];
  const result = await applyEdits(deps, request(store, 1, ops));
  assert.equal(result.outcome, 'applied');
  if (result.outcome !== 'applied') return;
  assert.equal(store.readText('shop', `v2/${SCSS}`), HERO_SCSS.replace('grid', 'flex'));
  assert.deepEqual(result.inverse, inverseAll(ops));
  const undo = await applyEdits(deps, request(store, 2, result.inverse));
  assert.equal(undo.outcome, 'applied');
  assert.equal(store.readText('shop', `v2/${SCSS}`), HERO_SCSS);
});

test('a change from a word outside the list is undone by a patch of the file', async () => {
  const { store, deps } = setup();
  const ops = [style('align-items', plainValue('center'), plainValue('start'))];
  const result = await applyEdits(deps, request(store, 1, ops));
  assert.equal(result.outcome, 'applied');
  if (result.outcome !== 'applied') return;
  assert.equal(store.readText('shop', `v2/${SCSS}`), HERO_SCSS.replace('start', 'center'));
  // `align-items: start` may not be written by an op, so the inverse is the file's own hunks.
  assert.deepEqual(
    result.inverse.map((op) => [op.op, 'file' in op ? op.file : null]),
    [['patch', SCSS]],
  );
  const undo = await applyEdits(deps, request(store, 2, result.inverse));
  assert.equal(undo.outcome, 'applied');
  assert.equal(store.readText('shop', `v2/${SCSS}`), HERO_SCSS);
});

test('another word, a marked keyword, a missing image: refused, nothing written', async () => {
  const cases: SimpleOp[] = [
    style('display', plainValue('contents'), plainValue('grid')),
    style('display', { raw: 'flex' }, plainValue('grid')),
    style('justify-content', { token: '--kit-space-12' }, null),
    style('background-image', plainValue(imageUrl('hero.png')), null),
    style('background-image', plainValue('url(https://example.com/a.png)'), null),
  ];
  for (const op of cases) {
    const { store, deps } = setup();
    const result = await applyEdits(deps, request(store, 1, [op]));
    assert.deepEqual(
      result,
      { outcome: 'refused', version: 1, refusals: [{ index: 0, reason: 'invalid' }] },
      JSON.stringify(op.op === 'setStyle' ? op.value : op),
    );
    assert.deepEqual(readVersionFiles(store, 'shop', 2, FILES), {
      [HERO]: undefined,
      [SCSS]: undefined,
    });
  }
});

test('an image of the version is written as url(../img/<file>) and undone', async () => {
  const { store, deps } = setup({ 'src/img/hero.png': 'png' });
  const ops = [style('background-image', plainValue(imageUrl('hero.png')), null)];
  const result = await applyEdits(deps, request(store, 1, ops));
  assert.equal(result.outcome, 'applied');
  if (result.outcome !== 'applied') return;
  const written = store.readText('shop', `v2/${SCSS}`) ?? '';
  assert.match(written, /\n {2}background-image: url\(\.\.\/img\/hero\.png\);\n\}\n$/);
  assert.ok(!written.includes('off-kit'), written);
  assert.deepEqual(result.inverse, inverseAll(ops));
  const undo = await applyEdits(deps, request(store, 2, result.inverse));
  assert.equal(undo.outcome, 'applied');
  assert.equal(store.readText('shop', `v2/${SCSS}`), HERO_SCSS);
  // A file of another folder is no image of the version.
  const nested = style('background-image', plainValue('url(../img/sub/hero.png)'), null);
  const refused = await applyEdits(deps, request(store, 2, [nested]));
  assert.equal(refused.outcome, 'refused');
});
