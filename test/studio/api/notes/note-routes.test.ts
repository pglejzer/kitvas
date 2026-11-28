import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createDraft, type DraftStore, readNotes } from '../../../../src/drafts/index.ts';
import { createEsbuildCompiler } from '../../../../src/edit/adapters/esbuild-compiler.ts';
import { PLUGIN_ROOT } from '../../../../src/shared/index.ts';
import type { EditDeps } from '../../../../src/studio/api/edit/edit-routes.ts';
import type { NoteView } from '../../../../src/studio/api/notes/note-schemas.ts';
import { NOW, tempDrafts } from '../../../helpers/draft/drafts.ts';
import { call, studioOver } from '../../../helpers/studio/studio.ts';

const BASE = { id: 'kitvas-ui', version: '1.1.0', hash: 'b'.repeat(64) };
const TSX_FILE = 'src/tsx/sections/Pricing.tsx';
const TEXT = 'sections/Pricing:section/Stack/Text';

const pricing = (child: string): string =>
  [
    "import { Stack, Text } from '@kit';",
    '',
    'export function Pricing(_props: { state: string }) {',
    '  return (',
    '    <section className="pricing">',
    '      <Stack gap="12">',
    `        ${child}`,
    '      </Stack>',
    '    </section>',
    '  );',
    '}',
    '',
  ].join('\n');

const json = <T>(text: string): T => JSON.parse(text) as T;
type Notes = { notes: NoteView[]; created?: string };

function pricingDrafts(): DraftStore {
  const { store } = tempDrafts();
  createDraft(store, { slug: 'shop', title: 'Shop', kit: BASE, now: NOW });
  store.writeText('shop', 'v1/md/layout.md', '# Layout: Shop\n\n## pricing\nPurpose: Plans.\n');
  store.writeText('shop', `v1/${TSX_FILE}`, pricing('<Text>Plans</Text>'));
  return store;
}

async function noteStudio() {
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

const NOTES = '/api/v1/drafts/shop/notes';

test('a note is added, changed, marked done and deleted, and never written into a source', async () => {
  const { drafts, studio, errors, get, post } = await noteStudio();
  try {
    const made = await post(NOTES, { element: TEXT, text: '  Bigger, please  ', for: 'claude' });
    assert.equal(made.status, 201, made.text);
    const { notes, created } = json<Notes>(made.text);
    assert.equal(typeof created, 'string');
    assert.deepEqual(
      notes.map((note) => [note.id, note.element, note.current, note.text, note.for, note.done]),
      [[created, TEXT, TEXT, 'Bigger, please', 'claude', false]],
    );
    assert.deepEqual(json<Notes>((await get(NOTES)).text).notes, notes);

    const id = created ?? '';
    const changed = json<Notes>((await post(`${NOTES}/${id}`, { text: 'Smaller' })).text);
    assert.equal(changed.notes[0]?.text, 'Smaller');
    const done = json<Notes>((await post(`${NOTES}/${id}`, { done: true })).text);
    assert.equal(done.notes[0]?.done, true);
    // The source file is as it was: a note lives in notes.json only.
    assert.equal(drafts.readText('shop', `v1/${TSX_FILE}`), pricing('<Text>Plans</Text>'));
    assert.equal(readNotes(drafts, 'shop').notes.length, 1);

    const removed = await post(`${NOTES}/${id}/delete`, {});
    assert.deepEqual(json<Notes>(removed.text).notes, []);
    const again = await post(`${NOTES}/${id}/delete`, {});
    assert.equal(again.status, 404, again.text);
    assert.equal(json<{ code: string }>(again.text).code, 'NOTE_NOT_FOUND');
  } finally {
    await studio.close();
  }
  assert.deepEqual(errors, []);
});

test('a note on an element another writer took away is unpinned, with its old place', async () => {
  const { drafts, studio, errors, get, post } = await noteStudio();
  try {
    await post(NOTES, { element: TEXT, text: 'Check the price', for: 'me' });
    await post(NOTES, { element: null, text: 'On the whole page', for: 'me' });
    drafts.writeText('shop', `v1/${TSX_FILE}`, pricing('<p>Gone</p>'));
    const { notes } = json<Notes>((await get(NOTES)).text);
    assert.deepEqual(
      notes.map((note) => [note.element, note.current]),
      [
        [TEXT, null],
        [null, null],
      ],
    );
    const empty = await post(NOTES, { element: null, text: '   ', for: 'me' });
    assert.equal(empty.status, 422, empty.text);
  } finally {
    await studio.close();
  }
  assert.deepEqual(errors, []);
});
