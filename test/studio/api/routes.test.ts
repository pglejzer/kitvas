import assert from 'node:assert/strict';
import type { IncomingHttpHeaders } from 'node:http';
import { test } from 'node:test';
import { DEFAULT_STATES } from '../../../src/drafts/index.ts';
import { KitvasError } from '../../../src/shared/index.ts';
import { apiRoutes } from '../../../src/studio/api/routes.ts';
import { etagOf } from '../../../src/studio/http/etag.ts';
import { apiDeps } from '../../helpers/api.ts';
import { NOW, shopDraft } from '../../helpers/drafts.ts';

type RunInput = { params?: Record<string, string>; headers?: IncomingHttpHeaders; body?: unknown };

function setup() {
  const { store } = shopDraft();
  const routes = apiRoutes(apiDeps({ drafts: store }));
  const run = async (id: string, input: RunInput = {}) => {
    const route = routes.find((candidate) => candidate.id === id);
    assert.ok(route, id);
    const result = await route.handle({
      params: input.params ?? {},
      headers: input.headers ?? {},
      query: new URLSearchParams(),
      host: '127.0.0.1:5000',
      body: input.body ?? {},
    });
    // The handler's answer has the shape the route promises.
    route.response.schema.parse(result.body);
    return result;
  };
  return { store, routes, run };
}

const isCode = (code: string) => (error: unknown) =>
  error instanceof KitvasError && error.code === code;

test('status names the plugin version and the prototype port', async () => {
  const { run } = setup();
  assert.deepEqual((await run('getStatus')).body, {
    name: 'kitvas',
    version: '0.1.0',
    startedAt: NOW.toISOString(),
    framePort: 5001,
  });
});

test('drafts are listed with their latest version', async () => {
  const { run } = setup();
  assert.deepEqual((await run('listDrafts')).body, {
    items: [{ slug: 'shop', title: 'Shop', kit: 'tiny', version: 1, valid: true }],
    nextCursor: null,
  });
});

test('a draft comes with the ETag of its stored file', async () => {
  const { run, store } = setup();
  const result = await run('getDraft', { params: { slug: 'shop' } });
  assert.equal((result.body as { slug: string }).slug, 'shop');
  assert.equal(result.headers?.etag, etagOf(store.readText('shop', 'draft.json') ?? ''));
  await assert.rejects(run('getDraft', { params: { slug: 'nope' } }), isCode('DRAFT_NOT_FOUND'));
});

test('a new version needs the current ETag', async () => {
  const { run, store } = setup();
  const etag = etagOf(store.readText('shop', 'draft.json') ?? '');
  const params = { slug: 'shop' };
  await assert.rejects(run('createVersion', { params }), isCode('PRECONDITION_REQUIRED'));
  await assert.rejects(
    run('createVersion', { params, headers: { 'if-match': '"stale"' } }),
    isCode('PRECONDITION_FAILED'),
  );
  const created = await run('createVersion', { params, headers: { 'if-match': etag } });
  assert.equal(created.status, 201);
  assert.deepEqual(created.body, { slug: 'shop', version: 2 });
  assert.equal(created.headers?.location, '/api/v1/drafts/shop/versions/2');
  await assert.rejects(
    run('createVersion', { params, headers: { 'if-match': etag } }),
    isCode('PRECONDITION_FAILED'),
  );
});

test('a version says whether it is built and which states it has', async () => {
  const { run } = setup();
  const result = await run('getVersion', { params: { slug: 'shop', number: '1' } });
  const body = result.body as { number: number; built: boolean; states: unknown };
  assert.equal(body.number, 1);
  assert.equal(body.built, false);
  assert.deepEqual(body.states, DEFAULT_STATES);
  await assert.rejects(
    run('getVersion', { params: { slug: 'shop', number: '4' } }),
    isCode('VERSION_NOT_FOUND'),
  );
});

test("a link names the studio's port on kitvas.localhost, with a localhost twin", async () => {
  const { run } = setup();
  const result = await run('createLink', { body: { path: '/drafts/shop' } });
  const body = result.body as { url: string; fallbackUrl: string; expiresAt: string };
  const url = new URL(body.url);
  assert.equal(url.origin, 'http://kitvas.localhost:5000');
  assert.equal(url.pathname, '/open');
  assert.equal(url.searchParams.get('to'), '/drafts/shop');
  assert.match(url.searchParams.get('code') ?? '', /^[A-Za-z0-9_-]{43}$/);
  assert.equal(body.fallbackUrl, `http://localhost:5000/open${url.search}`);
  assert.equal(body.expiresAt, new Date(NOW.getTime() + 60_000).toISOString());
});

test('the route table: unique ids, API paths, a policy and schemas on every route', () => {
  const { routes } = setup();
  assert.equal(new Set(routes.map((route) => route.id)).size, routes.length);
  for (const route of routes) {
    assert.equal(route.kind, 'api', route.id);
    assert.ok(route.path.startsWith('/api/v1/'), route.id);
    assert.ok(route.policy === 'read' || route.policy === 'write', route.id);
    assert.ok(route.params, route.id);
    assert.ok(route.response.schema, route.id);
    if (route.policy === 'write') assert.ok(route.request, `${route.id} reads a body`);
    if (route.method === 'GET') assert.equal(route.request, null, route.id);
  }
});

test('the shutdown route answers first and stops after', async () => {
  let stopped = 0;
  const routes = apiRoutes(
    apiDeps({
      shutdown: () => {
        stopped += 1;
      },
    }),
  );
  const route = routes.find((candidate) => candidate.id === 'shutdown');
  assert.ok(route);
  const result = await route.handle({
    params: {},
    headers: {},
    query: new URLSearchParams(),
    host: '127.0.0.1:5000',
    body: {},
  });
  assert.equal(result.status, 202);
  assert.deepEqual(result.body, { stopping: true });
  assert.equal(stopped, 0);
  await new Promise((resolve) => setImmediate(resolve));
  assert.equal(stopped, 1);
});
