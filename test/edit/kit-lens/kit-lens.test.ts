// The Kit lens's data (plan 19, task 2): spacing tokens, off-kit values and "could be" suggestions
// of the latest version, each file read and compiled once.

import assert from 'node:assert/strict';
import { after, test } from 'node:test';
import { addVersion, createDraft, type DraftStore } from '../../../src/drafts/index.ts';
import { createEsbuildCompiler } from '../../../src/edit/adapters/esbuild-compiler.ts';
import { type KitLensView, readKitLens } from '../../../src/edit/app/kit-lens/kit-lens.ts';
import type { EditCompiler } from '../../../src/edit/index.ts';
import { PLUGIN_ROOT } from '../../../src/shared/index.ts';
import { NOW, tempDrafts } from '../../helpers/drafts.ts';
import { builtinKits } from '../../helpers/kits.ts';

const BASE = { id: 'base', version: '1.0.0', hash: 'b'.repeat(64) };
const TSX_FILE = 'src/tsx/sections/Pricing.tsx';
const SCSS_FILE = 'src/scss/sections/pricing.scss';

const TSX = [
  'export function Pricing(_props: { state: string }) {',
  '  return (',
  '    <section className="pricing">',
  '      <div className="grid">grid</div>',
  '      <div className="box">box</div>',
  '      <div className="hero">hero</div>',
  '      <div>nothing</div>',
  '      <button>Buy</button>',
  '    </section>',
  '  );',
  '}',
  '',
].join('\n');

const scss = (hero: string): string =>
  [
    '.pricing {\n  display: block;\n}',
    '.grid {\n  display: flex;\n  gap: var(--kit-space-md);\n}',
    '.box {\n  padding: var(--kit-space-lg);\n}',
    `.hero {\n  background-color: ${hero};\n}`,
    '',
  ].join('\n');

const LAYOUT = '# Layout: Shop\n\n## pricing\nPurpose: Show the plans.\nComponents: Stack\n';

const compiler = createEsbuildCompiler([PLUGIN_ROOT]);
after(() => compiler.dispose());

function shop(files: Record<string, string> = {}): DraftStore {
  const { store } = tempDrafts();
  createDraft(store, { slug: 'shop', title: 'Shop', kit: BASE, now: NOW });
  const all: Record<string, string> = {
    'md/layout.md': LAYOUT,
    [TSX_FILE]: TSX,
    [SCSS_FILE]: scss('#1a73e8'),
    ...files,
  };
  for (const [path, text] of Object.entries(all)) store.writeText('shop', `v1/${path}`, text);
  return store;
}

const lensOf = (drafts: DraftStore, over: EditCompiler = compiler): Promise<KitLensView> =>
  readKitLens({ drafts, kits: builtinKits(), compiler: over }, 'shop');

/** A store and a compiler that count what is read and compiled, by path. */
function counted(inner: DraftStore) {
  const reads = new Map<string, number>();
  const drafts: DraftStore = Object.create(inner);
  drafts.readText = (slug, path) => {
    reads.set(path, (reads.get(path) ?? 0) + 1);
    return inner.readText(slug, path);
  };
  const compiles = new Map<string, number>();
  const counting: EditCompiler = Object.create(compiler);
  counting.jsxDev = (text, file) => {
    compiles.set(file, (compiles.get(file) ?? 0) + 1);
    return compiler.jsxDev(text, file);
  };
  return { drafts, reads, compiles, counting };
}

test('a token gap, a token padding, an off-kit colour and a plain button are found', async () => {
  const lens = await lensOf(shop());
  assert.equal(lens.version, 1);
  // The section, the plain div and nothing else say nothing about the kit.
  assert.equal(lens.elements.length, 4);
  const gap = lens.elements.find((each) => each.spacing.some((s) => s.property === 'gap'));
  assert.deepEqual(gap?.spacing, [{ property: 'gap', token: 'space-md', value: '12px' }]);
  const padding = lens.elements.find((each) => each.spacing.some((s) => s.property === 'padding'));
  assert.deepEqual(padding?.spacing, [{ property: 'padding', token: 'space-lg', value: '16px' }]);
  const off = lens.elements.find((each) => each.offKit.length > 0);
  assert.deepEqual(off?.offKit, [{ property: 'background-color', value: '#1a73e8' }]);
  const button = lens.elements.find((each) => each.suggest !== null);
  assert.equal(button?.suggest, 'Button');
  assert.deepEqual([button?.spacing, button?.offKit], [[], []]);
});

test('an element with nothing to say is absent', async () => {
  const lens = await lensOf(
    shop({ [TSX_FILE]: TSX.replace(/ {6}<div className="[a-z]+">.*<\/div>\n/g, '') }),
  );
  assert.deepEqual(
    lens.elements.map((each) => each.suggest),
    ['Button'],
  );
});

test('each source and style file is read and compiled once, however many elements it holds', async () => {
  const boxes = Array.from({ length: 60 }, (_, i) => `      <div className="box">${i}</div>`);
  const tsx = TSX.replace('      <button>', `${boxes.join('\n')}\n      <button>`);
  const { drafts, reads, compiles, counting } = counted(shop({ [TSX_FILE]: tsx }));
  const lens = await lensOf(drafts, counting);
  assert.equal(lens.elements.length, 64);
  assert.equal(reads.get(`v1/${TSX_FILE}`), 1);
  assert.equal(reads.get(`v1/${SCSS_FILE}`), 1);
  assert.equal(compiles.get(TSX_FILE), 1);
});

test('only the latest version is read', async () => {
  const store = shop({ [SCSS_FILE]: scss('#ff0000') });
  addVersion(store, 'shop', NOW);
  store.writeText('shop', `v2/${SCSS_FILE}`, scss('#1a73e8'));
  const lens = await lensOf(store);
  assert.equal(lens.version, 2);
  const off = lens.elements.find((each) => each.offKit.length > 0);
  assert.equal(off?.offKit[0]?.value, '#1a73e8');
});

test('a file that does not compile lists nothing, and no more than 400 elements are answered', async () => {
  const broken = await lensOf(shop({ [TSX_FILE]: 'export const x = <div' }));
  assert.deepEqual(broken.elements, []);
  const boxes = Array.from({ length: 450 }, (_, i) => `      <div className="box">${i}</div>`);
  const many = await lensOf(
    shop({ [TSX_FILE]: TSX.replace('      <button>', `${boxes.join('\n')}\n      <button>`) }),
  );
  assert.equal(many.elements.length, 400);
});
