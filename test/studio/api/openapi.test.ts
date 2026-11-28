import assert from 'node:assert/strict';
import { test } from 'node:test';
import { SLUG } from '../../../src/drafts/index.ts';
import { openApi } from '../../../src/studio/api/openapi.ts';
import { apiRoutes } from '../../../src/studio/api/routes.ts';
import { apiDeps } from '../../helpers/studio/api.ts';

type Operation = {
  operationId: string;
  parameters: { name: string; in: string; schema: { pattern?: string } }[];
  requestBody?: { content: Record<string, { schema: { additionalProperties?: unknown } }> };
  responses: Record<string, unknown>;
};

type Doc = {
  openapi: string;
  info: { version: string };
  paths: Record<string, Record<string, Operation>>;
  security: Record<string, string[]>[];
  components: {
    schemas: { Problem: { required?: string[] } };
    securitySchemes: Record<string, Record<string, string>>;
  };
};

const routes = apiRoutes(apiDeps());
const doc = openApi(routes, '1.1.0', 5000) as Doc;

test('either the token or the page cookie of this port opens the API', () => {
  assert.deepEqual(doc.security, [{ token: [] }, { page: [] }]);
  assert.deepEqual(doc.components.securitySchemes, {
    token: { type: 'http', scheme: 'bearer' },
    page: { type: 'apiKey', in: 'cookie', name: 'kitvas_5000' },
  });
});

test('the document lists exactly the routes of the table', () => {
  assert.equal(doc.openapi, '3.1.1');
  assert.equal(doc.info.version, '1.1.0');
  const fromDoc = Object.entries(doc.paths)
    .flatMap(([path, operations]) =>
      Object.entries(operations).map(
        ([method, op]) => `${method.toUpperCase()} ${path} ${op.operationId}`,
      ),
    )
    .sort();
  const fromTable = routes.map((route) => `${route.method} ${route.path} ${route.id}`).sort();
  assert.deepEqual(fromDoc, fromTable);
});

test('parameters, bodies, responses and the problem shape come from the zod schemas', () => {
  const create = doc.paths['/api/v1/drafts/{slug}/versions']?.post;
  assert.ok(create);
  assert.equal(create.parameters[0]?.name, 'slug');
  assert.equal(create.parameters[0]?.in, 'path');
  assert.equal(create.parameters[0]?.schema.pattern, SLUG.source);
  assert.equal(create.requestBody?.content['application/json']?.schema.additionalProperties, false);
  assert.ok(create.responses['201']);
  assert.ok(create.responses.default);
  const required = doc.components.schemas.Problem.required ?? [];
  assert.deepEqual([...required].sort(), ['code', 'detail', 'status', 'title', 'type']);
});

test('the events route is a text/event-stream', () => {
  const events = doc.paths['/api/v1/events']?.get;
  assert.ok(events);
  const ok = events.responses['200'] as { content: Record<string, unknown> };
  assert.ok(ok.content['text/event-stream']);
  assert.equal(ok.content['application/json'], undefined);
});
