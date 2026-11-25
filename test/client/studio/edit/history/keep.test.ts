// The undo history kept across a reload (ADR 0061): one entry per draft names its version and
// session, is bounded, is checked for its shape when read back and dropped whole when it does not
// fit, and the editor reads it once the edit state is known and writes it after every change.

import assert from 'node:assert/strict';
import { test } from 'node:test';
import type { StepEntry } from '../../../../../client/studio/edit/history/chips.ts';
import {
  type KeepStorage,
  type Kept,
  keepKey,
  loadKept,
  MAX_ENTRY_CHARS,
  MAX_KEPT_STEPS,
  mountKeep,
  packKept,
  readKept,
  saveKept,
} from '../../../../../client/studio/edit/history/keep.ts';
import {
  isOp,
  OP_FIELDS,
  readChange,
  readGesture,
} from '../../../../../client/studio/edit/history/keep-shape.ts';
import { createStore, type Gesture } from '../../../../../client/studio/edit/store.ts';
import type { EditOp } from '../../../../../src/edit/index.ts';
import type { EditState } from '../../../../../src/studio/api/edit/edit-schemas.ts';

const SLUG = 'pricing';
const SESSION = { version: 4, startedAt: '2026-11-24T09:00:00.000Z' };
const ID = 'sections/Hero:section/h1';
const TSX = 'src/tsx/sections/Hero.tsx';

/** The owner's typo: a letter typed into a heading by accident. */
const typed: Gesture = {
  ops: [{ op: 'setText', id: ID, value: 'Plans for your teamc', before: 'Plans for your team' }],
  label: 'Change text',
  undoOps: [
    { op: 'setText', id: ID, value: 'Plans for your team', before: 'Plans for your teamc' },
  ],
};
const moved: Gesture = {
  ops: [{ op: 'moveElement', id: ID, anchor: 'sections/Hero:section/p', place: 'after' }],
  label: 'Move',
  undoOps: [{ op: 'patch', file: TSX, hunks: [{ find: 'b', replace: 'a' }] }],
  renames: { [ID]: 'sections/Hero:section/h1.2' },
};
const styled: Gesture = {
  ops: [
    {
      op: 'setStyle',
      id: ID,
      className: 'hero-title',
      property: 'color',
      value: { token: '--kit-color-ink-mid' },
      before: { raw: '#999', mark: false },
      newRule: false,
      context: { width: 768, state: 'hover' },
      newBlock: true,
    },
  ],
  label: 'Raise the text contrast',
  flash: true,
};
const line: StepEntry = {
  by: 'person',
  id: ID,
  label: 'Change text',
  files: [],
  offKit: false,
  at: 1_000,
  chips: [{ kind: 'text', name: '', before: 'Plans for your team', after: 'Plans for your teamc' }],
};
const claude: StepEntry = {
  by: 'claude',
  id: null,
  label: 'Edited the code',
  files: [TSX],
  offKit: false,
  at: 2_000,
};

const kept: Kept = { undo: [typed, moved], redo: [styled], changes: [line, claude] };

/** A storage in memory, or one that refuses every write (a full or blocked store). */
function memory(start: Record<string, string> = {}): KeepStorage & { data: Map<string, string> } {
  const data = new Map(Object.entries(start));
  return {
    data,
    getItem: (key) => data.get(key) ?? null,
    setItem: (key, value) => {
      data.set(key, value);
    },
    removeItem: (key) => {
      data.delete(key);
    },
  };
}

const editState = (session: typeof SESSION | null): EditState => ({
  slug: SLUG,
  version: session?.version ?? 3,
  session,
  format: 'scss',
  etags: {},
  tokens: [],
});

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

/** A kept entry as an object, to break one part of it. */
function entryOf(text: string): Record<string, unknown> {
  const read = JSON.parse(text);
  assert.ok(isRecord(read));
  return read;
}

/** Lets the microtasks of a read and a write run. */
const tick = (): Promise<void> => new Promise((resolve) => setImmediate(resolve));

const packed = (session = SESSION, lists: Kept = kept): string => {
  const text = packKept(SLUG, session, lists);
  assert.ok(text !== null);
  return text;
};

test('the lists of a session come back as they were kept, renames and all', () => {
  assert.deepEqual(readKept(packed(), SLUG, SESSION), kept);
});

test('another session, version, draft or format starts empty', () => {
  const text = packed();
  assert.equal(readKept(text, SLUG, { ...SESSION, startedAt: '2026-11-24T10:00:00.000Z' }), null);
  assert.equal(readKept(text, SLUG, { ...SESSION, version: 5 }), null);
  assert.equal(readKept(text, 'other', SESSION), null);
  assert.equal(readKept(text, SLUG, null), null);
  const later = JSON.stringify({ ...entryOf(text), v: 2 });
  assert.equal(readKept(later, SLUG, SESSION), null);
  // Nothing open, or nothing to keep: no entry.
  assert.equal(packKept(SLUG, null, kept), null);
  assert.equal(packKept(SLUG, SESSION, { undo: [], redo: [], changes: [] }), null);
});

test('a broken stored value is dropped whole, and its entry goes', () => {
  const entry = entryOf(packed());
  const broken = [
    '{not json',
    JSON.stringify({ ...entry, undo: [{ ...typed, ops: [{ op: 'setText', id: ID, value: 3 }] }] }),
    JSON.stringify({ ...entry, redo: [{ ops: [{ op: 'teleport', id: ID }], label: 'Teleport' }] }),
    JSON.stringify({ ...entry, undo: [{ ...moved, renames: { [ID]: 7 } }] }),
    JSON.stringify({ ...entry, changes: [{ ...line, chips: [{ kind: 'colour', name: 'x' }] }] }),
    JSON.stringify({ ...entry, changes: 'none' }),
  ];
  for (const raw of broken) {
    assert.equal(readKept(raw, SLUG, SESSION), null, raw.slice(0, 80));
    const storage = memory({ [keepKey(SLUG)]: raw });
    assert.equal(loadKept(storage, SLUG, SESSION), null);
    assert.equal(storage.data.has(keepKey(SLUG)), false);
  }
});

test('each list keeps its newest steps', () => {
  const many = Array.from({ length: MAX_KEPT_STEPS + 50 }, (_, at) => ({
    ...typed,
    label: `${at}`,
  }));
  const back = readKept(packed(SESSION, { undo: many, redo: [], changes: [] }), SLUG, SESSION);
  assert.equal(back?.undo.length, MAX_KEPT_STEPS);
  assert.equal(back?.undo[0]?.label, '50');
  assert.equal(back?.undo.at(-1)?.label, `${MAX_KEPT_STEPS + 49}`);
});

test('one step larger than the limit keeps nothing, and the old entry goes', () => {
  const huge: Gesture = {
    ops: [{ op: 'setText', id: ID, value: 'x'.repeat(MAX_ENTRY_CHARS), before: '' }],
    label: 'Paste',
  };
  const lists = { undo: [typed, huge], redo: [], changes: [] };
  assert.equal(packKept(SLUG, SESSION, lists), null);
  const storage = memory({ [keepKey(SLUG)]: packed() });
  saveKept(storage, SLUG, SESSION, lists);
  assert.equal(storage.data.has(keepKey(SLUG)), false);
});

test('a store that refuses the write loses the entry, so a reload never brings back older stacks', () => {
  const storage = memory({ [keepKey(SLUG)]: packed() });
  const full: KeepStorage = {
    ...storage,
    setItem: () => {
      throw new Error('QuotaExceededError');
    },
  };
  saveKept(full, SLUG, SESSION, { ...kept, undo: [typed] });
  assert.equal(storage.data.has(keepKey(SLUG)), false);
});

test('every op kind has its fields checked', () => {
  const kinds: Record<EditOp['op'], true> = {
    setProp: true,
    removeProp: true,
    setText: true,
    setStyle: true,
    removeStyle: true,
    setUtility: true,
    addClass: true,
    removeClass: true,
    moveElement: true,
    insertElement: true,
    removeElement: true,
    wrapElements: true,
    unwrapElement: true,
    replaceTag: true,
    replaceElement: true,
    resetElement: true,
    moveSection: true,
    insertSection: true,
    removeSection: true,
    moveItem: true,
    duplicateItem: true,
    removeItem: true,
    setItemText: true,
    addItemClass: true,
    patch: true,
    file: true,
  };
  assert.deepEqual(Object.keys(OP_FIELDS).sort(), Object.keys(kinds).sort());
  // A field the table does not name is kept as it is.
  const extra = { op: 'setItemText', id: ID, item: 1, value: 'a', before: 'b', path: [0, 1] };
  assert.equal(isOp(extra), true);
  assert.deepEqual(readGesture({ ops: [extra], label: 'Edit' })?.ops, [extra]);
  assert.equal(isOp({ op: 'moveItem', id: ID, item: -1, to: 0 }), false);
  // A list op with the copy's path (ADR 0065): the paths are places, at most eight deep.
  const across = { op: 'moveItem', id: ID, item: 0, to: 1, path: [2, 0], toPath: [0, 1] };
  assert.equal(isOp(across), true);
  assert.deepEqual(readGesture({ ops: [across], label: 'Move' })?.ops, [across]);
  assert.equal(isOp({ op: 'duplicateItem', id: ID, item: 1, path: [1, 1] }), true);
  assert.equal(isOp({ op: 'removeItem', id: ID, item: 1, path: [1, 1] }), true);
  assert.equal(isOp({ ...across, toPath: [0, -1] }), false);
  assert.equal(isOp({ ...across, path: '2,0' }), false);
  assert.equal(isOp({ op: 'removeItem', id: ID, item: 1, path: [0, 1.5] }), false);
  const deep = Array.from({ length: 9 }, () => 0);
  assert.equal(isOp({ op: 'duplicateItem', id: ID, item: 0, path: deep }), false);
  assert.equal(readChange({ ...claude, by: 'someone' }), null);
});

test('a kept "This item" step keeps its copy, and a copy that is no place drops the step', () => {
  const own = { op: 'addItemClass', id: ID, path: [1], className: 'plans__card--pro' };
  assert.equal(isOp(own), true);
  assert.equal(isOp({ ...own, path: undefined }), false);
  assert.equal(readGesture({ ops: [own], label: 'Edit', item: 1 })?.item, 1);
  assert.equal(readGesture({ ops: [own], label: 'Edit' })?.item, undefined);
  assert.equal(readGesture({ ops: [own], label: 'Edit', item: -1 }), null);
  assert.equal(readGesture({ ops: [own], label: 'Edit', item: '1' }), null);
});

test('the editor reads the kept history once the edit state is known', async () => {
  const storage = memory({ [keepKey(SLUG)]: packed() });
  const store = createStore(SLUG);
  mountKeep({ slug: SLUG, store }, storage);
  await tick();
  assert.deepEqual(store.get().undo, [], 'nothing is read before the session is known');
  store.set({ edit: editState(SESSION) });
  await tick();
  assert.deepEqual(store.get().undo, kept.undo);
  assert.deepEqual(store.get().redo, kept.redo);
  assert.deepEqual(store.get().changes, kept.changes);
});

test('a kept history of another session is not read back, and its entry goes', async () => {
  const storage = memory({ [keepKey(SLUG)]: packed() });
  const store = createStore(SLUG);
  mountKeep({ slug: SLUG, store }, storage);
  store.set({ edit: editState({ version: 5, startedAt: '2026-11-24T11:00:00.000Z' }) });
  await tick();
  assert.deepEqual(store.get().undo, []);
  assert.equal(storage.data.has(keepKey(SLUG)), false);
});

test('every change is written; Save version removes the entry and Undo save writes it again', async () => {
  const storage = memory();
  const store = createStore(SLUG);
  mountKeep({ slug: SLUG, store }, storage);
  store.set({ edit: editState(SESSION) });
  await tick();
  store.set({ undo: [typed], changes: [line] });
  await tick();
  const read = (): Kept | null => readKept(storage.data.get(keepKey(SLUG)) ?? null, SLUG, SESSION);
  assert.deepEqual(read(), { undo: [typed], redo: [], changes: [line] });
  // Save version: the session ends, and the stacks with it.
  store.set({ edit: editState(null), undo: [], redo: [] });
  await tick();
  assert.equal(storage.data.has(keepKey(SLUG)), false);
  // Undo save: the same session, with its stacks and its lines.
  store.set({ edit: editState(SESSION), undo: [typed] });
  await tick();
  assert.deepEqual(read(), { undo: [typed], redo: [], changes: [line] });
});

test('a new session keeps only its own lines of the change list', async () => {
  const storage = memory();
  const store = createStore(SLUG);
  mountKeep({ slug: SLUG, store }, storage);
  store.set({ edit: editState(null), changes: [claude] });
  await tick();
  // The first edit starts the session and adds its line in the same change of the store.
  store.set({ edit: editState(SESSION), undo: [typed], changes: [claude, line] });
  await tick();
  const back = readKept(storage.data.get(keepKey(SLUG)) ?? null, SLUG, SESSION);
  assert.deepEqual(back?.changes, [line]);
});
