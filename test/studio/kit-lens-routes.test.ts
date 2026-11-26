// The Kit lens route (plan 19, task 2): the answer, the latest version only, and the errors the
// structure route has: 404 for a draft that is not there, 500 without the editor.

import assert from 'node:assert/strict';
import { test } from 'node:test';
import { addVersion, createDraft, type DraftStore } from '../../src/drafts/index.ts';
import { createEsbuildCompiler } from '../../src/edit/adapters/esbuild-compiler.ts';
import { PLUGIN_ROOT } from '../../src/shared/index.ts';
import type { EditDeps } from '../../src/studio/api/edit/edit-routes.ts';
import { type KitLens, KitLensSchema } from '../../src/studio/api/edit/kit-lens-schemas.ts';
import { NOW, tempDrafts } from '../helpers/draft/drafts.ts';
import { call, studioOver } from '../helpers/studio/studio.ts';

const BASE = { id: 'base', version: '1.0.0', hash: 'b'.repeat(64) };
const DRAFT = '/api/v1/drafts/shop';

const TSX = [
  'export function Pricing(_props: { state: string }) {',
  '  return (',
  '    <section className="pricing">',
  '      <div className="grid">grid</div>',
  '      <button>Buy</button>',
  '    </section>',
  '  );',
  '}',
  '',
].join('\n');
const scss = (gap: string): string =>
  `.pricing {\n  display: block;\n}\n.grid {\n  display: flex;\n  gap: ${gap};\n}\n`;

type Problem = { code: string };
const json = <T>(text: string): T => JSON.parse(text) as T;

function pricingDrafts(): DraftStore {
  const { store } = tempDrafts();
  createDraft(store, { slug: 'shop', title: 'Shop', kit: BASE, now: NOW });
  store.writeText(
    'shop',
    'v1/md/layout.md',
    '# Layout: Shop\n\n## pricing\nPurpose: Show the plans.\nComponents: Stack\n',
  );
  store.writeText('shop', 'v1/src/tsx/sections/Pricing.tsx', TSX);
  store.writeText('shop', 'v1/src/scss/sections/pricing.scss', scss('var(--kit-space-sm)'));
  return store;
}

async function lensStudio(withEditor = true, drafts: DraftStore = pricingDrafts()) {
  const compiler = createEsbuildCompiler([PLUGIN_ROOT]);
  const edit: EditDeps = { compiler, dispose: () => compiler.dispose() };
  const { studio, errors } = await studioOver(drafts, {}, withEditor ? { edit } : {});
  const headers = { authorization: `Bearer ${studio.token}` };
  const get = (path: string) => call(studio.port, { path, headers });
  return { studio, errors, get };
}

test('the kit lens route answers the spacing, off-kit values and suggestions', async () => {
  const { studio, errors, get } = await lensStudio();
  try {
    const answer = await get(`${DRAFT}/kit-lens`);
    assert.equal(answer.status, 200, answer.text);
    assert.equal(KitLensSchema.safeParse(json<unknown>(answer.text)).success, true);
    const lens = json<KitLens>(answer.text);
    assert.equal(lens.version, 1);
    assert.deepEqual(
      lens.elements.map((each) => [each.spacing, each.suggest]),
      [
        [[{ property: 'gap', token: 'space-sm', value: '8px' }], null],
        [[], 'Button'],
      ],
    );
    const unknown = await get('/api/v1/drafts/nope/kit-lens');
    assert.equal(unknown.status, 404);
    assert.equal(json<Problem>(unknown.text).code, 'DRAFT_NOT_FOUND');
  } finally {
    await studio.close();
  }
  assert.deepEqual(errors, []);
});

test('only the latest version is answered', async () => {
  const store = pricingDrafts();
  addVersion(store, 'shop', NOW);
  store.writeText('shop', 'v2/src/scss/sections/pricing.scss', scss('var(--kit-space-xl)'));
  const { studio, get } = await lensStudio(true, store);
  try {
    const lens = json<KitLens>((await get(`${DRAFT}/kit-lens`)).text);
    assert.equal(lens.version, 2);
    assert.equal(lens.elements[0]?.spacing[0]?.token, 'space-xl');
  } finally {
    await studio.close();
  }
});

test('without the editor the route is 500', async () => {
  const { studio, get } = await lensStudio(false);
  try {
    const answer = await get(`${DRAFT}/kit-lens`);
    assert.equal(answer.status, 500);
    assert.equal(json<Problem>(answer.text).code, 'INTERNAL');
  } finally {
    await studio.close();
  }
});

test('the API document lists the kit lens route', async () => {
  const { studio, get } = await lensStudio();
  try {
    type Doc = { paths: Record<string, Record<string, { operationId: string }>> };
    const { paths } = json<Doc>((await get('/api/v1/openapi.json')).text);
    assert.equal(paths['/api/v1/drafts/{slug}/kit-lens']?.get?.operationId, 'getKitLens');
  } finally {
    await studio.close();
  }
});
