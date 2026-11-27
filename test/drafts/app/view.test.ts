import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  addVersion,
  appendRenames,
  carriedId,
  hiddenNow,
  lockedIdsNow,
  locksNow,
  MAX_VIEW_IDS,
  newLock,
  readView,
  saveView,
  sectionContext,
  writeView,
} from '../../../src/drafts/index.ts';
import { createFolderKitStore } from '../../../src/kit/adapters/folder-store.ts';
import { GOOD_LAYOUT, NO_FILES, shopDraft } from '../../helpers/draft/drafts.ts';
import { FIXTURE_KITS } from '../../helpers/kit/kits.ts';

const T1 = '2026-11-24T10:30:00.000Z';
const OLD = 'sections/Hero:section/Button';
const MOVED = 'sections/Hero:section/Stack/Button';
const SOURCE = '<Button variant="primary">\n      Buy\n    </Button>';

const empty = { schemaVersion: 1, locked: [], hidden: [], version: 1 };

test('a draft with no view file has nothing locked or hidden, and a broken file neither', () => {
  const { store } = shopDraft();
  assert.deepEqual(readView(store, 'shop'), empty);
  store.writeText('shop', 'view.json', '{ not json');
  assert.deepEqual(readView(store, 'shop'), empty);
  store.writeText('shop', 'view.json', '{"schemaVersion":2,"locked":[],"hidden":[],"version":1}');
  assert.deepEqual(readView(store, 'shop'), empty);
});

test('a lock keeps the source as it was cut from the file, its file, version and moment', () => {
  const { store } = shopDraft();
  const lock = newLock(OLD, SOURCE, { version: 1, at: T1 });
  assert.deepEqual(lock, {
    id: OLD,
    file: 'src/tsx/sections/Hero.tsx',
    text: SOURCE,
    version: 1,
    at: T1,
  });
  const written = saveView(store, 'shop', { latest: 1, locked: [lock, lock], hidden: [] });
  // The same id twice is one lock; the text is not collapsed, so Restore gives it back as it was.
  assert.deepEqual(written.locked, [lock]);
  assert.deepEqual(readView(store, 'shop').locked, [lock]);
  assert.ok((store.readText('shop', 'view.json') ?? '').endsWith('}\n'));
});

test('the view file never holds more ids than its schema takes', () => {
  const { store } = shopDraft();
  const hidden = Array.from({ length: MAX_VIEW_IDS + 3 }, (_, index) => `sections/Hero:p.${index}`);
  writeView(store, 'shop', { schemaVersion: 1, locked: [], hidden, version: 1 });
  assert.equal(readView(store, 'shop').hidden.length, MAX_VIEW_IDS);
});

test('an id follows the later steps of its own version and every step of the later ones', () => {
  const log: Record<number, { at: string; renames: Record<string, string> }[]> = {
    1: [
      { at: '2026-11-24T10:00:00.000Z', renames: { [OLD]: 'early:1' } },
      { at: '2026-11-24T11:00:00.000Z', renames: { [OLD]: MOVED } },
    ],
    2: [{ at: '2026-11-24T09:00:00.000Z', renames: { [MOVED]: 'late:1' } }],
  };
  const stepsOf = (version: number) => log[version] ?? [];
  // The step before the lock was made does not rename it.
  assert.equal(carriedId(OLD, { version: 1, at: T1 }, 1, stepsOf), MOVED);
  assert.equal(carriedId(OLD, { version: 1, at: T1 }, 2, stepsOf), 'late:1');
  // A lock made on a later version than the one asked about stays as it is.
  assert.equal(carriedId(OLD, { version: 3, at: T1 }, 2, stepsOf), OLD);
});

test('locks carry across renames to the latest version, with their file', () => {
  const { store } = shopDraft();
  saveView(store, 'shop', {
    latest: 1,
    locked: [newLock(OLD, SOURCE, { version: 1, at: T1 })],
    hidden: [],
  });
  const v2 = addVersion(store, 'shop', new Date('2026-11-24T11:00:00.000Z')).version;
  appendRenames(store, 'shop', v2, {
    at: '2026-11-24T12:00:00.000Z',
    renames: { [OLD]: 'sections/Footer:footer/Button' },
    created: [],
  });
  const [lock] = locksNow(store, 'shop', v2);
  assert.equal(lock?.id, 'sections/Footer:footer/Button');
  assert.equal(lock?.file, 'src/tsx/sections/Footer.tsx');
  // The kept source, version and moment stay as they were saved.
  assert.equal(lock?.text, SOURCE);
  assert.equal(lock?.version, 1);
});

test('locked ids leave out an element the latest build does not have', () => {
  const { store } = shopDraft();
  const stamp = { version: 1, at: T1 };
  saveView(store, 'shop', {
    latest: 1,
    locked: [newLock(OLD, SOURCE, stamp), newLock(MOVED, '<Button />', stamp)],
    hidden: [],
  });
  // No build: every lock counts.
  assert.deepEqual(lockedIdsNow(store, 'shop', 1), [OLD, MOVED]);
  const at = { file: 'src/tsx/sections/Hero.tsx', line: 3, column: 5, tag: 'Button' };
  store.writeText(
    'shop',
    'v1/build/json/ids.json',
    JSON.stringify({ schemaVersion: 1, ids: { [OLD]: at } }),
  );
  assert.deepEqual(lockedIdsNow(store, 'shop', 1), [OLD]);
});

test('hidden ids are kept as the start of the version names them, and carried from there', () => {
  const { store } = shopDraft();
  const session = '2026-11-24T10:00:00.000Z';
  appendRenames(store, 'shop', 1, { at: session, renames: { [OLD]: MOVED }, created: ['made:1'] });
  // The editor names the moved element by its id now; one the session made has no older id.
  saveView(store, 'shop', { latest: 1, locked: [], hidden: [MOVED, 'made:1'] });
  assert.deepEqual(readView(store, 'shop').hidden, [OLD, 'made:1']);
  assert.deepEqual(hiddenNow(store, 'shop', 1), [MOVED, 'made:1']);
});

test("the section context lists the section's locked ids only", () => {
  const { store } = shopDraft();
  store.writeText('shop', 'v1/md/layout.md', GOOD_LAYOUT);
  const stamp = { version: 1, at: T1 };
  saveView(store, 'shop', {
    latest: 1,
    locked: [
      newLock(OLD, SOURCE, stamp),
      newLock('sections/OrderSummary:section/Icon', '<Icon name="check" />', stamp),
    ],
    hidden: [],
  });
  const kits = createFolderKitStore(FIXTURE_KITS);
  assert.deepEqual(sectionContext(store, kits, 'shop', 'hero', NO_FILES).locked, [OLD]);
  assert.deepEqual(sectionContext(store, kits, 'shop', 'order-summary', NO_FILES).locked, [
    'sections/OrderSummary:section/Icon',
  ]);
});
