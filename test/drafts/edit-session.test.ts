import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  addVersion,
  DraftSchema,
  editSession,
  endEditSession,
  loadDraft,
  reopenEditSession,
  startEditSession,
} from '../../src/drafts/index.ts';
import { NOW, shopDraft } from '../helpers/drafts.ts';

const LATER = new Date('2026-11-23T09:00:00.000Z');
const HERO = 'export const Hero = () => null;\n';

test('a new draft has no editing session', () => {
  const { store } = shopDraft();
  assert.equal(editSession(loadDraft(store, 'shop')), null);
});

test('starting a session adds the next version and opens the session in it', () => {
  const { store } = shopDraft();
  store.writeText('shop', 'v1/src/tsx/sections/Hero.tsx', HERO);
  assert.equal(startEditSession(store, 'shop', LATER), 2);
  const draft = loadDraft(store, 'shop');
  assert.deepEqual(draft.edit, { version: 2, startedAt: '2026-11-23T09:00:00.000Z' });
  assert.deepEqual(editSession(draft), { version: 2, startedAt: '2026-11-23T09:00:00.000Z' });
  assert.deepEqual(
    draft.versions.map((version) => version.number),
    [1, 2],
  );
  assert.equal(store.readText('shop', 'v2/src/tsx/sections/Hero.tsx'), HERO);
});

test('a newer version started by anyone ends the session', () => {
  const { store } = shopDraft();
  startEditSession(store, 'shop', LATER);
  addVersion(store, 'shop', LATER);
  const draft = loadDraft(store, 'shop');
  assert.equal(draft.edit?.version, 2);
  assert.equal(editSession(draft), null);
});

test('Save version ends an open session, and the next start makes a new version', () => {
  const { store } = shopDraft();
  startEditSession(store, 'shop', LATER);
  assert.deepEqual(endEditSession(store, 'shop'), { version: 2, ended: true });
  const draft = loadDraft(store, 'shop');
  assert.equal(draft.edit, undefined);
  assert.equal(editSession(draft), null);
  assert.equal(startEditSession(store, 'shop', LATER), 3);
});

test('Save version without a session leaves draft.json as it was', () => {
  const { store } = shopDraft();
  const before = store.readText('shop', 'draft.json');
  assert.deepEqual(endEditSession(store, 'shop'), { version: 1, ended: false });
  assert.equal(store.readText('shop', 'draft.json'), before);
});

test('Save version after a newer version clears the session that version ended', () => {
  const { store } = shopDraft();
  startEditSession(store, 'shop', LATER);
  addVersion(store, 'shop', LATER);
  assert.deepEqual(endEditSession(store, 'shop'), { version: 3, ended: false });
  assert.equal(loadDraft(store, 'shop').edit, undefined);
});

test('Undo save opens the ended session again while its version is the latest', () => {
  const { store } = shopDraft();
  startEditSession(store, 'shop', LATER);
  const session = editSession(loadDraft(store, 'shop'));
  assert.ok(session);
  endEditSession(store, 'shop');
  assert.equal(editSession(loadDraft(store, 'shop')), null);
  assert.deepEqual(reopenEditSession(store, 'shop', session), { version: 2, reopened: true });
  assert.deepEqual(editSession(loadDraft(store, 'shop')), session);
  // The next edit goes into version 2 again: no version was added.
  assert.deepEqual(
    loadDraft(store, 'shop').versions.map((version) => version.number),
    [1, 2],
  );
});

test('Undo save is refused, and writes nothing, after a newer version was started', () => {
  const { store } = shopDraft();
  startEditSession(store, 'shop', LATER);
  const session = editSession(loadDraft(store, 'shop'));
  assert.ok(session);
  endEditSession(store, 'shop');
  addVersion(store, 'shop', LATER);
  const before = store.readText('shop', 'draft.json');
  assert.deepEqual(reopenEditSession(store, 'shop', session), { version: 3, reopened: false });
  assert.equal(store.readText('shop', 'draft.json'), before);
});

test('Undo save is refused when another session is already open', () => {
  const { store } = shopDraft();
  startEditSession(store, 'shop', LATER);
  const open = editSession(loadDraft(store, 'shop'));
  assert.ok(open);
  const before = store.readText('shop', 'draft.json');
  const other = { version: 2, startedAt: '2026-11-24T10:00:00.000Z' };
  assert.deepEqual(reopenEditSession(store, 'shop', other), { version: 2, reopened: false });
  assert.equal(store.readText('shop', 'draft.json'), before);
});

test('draft.json takes an edit block only in its own shape', () => {
  const { store } = shopDraft();
  const draft = loadDraft(store, 'shop');
  const good = { ...draft, edit: { version: 1, startedAt: NOW.toISOString() } };
  assert.equal(DraftSchema.safeParse(good).success, true);
  for (const edit of [
    { version: 0, startedAt: NOW.toISOString() },
    { version: 1, startedAt: '' },
    { version: 1, startedAt: NOW.toISOString(), by: 'claude' },
  ]) {
    assert.equal(DraftSchema.safeParse({ ...draft, edit }).success, false, JSON.stringify(edit));
  }
});
