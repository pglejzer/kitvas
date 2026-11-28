import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createDraft, type DraftStore } from '../../../../src/drafts/index.ts';
import { createEsbuildCompiler } from '../../../../src/edit/adapters/esbuild-compiler.ts';
import { PLUGIN_ROOT } from '../../../../src/shared/index.ts';
import type { EditDeps } from '../../../../src/studio/api/edit/edit-routes.ts';
import type {
  Listening,
  RequestContext,
  Requests,
  RequestView,
} from '../../../../src/studio/api/requests/request-schemas.ts';
import type { InboxTake } from '../../../../src/studio/requests/inbox-take.ts';
import { NOW, tempDrafts } from '../../../helpers/draft/drafts.ts';
import { openEvents } from '../../../helpers/studio/events.ts';
import { call, studioOver } from '../../../helpers/studio/studio.ts';

const BASE = { id: 'kitvas-ui', version: '1.1.0', hash: 'b'.repeat(64) };
const TSX_FILE = 'src/tsx/sections/Pricing.tsx';
const STACK = 'sections/Pricing:section/Stack';
const TEXT = 'sections/Pricing:section/Stack/Text';

const pricing = (text: string, indent = '  '): string =>
  [
    "import { Stack, Text } from '@kit';",
    '',
    'export function Pricing(_props: { state: string }) {',
    `${indent}return (`,
    `${indent}${indent}<section className="pricing">`,
    `${indent}${indent}${indent}<Stack gap="12">`,
    `${indent}${indent}${indent}${indent}<Text>${text}</Text>`,
    `${indent}${indent}${indent}</Stack>`,
    `${indent}${indent}</section>`,
    `${indent});`,
    '}',
    '',
  ].join('\n');

type Problem = { code: string; errors?: { pointer: string; detail: string }[] };
const json = <T>(text: string): T => JSON.parse(text) as T;
const pause = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

function pricingDrafts(): DraftStore {
  const { store } = tempDrafts();
  createDraft(store, { slug: 'shop', title: 'Shop', kit: BASE, now: NOW });
  store.writeText('shop', 'v1/md/layout.md', '# Layout: Shop\n\n## pricing\nPurpose: Plans.\n');
  store.writeText('shop', `v1/${TSX_FILE}`, pricing('Plans'));
  store.writeText('shop', 'v1/src/scss/sections/pricing.scss', '.pricing {\n  margin: 0;\n}\n');
  return store;
}

/** A studio over the pricing draft with the real compiler, so elements can be read. */
async function requestStudio() {
  const drafts = pricingDrafts();
  const compiler = createEsbuildCompiler([PLUGIN_ROOT]);
  const edit: EditDeps = { compiler, dispose: () => compiler.dispose() };
  const { studio, errors } = await studioOver(drafts, {}, { edit });
  const auth = { authorization: `Bearer ${studio.token}` };
  const write = { ...auth, origin: studio.url, 'content-type': 'application/json' };
  const get = (path: string) => call(studio.port, { path, headers: auth });
  const post = (path: string, body: unknown, headers: Record<string, string> = write) =>
    call(studio.port, { method: 'POST', path, headers, body: JSON.stringify(body) });
  return { drafts, studio, errors, auth, get, post };
}

const REQUESTS = '/api/v1/drafts/shop/requests';
const SAY = {
  kind: 'say',
  elements: [STACK],
  context: { width: null, state: null, option: null },
  text: '  More air between the plans  ',
};
const ROOMY = {
  variants: [
    {
      label: 'Roomy',
      changes: [{ kind: 'style', id: STACK, property: 'gap', value: { token: '--kit-space-16' } }],
    },
  ],
};

test('a request is kept and told to the pages; a bad one is refused at its field', async () => {
  const { studio, errors, auth, get, post } = await requestStudio();
  try {
    const stream = await openEvents(studio.port, auth);
    const made = await post(REQUESTS, SAY);
    assert.equal(made.status, 201, made.text);
    const view = json<RequestView>(made.text);
    assert.equal(view.status, 'waiting');
    assert.equal(view.text, 'More air between the plans');
    assert.equal(view.version, 1);
    assert.equal(view.stale, false);
    assert.equal(made.headers.location, `/api/v1/requests/${view.id}`);
    const heard = await stream.next();
    assert.equal(heard.event, 'requests');
    assert.deepEqual(json(heard.data), { slug: 'shop' });
    stream.close();
    const listed = json<Requests>((await get(REQUESTS)).text);
    assert.deepEqual(
      listed.requests.map((one) => one.id),
      [view.id],
    );
    assert.deepEqual(listed.listening, { state: 'off', since: null });

    const bad = async (body: unknown, pointer: string) => {
      const answer = await post(REQUESTS, body);
      assert.equal(answer.status, 422, JSON.stringify(body));
      const problem = json<Problem>(answer.text);
      assert.equal(problem.code, 'BODY_INVALID');
      assert.ok(
        (problem.errors ?? []).some((entry) => entry.pointer === pointer),
        `${pointer} in ${answer.text}`,
      );
    };
    await bad({ ...SAY, text: '   ' }, '/text');
    await bad({ ...SAY, kind: 'improve', elements: [] }, '/elements');
    await bad({ ...SAY, elements: ['../../x:div'] }, '/elements/0');
    await bad({ ...SAY, kind: 'note' }, '/note');
    await bad({ ...SAY, note: '00000000-0000-4000-8000-000000000001' }, '/note');
    await bad({ ...SAY, text: 'x'.repeat(1_001) }, '/text');
    await bad({ ...SAY, extra: true }, '/extra');
    const noOrigin = { ...auth, 'content-type': 'application/json' };
    assert.equal((await post(REQUESTS, SAY, noOrigin)).status, 403);
    const missing = await get('/api/v1/drafts/nope/requests');
    assert.equal(missing.status, 404);
    assert.equal(json<Problem>(missing.text).code, 'DRAFT_NOT_FOUND');
  } finally {
    await studio.close();
  }
  assert.deepEqual(errors, []);
});

test('the take hands requests over with the notes; only a taken one takes an answer', async () => {
  const { studio, errors, get, post } = await requestStudio();
  try {
    const view = json<RequestView>((await post(REQUESTS, SAY)).text);
    const note = { kind: 'note', slug: 'shop', element: null, text: 'Darker footer' };
    assert.equal((await post('/api/v1/inbox', note)).status, 202);
    const taken = await post('/api/v1/inbox/take', {});
    assert.equal(taken.status, 200, taken.text);
    const take = json<InboxTake>(taken.text);
    assert.deepEqual(
      take.items.map((item) => item.text),
      ['Darker footer'],
    );
    assert.deepEqual(take.requests, [
      { id: view.id, slug: 'shop', kind: 'say', text: view.text, elements: [STACK] },
    ]);
    const working = json<Requests>((await get(REQUESTS)).text);
    assert.equal(working.requests[0]?.status, 'taken');
    assert.equal(working.listening.state, 'working');
    // A second take finds nothing: the request is Claude's now.
    assert.deepEqual(json<InboxTake>((await post('/api/v1/inbox/take', {})).text).requests, []);

    const answer = `/api/v1/requests/${view.id}/answer`;
    const four = { variants: [0, 1, 2, 3].map(() => ROOMY.variants[0]) };
    assert.equal((await post(answer, four)).status, 422);
    const answered = await post(answer, ROOMY);
    assert.equal(answered.status, 200, answered.text);
    assert.equal(json<RequestView>(answered.text).status, 'answered');
    const again = await post(answer, ROOMY);
    assert.equal(again.status, 409);
    assert.equal(json<Problem>(again.text).code, 'REQUEST_NOT_TAKEN');
    const done = await post(`/api/v1/requests/${view.id}/done`, { message: 'Done' });
    assert.equal(json<Problem>(done.text).code, 'REQUEST_NOT_TAKEN');
    const unknown = '00000000-0000-4000-8000-000000000009';
    const lost = await post(`/api/v1/requests/${unknown}/fail`, { reason: 'No' });
    assert.equal(lost.status, 404);
    assert.equal(json<Problem>(lost.text).code, 'REQUEST_NOT_FOUND');
    assert.equal((await post('/api/v1/requests/not-a-uuid/done', { message: '' })).status, 404);
  } finally {
    await studio.close();
  }
  assert.deepEqual(errors, []);
});

test('an answer larger than 64 KB is refused before it is read', async () => {
  const { studio, errors, post } = await requestStudio();
  try {
    const view = json<RequestView>((await post(REQUESTS, SAY)).text);
    await post('/api/v1/inbox/take', {});
    const long = (n: number) => ({ kind: 'text', id: TEXT, value: `${n}`.padEnd(600, 'x') });
    const variant = { label: 'Long', changes: Array.from({ length: 40 }, (_, n) => long(n)) };
    const body = { variants: [variant, variant, variant] };
    const answer = await post(`/api/v1/requests/${view.id}/answer`, body);
    assert.equal(answer.status, 413);
    assert.equal(json<Problem>(answer.text).code, 'BODY_TOO_LARGE');
  } finally {
    await studio.close();
  }
  assert.deepEqual(errors, []);
});

test('a waiting take ends at once when a request comes', async () => {
  const { studio, errors, post } = await requestStudio();
  try {
    const waiting = post('/api/v1/inbox/take', { timeout: 5 });
    await pause(100);
    const view = json<RequestView>((await post(REQUESTS, SAY)).text);
    const answer = await waiting;
    assert.deepEqual(
      json<InboxTake>(answer.text).requests.map((one) => one.id),
      [view.id],
    );
  } finally {
    await studio.close();
  }
  assert.deepEqual(errors, []);
});

test('show reads the elements now; a change after the answer makes it stale', async () => {
  const { drafts, studio, errors, get, post } = await requestStudio();
  try {
    const asked = { ...SAY, elements: [TEXT], text: 'A warmer word' };
    const view = json<RequestView>((await post(REQUESTS, asked)).text);
    await post('/api/v1/inbox/take', {});
    const shown = await get(`/api/v1/requests/${view.id}`);
    assert.equal(shown.status, 200, shown.text);
    const context = json<RequestContext>(shown.text);
    assert.equal(context.slug, 'shop');
    assert.equal(context.format, 'scss');
    assert.deepEqual(context.locked, []);
    assert.deepEqual(
      context.elements.map((element) => [element.id, element.tag, element.text]),
      [[TEXT, 'Text', 'Plans']],
    );
    const warm = { label: 'Warm', changes: [{ kind: 'text', id: TEXT, value: 'Pick' }] };
    const answered = await post(`/api/v1/requests/${view.id}/answer`, { variants: [warm] });
    assert.equal(answered.status, 200, answered.text);
    const stale = async () => json<Requests>((await get(REQUESTS)).text).requests[0]?.stale;
    assert.equal(await stale(), false);
    // New indentation is no change of the element: moving it with its parent keeps it fresh.
    drafts.writeText('shop', `v1/${TSX_FILE}`, pricing('Plans', '    '));
    assert.equal(await stale(), false);
    // Another writer changed its text: the variants were made for the old one.
    drafts.writeText('shop', `v1/${TSX_FILE}`, pricing('Prices'));
    assert.equal(await stale(), true);
  } finally {
    await studio.close();
  }
  assert.deepEqual(errors, []);
});

test('the listening read answers the state, and with no drafts a change is told once', async () => {
  const { store } = tempDrafts();
  const { studio, errors } = await studioOver(store);
  const auth = { authorization: `Bearer ${studio.token}` };
  const write = { ...auth, origin: studio.url, 'content-type': 'application/json' };
  const read = () => call(studio.port, { path: '/api/v1/listening', headers: auth });
  const post = (path: string, body: unknown) =>
    call(studio.port, { method: 'POST', path, headers: write, body: JSON.stringify(body) });
  try {
    const before = await read();
    assert.equal(before.status, 200, before.text);
    assert.deepEqual(json<Listening>(before.text), { state: 'off', since: null });
    assert.equal(
      (await call(studio.port, { path: '/api/v1/listening' })).status,
      401,
      'it needs the token or the page cookie',
    );

    const stream = await openEvents(studio.port, auth);
    // A take that ends at once: Claude's session was seen, so it listens for the grace.
    const taken = await post('/api/v1/inbox/take', {});
    assert.equal(taken.status, 200, taken.text);
    // A note after it: its `inbox` event comes after whatever the take told.
    const note = { kind: 'note', slug: null, element: null, text: 'Look at the footer' };
    assert.equal((await post('/api/v1/inbox', note)).status, 202);
    const heard: { event: string; data: string }[] = [];
    for (let event = await stream.next(); event.event !== 'inbox'; event = await stream.next()) {
      heard.push(event);
    }
    stream.close();
    const told = heard.filter((event) => event.event === 'listening');
    assert.equal(told.length, 1, JSON.stringify(heard));
    const state = json<Listening>(told[0]?.data ?? '');
    assert.equal(state.state, 'listening');
    assert.equal(typeof state.since, 'string');
    assert.ok(!heard.some((event) => event.event === 'requests'), 'no draft to tell');

    const after = await read();
    assert.deepEqual(json<Listening>(after.text), state);
  } finally {
    await studio.close();
  }
  assert.deepEqual(errors, []);
});

test('the person drops a request; an unknown one is not found', async () => {
  const { studio, errors, get, post } = await requestStudio();
  try {
    const view = json<RequestView>((await post(REQUESTS, SAY)).text);
    const dropped = await post(`${REQUESTS}/${view.id}/drop`, {});
    assert.equal(dropped.status, 200, dropped.text);
    assert.equal(json<RequestView>(dropped.text).status, 'dropped');
    assert.deepEqual(json<InboxTake>((await post('/api/v1/inbox/take', {})).text).requests, []);
    const unknown = `${REQUESTS}/00000000-0000-4000-8000-000000000009/drop`;
    assert.equal(json<Problem>((await post(unknown, {})).text).code, 'REQUEST_NOT_FOUND');
    assert.equal(json<Requests>((await get(REQUESTS)).text).requests[0]?.status, 'dropped');
  } finally {
    await studio.close();
  }
  assert.deepEqual(errors, []);
});
