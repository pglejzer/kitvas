// The AI tab's requests as data (spec 4d, goals 1 and 2; plan 17, task B): the GET answer read
// with care, the `requests` event, the order of the list, and the bodies the tab posts. The
// lists and limits are the server's own (ADR 0080).

import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  againRequest,
  improveRequest,
  MAX_REQUEST_ELEMENTS,
  MAX_REQUEST_TEXT,
  orderRequests,
  readRequest,
  readRequests,
  requestsSlugOf,
  sayRequest,
  variantKey,
  variantsOf,
} from '../../../../../client/studio/edit/ai/requests.ts';
import type { StyleContext } from '../../../../../src/edit/index.ts';
import {
  NewRequestSchema,
  type RequestAnswer,
  RequestsSchema,
  type RequestView,
} from '../../../../../src/studio/api/requests/request-schemas.ts';

const ID = 'sections/Hero:section/Stack/Button';
const OTHER = 'sections/Hero:section/Stack/Text';
const BASE: StyleContext = { width: null, state: null, option: null };

function request(overrides: Partial<RequestView> = {}): RequestView {
  return {
    id: '7d3c4f0e-6a55-4c8e-9b8e-0f2a1c3d4e5f',
    kind: 'say',
    elements: [ID],
    context: BASE,
    text: 'Make it stand out',
    version: 2,
    at: '2026-11-24T10:00:00.000Z',
    status: 'waiting',
    note: null,
    stale: false,
    answer: null,
    ...overrides,
  };
}

const VARIANTS: RequestAnswer = {
  kind: 'variants',
  variants: [
    {
      label: 'Bolder',
      changes: [
        { kind: 'style', id: ID, property: 'padding', value: { token: '--kit-space-md' } },
        { kind: 'prop', id: ID, name: 'variant', value: { kind: 'string', value: 'solid' } },
        { kind: 'text', id: ID, value: 'Buy now' },
        { kind: 'utility', id: ID, value: 'p-6', before: null },
      ],
    },
  ],
};

test('a good answer is read as it is, and what it reads is what the server sends', () => {
  const answered = request({ status: 'answered', answer: VARIANTS });
  const body = {
    requests: [answered, request({ id: 'b', kind: 'why' })],
    listening: { state: 'listening', since: '2026-11-24T10:00:00.000Z' },
  };
  const read = readRequests(JSON.parse(JSON.stringify(body)));
  assert.deepEqual(read, body);
  const first = read?.requests[0];
  assert.ok(first);
  // The second id is no uuid; the server's schema checks the first one.
  assert.equal(RequestsSchema.safeParse({ ...read, requests: [first] }).success, true);
  assert.equal(variantsOf(first)[0]?.changes.length, 4);
});

test('a malformed request is left out; an answer without the listening state is none', () => {
  const body = {
    requests: [request(), { ...request(), status: 'lost' }, { ...request(), context: {} }],
    listening: { state: 'off', since: null },
  };
  assert.equal(readRequests(body)?.requests.length, 1);
  assert.equal(readRequests({ requests: [] }), null);
  assert.equal(readRequests({ requests: [], listening: { state: 'asleep', since: null } }), null);
  assert.equal(readRequests('nothing'), null);
});

test("a request's option value is read; one from before options is every option", () => {
  const dark = { width: 768, state: null, option: { id: 'theme', value: 'dark' } };
  assert.deepEqual(readRequest(request({ context: dark }))?.context, dark);
  const older = { ...request(), context: { width: null, state: null } };
  assert.deepEqual(readRequest(older)?.context, BASE);
  for (const option of [{ id: 'Theme', value: 'dark' }, { id: 'theme' }, 'dark']) {
    assert.equal(readRequest({ ...request(), context: { ...BASE, option } }), undefined);
  }
});

test('a variant with an unknown change, property or empty label is not read', () => {
  const bad = (change: unknown, label = 'x') =>
    readRequest({
      ...request({ status: 'answered' }),
      answer: { kind: 'variants', variants: [{ label, changes: [change] }] },
    });
  const good = { kind: 'text', id: ID, value: 'Hi' };
  assert.ok(bad(good));
  assert.equal(bad({ kind: 'move', id: ID }), undefined);
  assert.equal(bad({ kind: 'style', id: ID, property: 'z-index', value: { raw: '2' } }), undefined);
  const blue = { kind: 'style', id: ID, property: 'gap', value: { token: 'blue' } };
  assert.equal(bad(blue), undefined);
  assert.equal(bad(good, '   '), undefined);
  const done = readRequest({ ...request(), answer: { kind: 'done', message: 'Edited it' } });
  assert.deepEqual(done?.answer, { kind: 'done', message: 'Edited it' });
});

test('a `requests` event names its draft; any other event or bad data names none', () => {
  assert.equal(requestsSlugOf({ event: 'requests', data: '{"slug":"shop"}' }), 'shop');
  assert.equal(requestsSlugOf({ event: 'source', data: '{"slug":"shop"}' }), undefined);
  assert.equal(requestsSlugOf({ event: 'requests', data: '{' }), undefined);
  assert.equal(requestsSlugOf({ event: 'requests', data: '[]' }), undefined);
});

test('requests about the selection come first, newest first; dropped ones are not listed', () => {
  const mine = request({ id: 'a', elements: [ID] });
  const elsewhere = request({ id: 'b', elements: [OTHER] });
  const older = request({ id: 'c', elements: [OTHER, ID] });
  const dropped = request({ id: 'd', status: 'dropped' });
  const order = orderRequests([mine, elsewhere, older, dropped], [ID]);
  const ids = (list: RequestView[]): string[] => list.map((one) => one.id);
  assert.deepEqual(ids(order.selected), ['a', 'c']);
  assert.deepEqual(ids(order.others), ['b']);
  const none = orderRequests([mine, elsewhere], []);
  assert.deepEqual(none.selected, []);
  assert.equal(none.others.length, 2);
});

test('Send makes a `say` request of the selection: trimmed, bounded, never empty', () => {
  const context: StyleContext = {
    width: 768,
    state: 'hover',
    option: { id: 'theme', value: 'dark' },
  };
  const body = sayRequest('  Bigger, please  ', [ID, ID, OTHER], context);
  assert.deepEqual(body, { kind: 'say', elements: [ID, OTHER], context, text: 'Bigger, please' });
  assert.notEqual(body?.context, context);
  assert.equal(NewRequestSchema.safeParse(body).success, true);
  assert.equal(sayRequest('   ', [ID], BASE), null);
  assert.equal(sayRequest('Bigger', [], BASE), null);
  assert.equal(sayRequest('x'.repeat(1_500), [ID], BASE)?.text.length, MAX_REQUEST_TEXT);
  const many = Array.from({ length: 30 }, (_, n) => `${ID}.${n}`);
  assert.equal(sayRequest('Bigger', many, BASE)?.elements.length, MAX_REQUEST_ELEMENTS);
});

test('Improve makes an `improve` request with no words; none without a selection', () => {
  assert.deepEqual(improveRequest([ID], BASE), {
    kind: 'improve',
    elements: [ID],
    context: BASE,
    text: '',
  });
  assert.equal(NewRequestSchema.safeParse(improveRequest([ID], BASE)).success, true);
  assert.equal(improveRequest([], BASE), null);
});

test('Ask again repeats the words and the elements still there; none when all are gone', () => {
  const stale = request({ elements: [ID, OTHER], stale: true, status: 'answered' });
  const present = (id: string): boolean => id === ID;
  assert.deepEqual(againRequest(stale, present), {
    kind: 'say',
    elements: [ID],
    context: BASE,
    text: 'Make it stand out',
  });
  const improved = request({ kind: 'improve', text: '' });
  assert.equal(againRequest(improved, present)?.kind, 'improve');
  // An `ask` answered with variants is asked again in its words.
  assert.equal(againRequest(request({ kind: 'ask' }), present)?.kind, 'say');
  assert.equal(
    againRequest(stale, () => false),
    null,
  );
  assert.equal(againRequest(request({ text: ' ' }), present), null);
});

test('a card is keyed by its request and its place in the answer', () => {
  assert.equal(variantKey('r1', 0), 'r1#0');
  assert.notEqual(variantKey('r1', 1), variantKey('r2', 1));
  assert.deepEqual(variantsOf(request()), []);
});
