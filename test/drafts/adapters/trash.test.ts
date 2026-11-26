import assert from 'node:assert/strict';
import { existsSync, mkdirSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { test } from 'node:test';
import { createFsDraftStore } from '../../../src/drafts/adapters/fs-draft-store.ts';
import {
  createDraft,
  type DraftStore,
  deleteDraft,
  listDeleted,
  listDrafts,
  loadDraft,
  parseDeletedFile,
  parseTrashEntry,
  purgeAllDeleted,
  purgeDeleted,
  restoreDraft,
  trashEntryName,
  trashStamp,
} from '../../../src/drafts/index.ts';
import { KitvasError } from '../../../src/shared/index.ts';
import { NOW, shopDraft, TINY, tempDrafts } from '../../helpers/draft/drafts.ts';

const hasCode = (code: string) => (error: unknown) =>
  error instanceof KitvasError && error.code === code;

const AT = new Date('2026-11-24T10:15:30.123Z');
const LATER = new Date('2026-11-24T11:00:00.000Z');

/** The folder the store keeps deleted drafts in: beside the drafts folder. */
const trashOf = (root: string): string => join(dirname(root), 'trash');

function add(store: DraftStore, slug: string, title = slug): void {
  createDraft(store, { slug, title, kit: TINY, now: NOW });
}

test('a trash folder name holds a stamp that is safe on Windows, sorts by time and reads back', () => {
  assert.equal(trashStamp(AT), '20261124T101530123Z');
  const entry = trashEntryName('shop', AT);
  assert.equal(entry, 'shop~20261124T101530123Z');
  assert.deepEqual(parseTrashEntry(entry), {
    entry,
    slug: 'shop',
    deletedAt: '2026-11-24T10:15:30.123Z',
  });
  assert.ok(trashEntryName('shop', AT) < trashEntryName('shop', LATER));
  assert.doesNotMatch(entry, /[:<>"/\\|?*]/);
});

test('a name kitvas did not make is no entry', () => {
  const bad = [
    'shop',
    'shop~',
    'Shop~20261124T101530123Z',
    '~20261124T101530123Z',
    'a~b~20261124T101530123Z',
    'shop~20261124T101530123',
    'shop~20261324T101530123Z',
    'shop~20260230T101530123Z',
    'shop~20261124T251530123Z',
    '../shop~20261124T101530123Z',
    'shop~20261124T101530123Z/x',
  ];
  for (const name of bad) assert.equal(parseTrashEntry(name), undefined, name);
});

test('deleted.json is read only when it has exactly its fields', () => {
  const good = { schemaVersion: 1, slug: 'shop', title: 'Shop', deletedAt: AT.toISOString() };
  assert.deepEqual(parseDeletedFile(good), good);
  assert.equal(parseDeletedFile({ ...good, extra: true }), undefined);
  assert.equal(parseDeletedFile({ ...good, slug: 'Bad Slug' }), undefined);
  assert.equal(parseDeletedFile(null), undefined);
});

test('a delete moves the whole draft to the trash and says what it was', () => {
  const { store, root } = shopDraft();
  const deleted = deleteDraft(store, 'shop', AT);
  assert.deepEqual(deleted, {
    slug: 'shop',
    title: 'Shop',
    deletedAt: '2026-11-24T10:15:30.123Z',
    entry: 'shop~20261124T101530123Z',
  });
  assert.equal(existsSync(join(root, 'shop')), false);
  assert.deepEqual(listDrafts(store), []);
  const folder = join(trashOf(root), deleted.entry);
  assert.ok(existsSync(join(folder, 'draft.json')));
  assert.ok(existsSync(join(folder, 'v1', 'md', 'brief.md')));
  assert.deepEqual(JSON.parse(readFileSync(join(folder, 'deleted.json'), 'utf8')), {
    schemaVersion: 1,
    slug: 'shop',
    title: 'Shop',
    deletedAt: '2026-11-24T10:15:30.123Z',
  });
  assert.deepEqual(listDeleted(store), [deleted]);
});

test('a restore brings the draft back as it was, without deleted.json', () => {
  const { store, root } = shopDraft();
  const brief = readFileSync(join(root, 'shop', 'v1', 'md', 'brief.md'), 'utf8');
  const deleted = deleteDraft(store, 'shop', AT);
  assert.deepEqual(restoreDraft(store, 'shop'), deleted);
  assert.equal(loadDraft(store, 'shop').title, 'Shop');
  assert.equal(readFileSync(join(root, 'shop', 'v1', 'md', 'brief.md'), 'utf8'), brief);
  assert.equal(existsSync(join(root, 'shop', 'deleted.json')), false);
  assert.deepEqual(store.trash.entries(), []);
  assert.deepEqual(listDeleted(store), []);
});

test('a restore refuses a slug that is taken, and a slug nothing was deleted under', () => {
  const { store, root } = shopDraft();
  deleteDraft(store, 'shop', AT);
  add(store, 'shop', 'Another shop');
  assert.throws(() => restoreDraft(store, 'shop'), hasCode('DRAFT_EXISTS'));
  // Nothing was moved: the live draft is the new one, the deleted one waits.
  assert.equal(loadDraft(store, 'shop').title, 'Another shop');
  assert.equal(listDeleted(store).length, 1);
  assert.ok(existsSync(join(trashOf(root), 'shop~20261124T101530123Z', 'draft.json')));
  assert.throws(() => restoreDraft(store, 'nope'), hasCode('DRAFT_NOT_FOUND'));
  assert.throws(() => restoreDraft(store, '../shop'), hasCode('DRAFT_INVALID'));
});

test('two deletes of one slug keep two copies, and a restore brings the newest', () => {
  const { store } = shopDraft();
  deleteDraft(store, 'shop', AT);
  add(store, 'shop', 'Shop two');
  deleteDraft(store, 'shop', LATER);
  assert.deepEqual(
    listDeleted(store).map((item) => [item.title, item.deletedAt]),
    [
      ['Shop two', '2026-11-24T11:00:00.000Z'],
      ['Shop', '2026-11-24T10:15:30.123Z'],
    ],
  );
  restoreDraft(store, 'shop');
  assert.equal(loadDraft(store, 'shop').title, 'Shop two');
  assert.deepEqual(
    listDeleted(store).map((item) => item.title),
    ['Shop'],
  );
});

test('two deletes in the same millisecond still get two folders', () => {
  const { store } = shopDraft();
  const first = deleteDraft(store, 'shop', AT);
  add(store, 'shop', 'Shop two');
  const second = deleteDraft(store, 'shop', AT);
  assert.notEqual(first.entry, second.entry);
  assert.equal(second.deletedAt, '2026-11-24T10:15:30.124Z');
  assert.equal(listDeleted(store).length, 2);
});

test('purge removes one slug for good, then all, and never a live draft', () => {
  const { store, root } = tempDrafts();
  for (const slug of ['a', 'b', 'c']) add(store, slug);
  deleteDraft(store, 'a', AT);
  deleteDraft(store, 'b', AT);
  const gone = purgeDeleted(store, 'a');
  assert.deepEqual(
    gone.map((item) => item.slug),
    ['a'],
  );
  assert.equal(existsSync(join(trashOf(root), gone[0]?.entry ?? '?')), false);
  assert.deepEqual(
    listDeleted(store).map((item) => item.slug),
    ['b'],
  );
  assert.throws(() => purgeDeleted(store, 'a'), hasCode('DRAFT_NOT_FOUND'));
  // A live draft of that slug is not a deleted copy.
  assert.throws(() => purgeDeleted(store, 'c'), hasCode('DRAFT_NOT_FOUND'));
  assert.deepEqual(
    purgeAllDeleted(store).map((item) => item.slug),
    ['b'],
  );
  assert.deepEqual(store.trash.entries(), []);
  assert.deepEqual(store.list(), ['c']);
  assert.deepEqual(purgeAllDeleted(store), []);
});

test('a move that fails leaves the draft whole where it was', () => {
  const { root } = tempDrafts();
  const busy = Object.assign(new Error('held'), { code: 'EPERM' });
  const store = createFsDraftStore(
    root,
    {},
    {
      io: {
        move: () => {
          throw busy;
        },
      },
    },
  );
  add(store, 'shop');
  assert.throws(() => deleteDraft(store, 'shop', AT), hasCode('DRAFT_LOCKED'));
  assert.deepEqual(store.list(), ['shop']);
  assert.equal(loadDraft(store, 'shop').title, 'shop');
  assert.deepEqual(store.trash.entries(), []);
  assert.equal(existsSync(join(root, 'shop', 'deleted.json')), false);
});

test('a failure that is not a held file is thrown as it is', () => {
  const { root } = tempDrafts();
  const other = Object.assign(new Error('no space'), { code: 'ENOSPC' });
  const store = createFsDraftStore(
    root,
    {},
    {
      io: {
        move: () => {
          throw other;
        },
      },
    },
  );
  add(store, 'shop');
  assert.throws(
    () => deleteDraft(store, 'shop', AT),
    (error: unknown) => error === other,
  );
  assert.deepEqual(store.list(), ['shop']);
});

test('a purge that cannot remove a folder says the files are held', () => {
  const { root } = tempDrafts();
  const busy = Object.assign(new Error('held'), { code: 'EBUSY' });
  const store = createFsDraftStore(
    root,
    {},
    {
      io: {
        remove: () => {
          throw busy;
        },
      },
    },
  );
  add(store, 'shop');
  deleteDraft(store, 'shop', AT);
  assert.throws(() => purgeDeleted(store, 'shop'), hasCode('DRAFT_LOCKED'));
  assert.equal(listDeleted(store).length, 1);
});

test('a missing draft, a bad slug and a bad entry are refused before any path is built', () => {
  const { store } = shopDraft();
  assert.throws(() => deleteDraft(store, 'nope', AT), hasCode('DRAFT_NOT_FOUND'));
  assert.throws(() => deleteDraft(store, '../shop', AT), hasCode('DRAFT_INVALID'));
  assert.throws(() => deleteDraft(store, 'Shop', AT), hasCode('DRAFT_INVALID'));
  assert.throws(() => store.trash.remove('shop'), hasCode('DRAFT_INVALID'));
  assert.throws(() => store.trash.remove('../drafts'), hasCode('DRAFT_INVALID'));
  assert.throws(
    () => store.trash.put('shop', 'other~20261124T101530123Z'),
    hasCode('DRAFT_INVALID'),
  );
  assert.throws(
    () => store.trash.take('shop~20261124T101530123Z', 'other'),
    hasCode('DRAFT_INVALID'),
  );
  assert.deepEqual(store.list(), ['shop']);
});

test('a draft whose draft.json does not read can be deleted, and is titled by its slug', () => {
  const { store } = tempDrafts();
  store.writeText('bad', 'draft.json', '{ "schemaVersion": 2 }');
  const deleted = deleteDraft(store, 'bad', AT);
  assert.equal(deleted.title, 'bad');
  assert.equal(restoreDraft(store, 'bad').slug, 'bad');
  assert.deepEqual(store.list(), ['bad']);
});

test('a folder in the trash that kitvas did not name is left alone', () => {
  const { store, root } = shopDraft();
  deleteDraft(store, 'shop', AT);
  mkdirSync(join(trashOf(root), 'notes'), { recursive: true });
  assert.equal(listDeleted(store).length, 1);
  purgeAllDeleted(store);
  assert.ok(existsSync(join(trashOf(root), 'notes')));
});

test('a deleted copy without deleted.json is listed by its folder name and draft.json', () => {
  const { store, root } = shopDraft();
  const deleted = deleteDraft(store, 'shop', AT);
  const file = join(trashOf(root), deleted.entry, 'deleted.json');
  store.trash.writeText(deleted.entry, 'deleted.json', 'not json');
  assert.ok(existsSync(file));
  assert.deepEqual(listDeleted(store), [deleted]);
});
