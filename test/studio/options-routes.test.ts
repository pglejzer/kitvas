import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  addVersion,
  createDraft,
  type DraftStore,
  loadDraft,
  readOptions,
} from '../../src/drafts/index.ts';
import { hashOf } from '../../src/edit/index.ts';
import { type EditOutcome, EditOutcomeSchema } from '../../src/studio/api/edit/edit-schemas.ts';
import { etagOf } from '../../src/studio/http/etag.ts';
import { NOW, tempDrafts } from '../helpers/draft/drafts.ts';
import { call, studioOver } from '../helpers/studio/studio.ts';

const BASE = { id: 'base', version: '1.0.0', hash: 'b'.repeat(64) };
const FILE = 'src/json/options.json';
const OPTIONS = `{
  "schemaVersion": 1,
  "options": [
    {
      "id": "columns",
      "label": "Columns",
      "default": "3",
      "values": [{ "id": "3", "label": "3" }, { "id": "2", "label": "2" }]
    },
    {
      "id": "cards",
      "label": "Cards",
      "default": "outlined",
      "values": [{ "id": "outlined", "label": "Outlined" }, { "id": "filled", "label": "Filled" }]
    }
  ]
}
`;

type Problem = { code: string };
const json = <T>(text: string): T => JSON.parse(text) as T;
const URL_PATH = '/api/v1/drafts/shop/options/default';

/** The `shop` draft with two options in its first version. */
function optionDrafts(): DraftStore {
  const { store } = tempDrafts();
  createDraft(store, { slug: 'shop', title: 'Shop', kit: BASE, now: NOW });
  store.writeText('shop', `v1/${FILE}`, OPTIONS);
  return store;
}

async function optionsStudio(drafts: DraftStore = optionDrafts()) {
  const { studio, errors } = await studioOver(drafts);
  const auth = { authorization: `Bearer ${studio.token}` };
  const write = { ...auth, origin: studio.url, 'content-type': 'application/json' };
  const post = (body: unknown) =>
    call(studio.port, {
      method: 'POST',
      path: URL_PATH,
      headers: write,
      body: JSON.stringify(body),
    });
  return { drafts, studio, errors, post };
}

const defaultsOf = (drafts: DraftStore, version: number) =>
  Object.fromEntries(
    readOptions(drafts, 'shop', `v${version}`).map((one) => [one.id, one.default]),
  );

test('Make default starts a version, writes the defaults and answers the exact inverse', async () => {
  const { drafts, studio, errors, post } = await optionsStudio();
  try {
    const answer = await post({ version: 1, choice: { columns: '2', cards: 'outlined' } });
    assert.equal(answer.status, 200, answer.text);
    assert.equal(EditOutcomeSchema.safeParse(json<unknown>(answer.text)).success, true);
    const outcome = json<Extract<EditOutcome, { outcome: 'applied' }>>(answer.text);
    assert.equal(outcome.outcome, 'applied');
    assert.equal(outcome.version, 2);
    assert.equal(outcome.started, true);
    const after = drafts.readText('shop', `v2/${FILE}`) ?? '';
    assert.deepEqual(defaultsOf(drafts, 2), { columns: '2', cards: 'outlined' });
    assert.deepEqual(outcome.etags, { [FILE]: etagOf(after) });
    // Only the one `default` changed; the first version is as it was.
    assert.equal(after, OPTIONS.replace('"default": "3"', '"default": "2"'));
    assert.equal(drafts.readText('shop', `v1/${FILE}`), OPTIONS);
    // The inverse puts the file back, byte for byte: its text, and the hash of what it replaces.
    assert.deepEqual(outcome.inverse, [
      { op: 'file', file: FILE, text: OPTIONS, before: hashOf(after) },
    ]);
  } finally {
    await studio.close();
  }
  assert.deepEqual(errors, []);
});

test('a second Make default in the open session writes into the same version', async () => {
  const { drafts, studio, post } = await optionsStudio();
  try {
    await post({ version: 1, choice: { columns: '2' } });
    const again = await post({ version: 2, choice: { columns: '2', cards: 'filled' } });
    assert.equal(again.status, 200, again.text);
    const outcome = json<Extract<EditOutcome, { outcome: 'applied' }>>(again.text);
    assert.equal(outcome.version, 2);
    assert.equal(outcome.started, false);
    assert.deepEqual(defaultsOf(drafts, 2), { columns: '2', cards: 'filled' });
    assert.equal(loadDraft(drafts, 'shop').versions.length, 2);
  } finally {
    await studio.close();
  }
});

test('values that are the defaults already write nothing and start no version', async () => {
  const { drafts, studio, post } = await optionsStudio();
  try {
    const answer = await post({ version: 1, choice: { columns: '3', cards: 'outlined' } });
    assert.equal(answer.status, 200, answer.text);
    const outcome = json<Extract<EditOutcome, { outcome: 'applied' }>>(answer.text);
    assert.deepEqual(
      [outcome.version, outcome.started, outcome.inverse, outcome.etags],
      [1, false, [], {}],
    );
    assert.equal(loadDraft(drafts, 'shop').versions.length, 1);
    assert.equal(drafts.readText('shop', `v1/${FILE}`), OPTIONS);
  } finally {
    await studio.close();
  }
});

test('a version that is not the latest is refused as stale, and nothing is written', async () => {
  const drafts = optionDrafts();
  addVersion(drafts, 'shop', NOW);
  const { studio, post } = await optionsStudio(drafts);
  try {
    const answer = await post({ version: 1, choice: { columns: '2' } });
    assert.equal(answer.status, 409);
    assert.equal(json<Problem>(answer.text).code, 'EDIT_STALE_VERSION');
    assert.equal(drafts.readText('shop', `v1/${FILE}`), OPTIONS);
  } finally {
    await studio.close();
  }
});

test('a version without options is refused, and a body that is no choice is refused as invalid', async () => {
  const { store } = tempDrafts();
  createDraft(store, { slug: 'shop', title: 'Shop', kit: BASE, now: NOW });
  const { studio, post } = await optionsStudio(store);
  try {
    const none = await post({ version: 1, choice: { columns: '2' } });
    assert.equal(none.status >= 400, true);
    assert.equal(json<Problem>(none.text).code, 'DRAFT_INVALID');
    assert.equal(loadDraft(store, 'shop').versions.length, 1);
    for (const body of [
      { version: 1, choice: { Columns: '2' } },
      { version: 1, choice: { columns: '' } },
      { version: 0, choice: {} },
      { version: 1 },
    ]) {
      const bad = await post(body);
      assert.equal(bad.status, 422, JSON.stringify(body));
    }
  } finally {
    await studio.close();
  }
});

test('a value or an option the version lacks is not written', async () => {
  const { drafts, studio, post } = await optionsStudio();
  try {
    const answer = await post({
      version: 1,
      choice: { columns: '9', size: 'big', cards: 'filled' },
    });
    assert.equal(answer.status, 200, answer.text);
    assert.deepEqual(defaultsOf(drafts, 2), { columns: '3', cards: 'filled' });
  } finally {
    await studio.close();
  }
});

test('the route is in the API document', async () => {
  const { studio } = await optionsStudio();
  try {
    const auth = { authorization: `Bearer ${studio.token}` };
    const doc = await call(studio.port, { path: '/api/v1/openapi.json', headers: auth });
    type Doc = { paths: Record<string, Record<string, { operationId: string }>> };
    const { paths } = json<Doc>(doc.text);
    assert.equal(
      paths['/api/v1/drafts/{slug}/options/default']?.post?.operationId,
      'makeOptionsDefault',
    );
  } finally {
    await studio.close();
  }
});
