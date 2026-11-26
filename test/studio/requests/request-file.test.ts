import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  MAX_CLOSED_REQUESTS,
  pruneRequests,
  REQUESTS_FILE,
  readRequests,
  type StoredRequest,
  writeRequests,
} from '../../../src/studio/requests/request-file.ts';
import { shopDraft } from '../../helpers/draft/drafts.ts';

const idOf = (n: number): string => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`;

function stored(n: number, over: Partial<StoredRequest> = {}): StoredRequest {
  return {
    id: idOf(n),
    kind: 'ask',
    elements: ['sections/Hero:section/Button'],
    stamps: ['b'.repeat(64)],
    context: { width: 768, state: 'hover' },
    text: 'Make it wrap',
    ops: [
      {
        op: 'setText',
        id: 'sections/Hero:section/Button',
        value: 'Go',
        before: 'Start',
      },
    ],
    note: null,
    version: 1,
    at: '2026-11-24T10:00:00.000Z',
    status: 'waiting',
    takenAt: null,
    answer: null,
    answeredAt: null,
    answeredVersion: null,
    ...over,
  };
}

test('requests are kept in requests.json beside draft.json and read back as written', () => {
  const { store } = shopDraft();
  assert.deepEqual(readRequests(store, 'shop'), []);
  const requests = [stored(1), stored(2, { status: 'taken', takenAt: '2026-11-24T10:01:00.000Z' })];
  writeRequests(store, 'shop', requests);
  assert.ok(store.exists('shop', REQUESTS_FILE));
  assert.deepEqual(readRequests(store, 'shop'), requests);
  // Written whole: no temporary file is left beside it.
  assert.equal(store.exists('shop', `${REQUESTS_FILE}.kitvas-tmp`), false);
});

test('a broken file holds no requests, and a broken entry costs only itself', () => {
  const { store } = shopDraft();
  store.writeText('shop', REQUESTS_FILE, '{ not json');
  assert.deepEqual(readRequests(store, 'shop'), []);
  store.writeText('shop', REQUESTS_FILE, JSON.stringify({ schemaVersion: 2, requests: [] }));
  assert.deepEqual(readRequests(store, 'shop'), []);
  const good = stored(1);
  store.writeText(
    'shop',
    REQUESTS_FILE,
    JSON.stringify({ schemaVersion: 1, requests: [good, { ...stored(2), status: 'lost' }] }),
  );
  assert.deepEqual(readRequests(store, 'shop'), [good]);
});

test('every open request is kept, and only the newest closed ones', () => {
  const closed = Array.from({ length: MAX_CLOSED_REQUESTS + 2 }, (_, n) =>
    stored(n + 10, { status: n % 2 === 0 ? 'answered' : 'dropped' }),
  );
  const open = [stored(1), stored(2, { status: 'taken', takenAt: '2026-11-24T10:01:00.000Z' })];
  const kept = pruneRequests([open[0] ?? stored(1), ...closed, open[1] ?? stored(2)]);
  assert.equal(kept.length, MAX_CLOSED_REQUESTS + 2);
  assert.equal(kept[0]?.id, idOf(1));
  assert.equal(kept.at(-1)?.id, idOf(2));
  // The two oldest closed ones went.
  assert.equal(kept[1]?.id, idOf(12));
  const { store } = shopDraft();
  writeRequests(store, 'shop', [...open, ...closed]);
  assert.equal(readRequests(store, 'shop').length, MAX_CLOSED_REQUESTS + 2);
});
