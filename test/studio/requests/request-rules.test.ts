import assert from 'node:assert/strict';
import { test } from 'node:test';
import { KitvasError } from '../../../src/shared/index.ts';
import { TAKEN_TIMEOUT_MS } from '../../../src/studio/api/requests/request-schemas.ts';
import type { StoredRequest } from '../../../src/studio/requests/request-file.ts';
import {
  addRequest,
  dropRequest,
  expiresAt,
  expireTaken,
  findRequest,
  nextExpiry,
  openCount,
  settleRequest,
  takeWaiting,
} from '../../../src/studio/requests/request-rules.ts';

const NOW = new Date('2026-11-24T10:00:00.000Z');
const later = (ms: number): Date => new Date(NOW.getTime() + ms);
const idOf = (n: number): string => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`;

function stored(n: number, over: Partial<StoredRequest> = {}): StoredRequest {
  return {
    id: idOf(n),
    kind: 'say',
    elements: ['sections/Hero:section/Button'],
    stamps: [null],
    context: { width: null, state: null, option: null },
    text: `Request ${n}`,
    ops: [],
    note: null,
    version: 1,
    at: NOW.toISOString(),
    status: 'waiting',
    takenAt: null,
    answer: null,
    answeredAt: null,
    answeredVersion: null,
    ...over,
  };
}

const codeOf = (code: string) => (error: unknown) =>
  error instanceof KitvasError && error.code === code;

const VARIANTS = {
  kind: 'variants' as const,
  variants: [
    {
      label: 'Bolder',
      changes: [{ kind: 'text' as const, id: 'sections/Hero:section/Button', value: 'Go' }],
    },
  ],
};

test('a new request waits at the end; a full draft refuses one more', () => {
  const first = addRequest([], stored(1), 'shop');
  const both = addRequest(first, stored(2), 'shop');
  assert.deepEqual(
    both.map((request) => request.id),
    [idOf(1), idOf(2)],
  );
  assert.throws(() => addRequest(both, stored(3), 'shop', 2), codeOf('REQUEST_LIMIT'));
  // Closed requests do not count against the limit.
  const closed = [stored(1, { status: 'answered' }), stored(2, { status: 'dropped' })];
  assert.equal(addRequest(closed, stored(3), 'shop', 2).length, 3);
  assert.equal(openCount([...closed, stored(3), stored(4, { status: 'taken' })]), 2);
});

test('a take hands every waiting request over and marks it taken now', () => {
  const requests = [stored(1), stored(2, { status: 'answered' }), stored(3)];
  const { requests: next, taken } = takeWaiting(requests, NOW);
  assert.deepEqual(
    taken.map((request) => request.id),
    [idOf(1), idOf(3)],
  );
  assert.deepEqual(
    next.map((request) => [request.status, request.takenAt]),
    [
      ['taken', NOW.toISOString()],
      ['answered', null],
      ['taken', NOW.toISOString()],
    ],
  );
  assert.deepEqual(takeWaiting(next, NOW).taken, []);
});

test('a taken request with no answer for 15 minutes waits again', () => {
  const taken = [
    stored(1, { status: 'taken', takenAt: NOW.toISOString() }),
    stored(2, { status: 'taken', takenAt: later(60_000).toISOString() }),
  ];
  assert.equal(expiresAt(taken[0] ?? stored(0)), NOW.getTime() + TAKEN_TIMEOUT_MS);
  assert.equal(nextExpiry(taken), NOW.getTime() + TAKEN_TIMEOUT_MS);
  assert.equal(expireTaken(taken, later(TAKEN_TIMEOUT_MS - 1)).expired, 0);
  const { requests, expired } = expireTaken(taken, later(TAKEN_TIMEOUT_MS));
  assert.equal(expired, 1);
  assert.deepEqual(
    requests.map((request) => [request.status, request.takenAt]),
    [
      ['waiting', null],
      ['taken', later(60_000).toISOString()],
    ],
  );
  assert.equal(nextExpiry(requests), later(60_000).getTime() + TAKEN_TIMEOUT_MS);
  assert.equal(nextExpiry([stored(3)]), null);
  // A time that does not read is due at once rather than never.
  assert.equal(expireTaken([stored(4, { status: 'taken', takenAt: 'soon' })], NOW).expired, 1);
});

test('only a taken request takes an answer: variants or done answer it, a reason fails it', () => {
  const at = { now: later(5_000), version: 2 };
  const taken = [stored(1, { status: 'taken', takenAt: NOW.toISOString() })];
  const answered = settleRequest(taken, idOf(1), VARIANTS, { ...at, stamps: ['a'.repeat(64)] });
  assert.equal(answered.request.status, 'answered');
  assert.deepEqual(answered.request.answer, VARIANTS);
  assert.equal(answered.request.answeredAt, at.now.toISOString());
  assert.equal(answered.request.answeredVersion, 2);
  assert.deepEqual(answered.request.stamps, ['a'.repeat(64)]);
  const done = settleRequest(taken, idOf(1), { kind: 'done', message: 'Changed it' }, at);
  assert.equal(done.request.status, 'answered');
  assert.deepEqual(done.request.stamps, [null], 'a closing word keeps the stamps');
  const failed = settleRequest(taken, idOf(1), { kind: 'failed', reason: 'No such token' }, at);
  assert.equal(failed.request.status, 'failed');
  for (const status of ['waiting', 'answered', 'failed', 'dropped'] as const) {
    assert.throws(
      () => settleRequest([stored(1, { status })], idOf(1), VARIANTS, at),
      codeOf('REQUEST_NOT_TAKEN'),
      status,
    );
  }
  assert.throws(() => settleRequest(taken, idOf(9), VARIANTS, at), codeOf('REQUEST_NOT_FOUND'));
});

test('the person drops a request whatever it came to; a dropped one stays as it is', () => {
  for (const status of ['waiting', 'taken', 'answered', 'failed'] as const) {
    const { requests, request } = dropRequest([stored(1, { status }), stored(2)], idOf(1));
    assert.equal(request.status, 'dropped', status);
    assert.equal(requests[1]?.status, 'waiting');
  }
  const already = [stored(1, { status: 'dropped' })];
  assert.equal(dropRequest(already, idOf(1)).requests[0], already[0]);
  assert.throws(() => dropRequest(already, idOf(2)), codeOf('REQUEST_NOT_FOUND'));
  assert.throws(() => findRequest([], idOf(1)), codeOf('REQUEST_NOT_FOUND'));
});
