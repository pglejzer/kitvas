import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createDraft, type DraftStore, readView } from '../../../../src/drafts/index.ts';
import { createEsbuildCompiler } from '../../../../src/edit/adapters/esbuild-compiler.ts';
import { hashOf } from '../../../../src/edit/index.ts';
import { PLUGIN_ROOT } from '../../../../src/shared/index.ts';
import type { EditDeps } from '../../../../src/studio/api/edit/edit-routes.ts';
import { NOW, tempDrafts } from '../../../helpers/draft/drafts.ts';
import { call, studioOver } from '../../../helpers/studio/studio.ts';

const BASE = { id: 'kitvas-ui', version: '1.0.0', hash: 'b'.repeat(64) };
const TSX_FILE = 'src/tsx/sections/Pricing.tsx';
const STACK = 'sections/Pricing:section/Stack';
const TEXT = 'sections/Pricing:section/Stack/Text';

const pricing = (text: string): string =>
  [
    "import { Stack, Text } from '@kit';",
    '',
    'export function Pricing(_props: { state: string }) {',
    '  return (',
    '    <section className="pricing">',
    '      <Stack gap="12">',
    `        ${text}`,
    '      </Stack>',
    '    </section>',
    '  );',
    '}',
    '',
  ].join('\n');

type View = { locked: string[]; hidden: string[]; changed: string[]; lost: string[] };
type Preview = {
  file: string;
  old: string;
  current: string;
  missing: string[];
  imports: string[];
  ops: unknown[] | null;
};
const json = <T>(text: string): T => JSON.parse(text) as T;

function pricingDrafts(): DraftStore {
  const { store } = tempDrafts();
  createDraft(store, { slug: 'shop', title: 'Shop', kit: BASE, now: NOW });
  store.writeText('shop', 'v1/md/layout.md', '# Layout: Shop\n\n## pricing\nPurpose: Plans.\n');
  store.writeText('shop', `v1/${TSX_FILE}`, pricing('<Text>Plans</Text>'));
  store.writeText('shop', 'v1/src/scss/sections/pricing.scss', '.pricing {\n  margin: 0;\n}\n');
  return store;
}

async function viewStudio() {
  const drafts = pricingDrafts();
  const compiler = createEsbuildCompiler([PLUGIN_ROOT]);
  const edit: EditDeps = { compiler, dispose: () => compiler.dispose() };
  const { studio, errors } = await studioOver(drafts, {}, { edit });
  const auth = { authorization: `Bearer ${studio.token}` };
  const write = { ...auth, origin: studio.url, 'content-type': 'application/json' };
  const get = (path: string) => call(studio.port, { path, headers: auth });
  const post = (path: string, body: unknown) =>
    call(studio.port, { method: 'POST', path, headers: write, body: JSON.stringify(body) });
  return { drafts, studio, errors, get, post };
}

const VIEW = '/api/v1/drafts/shop/view';

test('the view keeps both lists, a lock with the source its element has now', async () => {
  const { drafts, studio, errors, get, post } = await viewStudio();
  try {
    assert.deepEqual(json<View>((await get(VIEW)).text), {
      locked: [],
      hidden: [],
      changed: [],
      lost: [],
    });
    const saved = await post(VIEW, {
      locked: [TEXT, 'sections/Pricing:section/Nothing'],
      hidden: [STACK],
    });
    assert.equal(saved.status, 200, saved.text);
    // An id with no element is not locked: there is nothing to keep.
    assert.deepEqual(json<View>(saved.text), {
      locked: [TEXT],
      hidden: [STACK],
      changed: [],
      lost: [],
    });
    const [lock] = readView(drafts, 'shop').locked;
    assert.equal(lock?.text, '<Text>Plans</Text>');
    assert.equal(lock?.file, TSX_FILE);
    // Saving again keeps the text the lock was made with.
    drafts.writeText('shop', `v1/${TSX_FILE}`, pricing('<Text>Prices</Text>'));
    await post(VIEW, { locked: [TEXT], hidden: [] });
    assert.equal(readView(drafts, 'shop').locked[0]?.text, '<Text>Plans</Text>');
  } finally {
    await studio.close();
  }
  assert.deepEqual(errors, []);
});

test('a lock another writer changed is told, and Restore answers the edit that puts it back', async () => {
  const { drafts, studio, errors, get, post } = await viewStudio();
  try {
    await post(VIEW, { locked: [TEXT], hidden: [] });
    const rewritten = '<Text>Cheap plans</Text>';
    drafts.writeText('shop', `v1/${TSX_FILE}`, pricing(rewritten));
    assert.deepEqual(json<View>((await get(VIEW)).text).changed, [TEXT]);

    const answer = await post(`${VIEW}/restore`, { id: TEXT });
    assert.equal(answer.status, 200, answer.text);
    const preview = json<Preview>(answer.text);
    assert.deepEqual(preview, {
      file: TSX_FILE,
      old: '<Text>Plans</Text>',
      current: rewritten,
      missing: [],
      imports: [],
      ops: [
        {
          op: 'replaceElement',
          id: TEXT,
          source: '<Text>Plans</Text>',
          hash: hashOf(rewritten),
        },
      ],
    });
    const unknown = await post(`${VIEW}/restore`, { id: STACK });
    assert.equal(unknown.status, 404, unknown.text);
    assert.equal(json<{ code: string }>(unknown.text).code, 'EDIT_ELEMENT_NOT_FOUND');
  } finally {
    await studio.close();
  }
  assert.deepEqual(errors, []);
});

test('a lock whose element another writer took away is lost until the editor drops it', async () => {
  const { drafts, studio, errors, get, post } = await viewStudio();
  try {
    await post(VIEW, { locked: [TEXT], hidden: [] });
    drafts.writeText('shop', `v1/${TSX_FILE}`, pricing('<p>Gone</p>'));
    const view = json<View>((await get(VIEW)).text);
    assert.deepEqual([view.locked, view.lost], [[], [TEXT]]);
    // The editor still lists it: the lock stays, lost.
    await post(VIEW, { locked: [TEXT], hidden: [] });
    assert.deepEqual(json<View>((await get(VIEW)).text).lost, [TEXT]);
    // Forgotten: the editor lists it no more.
    await post(VIEW, { locked: [], hidden: [] });
    assert.deepEqual(readView(drafts, 'shop').locked, []);
  } finally {
    await studio.close();
  }
  assert.deepEqual(errors, []);
});
