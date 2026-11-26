import assert from 'node:assert/strict';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { test } from 'node:test';
import { addVersion, createDraft, loadDraft } from '../../../src/drafts/index.ts';
import { KitvasError } from '../../../src/shared/index.ts';
import { NOW, TINY, tempDrafts } from '../../helpers/draft/drafts.ts';

const hasCode = (code: string) => (error: unknown) =>
  error instanceof KitvasError && error.code === code;

const CRAFT = { subject: 'icon', name: 'Basket', description: 'A shopping basket' } as const;

const sketchFile = (root: string, slug: string, version: number, sketch: string) =>
  join(root, slug, `v${version}`, 'src', 'tsx', 'sketches', `${sketch}.tsx`);

test('a screen draft is the default kind and has no kind block', () => {
  const { store } = tempDrafts();
  const draft = createDraft(store, { slug: 'shop', title: 'Shop', kit: TINY, now: NOW });
  assert.equal(draft.kind, 'screen');
  assert.equal(draft.rework, undefined);
  assert.equal(draft.craft, undefined);
  assert.deepEqual(loadDraft(store, 'shop'), draft);
});

test('a rework draft round-trips and still gets brief and layout', () => {
  const { store, root } = tempDrafts();
  const input = { slug: 'again', title: 'Again', kit: TINY, now: NOW };
  const draft = createDraft(store, { ...input, kind: 'rework', rework: { source: 'url' } });
  assert.deepEqual(loadDraft(store, 'again'), draft);
  assert.deepEqual(draft.rework, { source: 'url' });
  assert.ok(existsSync(join(root, 'again', 'v1', 'md', 'brief.md')));
  assert.ok(existsSync(join(root, 'again', 'v1', 'md', 'layout.md')));
});

test('a craft draft round-trips, starts unpicked and has three sketches but no layout', () => {
  const { store, root } = tempDrafts();
  const input = { slug: 'basket', title: 'Basket', kit: TINY, now: NOW };
  const draft = createDraft(store, { ...input, kind: 'craft', craft: CRAFT });
  assert.deepEqual(loadDraft(store, 'basket'), draft);
  assert.deepEqual(draft.craft, { ...CRAFT, picked: null });
  for (const sketch of ['A', 'B', 'C']) {
    assert.ok(existsSync(sketchFile(root, 'basket', 1, sketch)), sketch);
  }
  assert.ok(!existsSync(join(root, 'basket', 'v1', 'md', 'layout.md')));
});

test('a wrong kind and block combination is DRAFT_INVALID', () => {
  const { store } = tempDrafts();
  const input = { slug: 'bad', title: 'Bad', kit: TINY, now: NOW };
  assert.throws(() => createDraft(store, { ...input, kind: 'craft' }), hasCode('DRAFT_INVALID'));
  assert.throws(
    () => createDraft(store, { ...input, kind: 'screen', rework: { source: 'url' } }),
    hasCode('DRAFT_INVALID'),
  );
  assert.throws(
    () => createDraft(store, { ...input, kind: 'rework', craft: CRAFT }),
    hasCode('DRAFT_INVALID'),
  );
  assert.throws(
    () => createDraft(store, { ...input, kind: 'craft', craft: { ...CRAFT, name: 'basket' } }),
    hasCode('DRAFT_INVALID'),
  );
  assert.equal(store.exists('bad'), false);
});

test('an old draft.json with only kind screen parses unchanged', () => {
  const { store, root } = tempDrafts();
  createDraft(store, { slug: 'old', title: 'Old', kit: TINY, now: NOW });
  const file = join(root, 'old', 'draft.json');
  const old = {
    schemaVersion: 1,
    slug: 'old',
    title: 'Old',
    kind: 'screen',
    kit: TINY,
    createdAt: '2026-11-22T10:00:00.000Z',
    versions: [{ number: 1, createdAt: '2026-11-22T10:00:00.000Z' }],
  };
  writeFileSync(file, JSON.stringify(old));
  assert.deepEqual(loadDraft(store, 'old'), old);
});

test('the next version of an unpicked craft draft copies all three sketches', () => {
  const { store, root } = tempDrafts();
  createDraft(store, {
    slug: 'basket',
    title: 'Basket',
    kit: TINY,
    now: NOW,
    kind: 'craft',
    craft: CRAFT,
  });
  assert.deepEqual(addVersion(store, 'basket', NOW), { slug: 'basket', version: 2 });
  for (const sketch of ['A', 'B', 'C']) {
    assert.ok(existsSync(sketchFile(root, 'basket', 2, sketch)), sketch);
  }
});

test('the next version of a picked craft draft holds only the picked sketch', () => {
  const { store, root } = tempDrafts();
  const draft = createDraft(store, {
    slug: 'basket',
    title: 'Basket',
    kit: TINY,
    now: NOW,
    kind: 'craft',
    craft: CRAFT,
  });
  const file = join(root, 'basket', 'draft.json');
  const picked = { ...draft, craft: { ...CRAFT, picked: 'B' } };
  writeFileSync(file, JSON.stringify(picked));
  addVersion(store, 'basket', NOW);
  assert.ok(existsSync(sketchFile(root, 'basket', 2, 'B')));
  assert.ok(!existsSync(sketchFile(root, 'basket', 2, 'A')));
  assert.ok(!existsSync(sketchFile(root, 'basket', 2, 'C')));
  assert.equal(
    readFileSync(sketchFile(root, 'basket', 2, 'B'), 'utf8'),
    readFileSync(sketchFile(root, 'basket', 1, 'B'), 'utf8'),
  );
  assert.ok(existsSync(join(root, 'basket', 'v2', 'md', 'brief.md')));
  assert.ok(existsSync(join(root, 'basket', 'v2', 'src', 'json', 'states.json')));
  assert.equal(loadDraft(store, 'basket').versions.length, 2);
});
