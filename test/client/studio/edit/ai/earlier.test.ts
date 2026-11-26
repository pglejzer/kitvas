// "Earlier" in the Claude tab, the status line's count and a variant card's state line (plan 18f,
// task 3). Pure decisions, no DOM.

import assert from 'node:assert/strict';
import { test } from 'node:test';
import { endOf, endWords, isEarlier } from '../../../../../client/studio/edit/ai/earlier.ts';
import { openCount, openWords } from '../../../../../client/studio/edit/ai/status.ts';
import { type CardModel, stateKeyOf } from '../../../../../client/studio/edit/ai/tab.ts';
import type { RequestView } from '../../../../../src/studio/api/requests/request-schemas.ts';

const request = (over: Partial<RequestView>): RequestView => ({
  id: 'r1',
  kind: 'say',
  elements: ['sections/Pricing:section/Button'],
  context: { width: null, state: null, option: null },
  text: 'Make the Team button stand out',
  version: 2,
  at: '2026-11-25T10:00:00.000Z',
  status: 'answered',
  note: null,
  stale: false,
  answer: { kind: 'done', message: 'Done.' },
  ...over,
});
const variants: RequestView['answer'] = {
  kind: 'variants',
  variants: [{ label: 'Larger', changes: [{ kind: 'text', id: 'a', value: 'x' }] }],
};

test('an earlier request reads its end: In Version N, Applied or Answered', () => {
  // Claude changed the draft itself, and the draft moved on to a later version.
  assert.deepEqual(endOf(request({}), false, 3), { kind: 'inVersion', version: 3 });
  assert.deepEqual(endWords({ kind: 'inVersion', version: 3 }), {
    key: 'ai.end.inVersion',
    params: { version: 3 },
  });
  // A variant of it was applied from this page.
  assert.deepEqual(endOf(request({ answer: variants }), true, 2), { kind: 'applied' });
  assert.equal(endWords({ kind: 'applied' }).key, 'ai.end.applied');
  // Answered, and the draft is still on the version it was made on.
  assert.deepEqual(endOf(request({}), false, 2), { kind: 'answered' });
  assert.deepEqual(endOf(request({}), false, null), { kind: 'answered' });
  assert.equal(endWords({ kind: 'answered' }).key, 'ai.end.answered');
});

test('a request that failed ends as not done, whatever else is true', () => {
  const failed = request({ status: 'failed', answer: { kind: 'failed', reason: 'No.' } });
  assert.deepEqual(endOf(failed, false, 5), { kind: 'failed' });
  assert.equal(endWords({ kind: 'failed' }).key, 'ai.state.failed');
});

test('an open request, or variants nobody applied, stay cards above', () => {
  assert.equal(isEarlier(request({ status: 'waiting', answer: null }), false), false);
  assert.equal(isEarlier(request({ status: 'taken', answer: null }), false), false);
  assert.equal(isEarlier(request({ answer: variants }), false), false);
  assert.equal(isEarlier(request({ answer: variants }), true), true);
  assert.equal(isEarlier(request({}), false), true);
  assert.equal(
    isEarlier(request({ status: 'failed', answer: { kind: 'failed', reason: 'x' } }), false),
    true,
  );
});

test('the status line counts the requests that wait or are with Claude', () => {
  const list = [
    request({ status: 'waiting' }),
    request({ status: 'taken' }),
    request({ status: 'answered' }),
    request({ status: 'failed' }),
    request({ status: 'dropped' }),
  ];
  assert.equal(openCount(list), 2);
  assert.equal(openCount([]), 0);
  assert.deepEqual(openWords(0), { key: 'ai.status.openNone', params: {} });
  assert.deepEqual(openWords(1), { key: 'ai.status.openOne', params: {} });
  assert.deepEqual(openWords(3), { key: 'ai.status.open', params: { n: 3 } });
});

const card = (over: Partial<CardModel>): CardModel => ({
  key: 'r1#0',
  label: 'Larger',
  number: 1,
  changes: 1,
  chips: [],
  built: { kind: 'ready', ids: ['a'], ops: [], dropsText: false, offKit: false },
  outdated: false,
  applied: false,
  blocked: null,
  later: false,
  nameOf: (id) => id,
  ...over,
});

test('a variant card says whether the canvas shows it, and nothing when it cannot be tried', () => {
  assert.equal(stateKeyOf(card({}), true), 'ai.variant.onCanvas');
  assert.equal(stateKeyOf(card({}), false), 'ai.variant.hover');
  assert.equal(stateKeyOf(card({ outdated: true }), true), null);
  assert.equal(stateKeyOf(card({ applied: true }), true), null);
  assert.equal(stateKeyOf(card({ blocked: 'ai.blocked.edit' }), true), null);
  assert.equal(stateKeyOf(card({ built: { kind: 'loading', ids: ['a'] } }), true), null);
});
