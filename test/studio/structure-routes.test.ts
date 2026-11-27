import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createDraft, type DraftStore } from '../../src/drafts/index.ts';
import { createEsbuildCompiler } from '../../src/edit/adapters/esbuild-compiler.ts';
import { hashOf } from '../../src/edit/index.ts';
import { PLUGIN_ROOT } from '../../src/shared/index.ts';
import type { EditDeps } from '../../src/studio/api/edit/edit-routes.ts';
import {
  type Palette,
  PaletteSchema,
  type Structure,
  StructureSchema,
  type Subtree,
  SubtreeSchema,
} from '../../src/studio/api/edit/structure-schemas.ts';
import { etagOf } from '../../src/studio/http/etag.ts';
import { NOW, tempDrafts } from '../helpers/draft/drafts.ts';
import { call, studioOver } from '../helpers/studio/studio.ts';

const BASE = { id: 'kitvas-ui', version: '1.0.0', hash: 'b'.repeat(64) };
const TSX_FILE = 'src/tsx/sections/Pricing.tsx';
const SECTION = 'sections/Pricing:section';
const CARD = `${SECTION}/Stack/Card`;

const PRICING_TSX = [
  "import { Card, Stack, Text } from '@kit';",
  '',
  "const plans = [{ name: 'Free' }, { name: 'Pro' }];",
  '',
  'export function Pricing(_props: { state: string }) {',
  '  return (',
  '    <section className="pricing">',
  '      <Stack gap="12">',
  '        <Text>Plans</Text>',
  '        {plans.map((plan) => (',
  '          <Card key={plan.name}>',
  '            <Text>{plan.name}</Text>',
  '          </Card>',
  '        ))}',
  '      </Stack>',
  '    </section>',
  '  );',
  '}',
  '',
].join('\n');
const LAYOUT = '# Layout: Shop\n\n## pricing\nPurpose: Show the plans.\nComponents: Stack\n';

const CARD_SOURCE = PRICING_TSX.slice(
  PRICING_TSX.indexOf('<Card key'),
  PRICING_TSX.indexOf('</Card>') + '</Card>'.length,
);

type Problem = { code: string };

const json = <T>(text: string): T => JSON.parse(text) as T;

/** The `shop` draft on the kitvas UI kit with one section, `pricing`, and the draft `landing`. */
function pricingDrafts(): DraftStore {
  const { store } = tempDrafts();
  createDraft(store, { slug: 'shop', title: 'Shop', kit: BASE, now: NOW });
  store.writeText('shop', 'v1/md/layout.md', LAYOUT);
  store.writeText('shop', `v1/${TSX_FILE}`, PRICING_TSX);
  createDraft(store, { slug: 'landing', title: 'Landing', kit: BASE, now: NOW });
  store.writeText(
    'landing',
    'v1/md/layout.md',
    '# Layout: Landing\n\n## hero\nPurpose: Say hello.\nComponents: Heading\n',
  );
  return store;
}

/** A studio over the pricing draft, with the real compiler unless `withEditor` is false. */
async function structureStudio(withEditor = true) {
  const compiler = createEsbuildCompiler([PLUGIN_ROOT]);
  const edit: EditDeps = { compiler, dispose: () => compiler.dispose() };
  // esbuild loads on the first compile, so the compiler left out costs nothing.
  const { studio, errors } = await studioOver(pricingDrafts(), {}, withEditor ? { edit } : {});
  const headers = { authorization: `Bearer ${studio.token}` };
  const get = (path: string) => call(studio.port, { path, headers });
  return { studio, errors, get };
}

const DRAFT = '/api/v1/drafts/shop';

test('the structure route answers every element of the latest version', async () => {
  const { studio, errors, get } = await structureStudio();
  try {
    const answer = await get(`${DRAFT}/structure`);
    assert.equal(answer.status, 200, answer.text);
    assert.equal(StructureSchema.safeParse(json<unknown>(answer.text)).success, true);
    const structure = json<Structure>(answer.text);
    assert.equal(structure.version, 1);
    assert.deepEqual(structure.etags, { [TSX_FILE]: etagOf(PRICING_TSX) });
    const byId = new Map(structure.elements.map((entry) => [entry.id, entry]));
    assert.equal(structure.folder.endsWith('/shop/v1'), true);
    assert.equal(structure.folder.includes('\\'), false);
    // `<section` is on line 7 of the file, after four spaces.
    assert.deepEqual(
      [byId.get(SECTION)?.file, byId.get(SECTION)?.line, byId.get(SECTION)?.column],
      [TSX_FILE, 7, 5],
    );
    assert.equal(byId.get(SECTION)?.root, 'section');
    assert.equal(byId.get(SECTION)?.movable, 'section-root');
    assert.equal(byId.get(`${SECTION}/Stack`)?.accepts, true);
    assert.equal(byId.get(`${SECTION}/Stack`)?.movable, null);
    assert.equal(byId.get(CARD)?.movable, 'in-expression');
    assert.equal(byId.get(CARD)?.hash, hashOf(CARD_SOURCE));
    assert.deepEqual(structure.sections, [
      // The section's own root, read from its file: no build is needed.
      { id: 'pricing', element: 'sections/Pricing:section', purpose: 'Show the plans.' },
    ]);
    const unknown = await get('/api/v1/drafts/nope/structure');
    assert.equal(unknown.status, 404);
    assert.equal(json<Problem>(unknown.text).code, 'DRAFT_NOT_FOUND');
  } finally {
    await studio.close();
  }
  assert.deepEqual(errors, []);
});

test("the palette route answers the kit's components, icons and sections", async () => {
  const { studio, errors, get } = await structureStudio();
  try {
    const answer = await get(`${DRAFT}/palette`);
    assert.equal(answer.status, 200, answer.text);
    assert.equal(PaletteSchema.safeParse(json<unknown>(answer.text)).success, true);
    const palette = json<Palette>(answer.text);
    const button = palette.components.find((component) => component.name === 'Button');
    assert.equal(button?.accepts, true);
    assert.equal(palette.icons?.component, 'Icon');
    assert.deepEqual(palette.sections, [
      { slug: 'landing', section: 'hero', purpose: 'Say hello.' },
    ]);
  } finally {
    await studio.close();
  }
  assert.deepEqual(errors, []);
});

test('the subtree is the exact source; a bad id is 400, a missing one 404', async () => {
  const { studio, errors, get } = await structureStudio();
  try {
    const answer = await get(`${DRAFT}/subtree?id=${encodeURIComponent(CARD)}`);
    assert.equal(answer.status, 200, answer.text);
    assert.equal(SubtreeSchema.safeParse(json<unknown>(answer.text)).success, true);
    assert.deepEqual(json<Subtree>(answer.text), {
      id: CARD,
      file: TSX_FILE,
      hash: hashOf(CARD_SOURCE),
      source: CARD_SOURCE,
    });
    for (const query of ['', '?id=', '?id=nope', `?id=${encodeURIComponent('../x:div')}`]) {
      const bad = await get(`${DRAFT}/subtree${query}`);
      assert.equal(bad.status, 400, query);
      assert.equal(json<Problem>(bad.text).code, 'REQUEST_INVALID', query);
    }
    const gone = await get(`${DRAFT}/subtree?id=${encodeURIComponent(`${SECTION}/Grid`)}`);
    assert.equal(gone.status, 404);
    assert.equal(json<Problem>(gone.text).code, 'EDIT_ELEMENT_NOT_FOUND');
  } finally {
    await studio.close();
  }
  assert.deepEqual(errors, []);
});

test('without the editor only the palette answers; structure and subtree are 500', async () => {
  const { studio, get } = await structureStudio(false);
  try {
    const structure = await get(`${DRAFT}/structure`);
    assert.equal(structure.status, 500);
    assert.equal(json<Problem>(structure.text).code, 'INTERNAL');
    const subtree = await get(`${DRAFT}/subtree?id=${encodeURIComponent(CARD)}`);
    assert.equal(subtree.status, 500);
    assert.equal(json<Problem>(subtree.text).code, 'INTERNAL');
    assert.equal((await get(`${DRAFT}/palette`)).status, 200);
  } finally {
    await studio.close();
  }
});

test('the API document lists the three structure routes', async () => {
  const { studio, get } = await structureStudio();
  try {
    type Doc = { paths: Record<string, Record<string, { operationId: string }>> };
    const { paths } = json<Doc>((await get('/api/v1/openapi.json')).text);
    const base = '/api/v1/drafts/{slug}';
    assert.equal(paths[`${base}/structure`]?.get?.operationId, 'getStructure');
    assert.equal(paths[`${base}/palette`]?.get?.operationId, 'getPalette');
    assert.equal(paths[`${base}/subtree`]?.get?.operationId, 'getSubtree');
  } finally {
    await studio.close();
  }
});
