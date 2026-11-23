import assert from 'node:assert/strict';
import { test } from 'node:test';
import { z } from '../../../src/shared/index.ts';
import {
  apiRoute,
  findRoute,
  pageRoute,
  pathParams,
  type Route,
  splitTarget,
} from '../../../src/studio/http/router.ts';

const ok = () => ({ status: 200, body: {} });
const slug = z.strictObject({ slug: z.string() });
const empty = z.strictObject({});

const routes: Route[] = [
  pageRoute({ id: 'home', path: '/', params: empty, handle: () => '' }),
  apiRoute({
    id: 'one',
    summary: 'One.',
    method: 'GET',
    path: '/api/v1/drafts/{slug}',
    policy: 'read',
    params: slug,
    request: null,
    response: { status: 200, schema: empty },
    handle: ok,
  }),
  apiRoute({
    id: 'add',
    summary: 'Add.',
    method: 'POST',
    path: '/api/v1/drafts/{slug}/versions',
    policy: 'write',
    params: slug,
    request: empty,
    response: { status: 201, schema: empty },
    handle: ok,
  }),
  apiRoute({
    id: 'remove',
    summary: 'Remove.',
    method: 'DELETE',
    path: '/api/v1/drafts/{slug}',
    policy: 'write',
    params: slug,
    request: empty,
    response: { status: 200, schema: empty },
    handle: ok,
  }),
];

test('a path finds its route and parameters', () => {
  const found = findRoute(routes, 'GET', '/api/v1/drafts/shop');
  assert.ok(found && 'route' in found);
  assert.equal(found.route.id, 'one');
  assert.deepEqual(found.params, { slug: 'shop' });
  const home = findRoute(routes, 'GET', '/');
  assert.ok(home && 'route' in home);
  assert.equal(home.route.kind, 'page');
});

test('a known path with another method lists the allowed ones', () => {
  assert.deepEqual(findRoute(routes, 'PUT', '/api/v1/drafts/shop'), { allow: ['DELETE', 'GET'] });
});

test('unknown paths, empty parameters and extra segments find nothing', () => {
  for (const path of ['/nope', '/api/v1/drafts/', '/api/v1/drafts/shop/x', '/api/v1/drafts']) {
    assert.equal(findRoute(routes, 'GET', path), undefined, path);
  }
});

test('pages are GET pages; parameter names come from the template', () => {
  assert.equal(routes[0]?.method, 'GET');
  assert.equal(routes[0]?.policy, 'page');
  assert.deepEqual(pathParams('/api/v1/drafts/{slug}/versions/{number}'), ['slug', 'number']);
});

test('only an origin-form target has a path and a query', () => {
  const split = splitTarget('/api/v1/drafts?limit=5');
  assert.equal(split?.path, '/api/v1/drafts');
  assert.equal(split?.query.get('limit'), '5');
  assert.equal(splitTarget('/')?.path, '/');
  for (const target of ['http://evil.example/', '//evil.example/x', '*', '']) {
    assert.equal(splitTarget(target), undefined, target);
  }
});
