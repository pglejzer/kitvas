// The variants the pill on the canvas offers (redesign spec, goal 11; plan 19, task 4): those of the
// newest answered request about the selected element, none when that request is out of date or
// one of its variants was applied, each with whether it can be applied now and why not.

import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  type CardNow,
  variantKey,
  variantRefs,
} from '../../../../../client/studio/edit/ai/requests.ts';
import type {
  RequestAnswer,
  RequestView,
} from '../../../../../src/studio/api/requests/request-schemas.ts';

const ID = 'sections/Hero:section/Stack/Button';
const OTHER = 'sections/Hero:section/Stack/Text';

const answer = (...labels: string[]): RequestAnswer => ({
  kind: 'variants',
  variants: labels.map((label) => ({
    label,
    changes: [{ kind: 'text', id: ID, value: label }],
  })),
});

function request(id: string, overrides: Partial<RequestView> = {}): RequestView {
  return {
    id,
    kind: 'say',
    elements: [ID],
    context: { width: null, state: null },
    text: 'Make it stand out',
    version: 2,
    at: '2026-11-24T10:00:00.000Z',
    status: 'answered',
    note: null,
    stale: false,
    answer: answer('Bolder', 'Quieter'),
    ...overrides,
  };
}

const NONE = new Map<string, number>();
const allReady = (): CardNow => ({ ready: true, reason: null });

test('the variants of the newest answered request that names the selected element', () => {
  // The server lists the newest first.
  const requests = [
    request('r3', { status: 'waiting', answer: null }),
    request('r2', { answer: answer('Roomier') }),
    request('r1'),
  ];
  assert.deepEqual(variantRefs(requests, [ID, OTHER], NONE, allReady), [
    {
      key: variantKey('r2', 0),
      request: 'r2',
      index: 0,
      label: 'Roomier',
      ready: true,
      reason: null,
    },
  ]);
});

test('only a request about the first selected element counts', () => {
  const requests = [request('r1', { elements: [OTHER] })];
  assert.deepEqual(variantRefs(requests, [ID, OTHER], NONE, allReady), []);
  assert.equal(variantRefs(requests, [OTHER], NONE, allReady).length, 2);
});

test('none with nothing selected, and none for a request that is out of date', () => {
  assert.deepEqual(variantRefs([request('r1')], [], NONE, allReady), []);
  const stale = [request('r2', { stale: true }), request('r1')];
  // The newest answer supersedes the older one even when it is out of date.
  assert.deepEqual(variantRefs(stale, [ID], NONE, allReady), []);
});

test('a request with a variant applied here is finished: the next older one is offered', () => {
  const requests = [request('r2'), request('r1', { answer: answer('Older') })];
  assert.deepEqual(variantRefs(requests, [ID], new Map([['r2', 0]]), allReady), [
    {
      key: variantKey('r1', 0),
      request: 'r1',
      index: 0,
      label: 'Older',
      ready: true,
      reason: null,
    },
  ]);
  assert.deepEqual(variantRefs([request('r2')], [ID], new Map([['r2', 1]]), allReady), []);
});

test('a dropped, failed or done request offers nothing', () => {
  const requests = [
    request('r3', { status: 'dropped' }),
    request('r2', { status: 'failed', answer: { kind: 'failed', reason: 'No.' } }),
    request('r1', { answer: { kind: 'done', message: 'Done.' } }),
  ];
  assert.deepEqual(variantRefs(requests, [ID], NONE, allReady), []);
});

test('a card that is not ready says why; a card not drawn yet is not ready', () => {
  const card = (key: string): CardNow | undefined =>
    key === variantKey('r1', 0) ? { ready: false, reason: 'Reading the elements…' } : undefined;
  const refs = variantRefs([request('r1')], [ID], NONE, card);
  assert.deepEqual(
    refs.map((ref) => [ref.label, ref.ready, ref.reason]),
    [
      ['Bolder', false, 'Reading the elements…'],
      ['Quieter', false, null],
    ],
  );
});
