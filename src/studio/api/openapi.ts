// OpenAPI 3.1 of the API, generated from the route table so the two cannot drift apart.

import { type Zod, z } from '../../shared/index.ts';
import { ProblemSchema } from '../http/problem.ts';
import { type ApiRoute, pathParams } from '../http/router.ts';
import { cookieName } from '../security/page-cookie.ts';

type JsonObject = Record<string, unknown>;

/** JSON Schema 2020-12, which OpenAPI 3.1 takes as it is, without the `$schema` line. */
function jsonSchema(schema: Zod.ZodType, io: 'input' | 'output'): JsonObject {
  const full = z.toJSONSchema(schema, { io, unrepresentable: 'any' }) as unknown as JsonObject;
  return Object.fromEntries(Object.entries(full).filter(([key]) => key !== '$schema'));
}

const PROBLEM = {
  description: 'Problem details (RFC 9457).',
  content: { 'application/problem+json': { schema: { $ref: '#/components/schemas/Problem' } } },
};

function operation(route: ApiRoute): JsonObject {
  const params = jsonSchema(route.params, 'input') as { properties?: Record<string, unknown> };
  const op: JsonObject = {
    operationId: route.id,
    summary: route.summary,
    parameters: pathParams(route.path).map((name) => ({
      name,
      in: 'path',
      required: true,
      schema: params.properties?.[name] ?? { type: 'string' },
    })),
    responses: {
      [String(route.response.status)]: {
        description: route.summary,
        content: {
          [route.response.stream ? 'text/event-stream' : 'application/json']: {
            schema: jsonSchema(route.response.schema, 'output'),
          },
        },
      },
      default: PROBLEM,
    },
  };
  if (route.request) {
    op.requestBody = {
      required: true,
      content: { 'application/json': { schema: jsonSchema(route.request, 'input') } },
    };
  }
  return op;
}

/** `port` is the studio's own: the page cookie's name carries it. */
export function openApi(routes: readonly ApiRoute[], version: string, port: number): JsonObject {
  const paths: Record<string, JsonObject> = {};
  for (const route of routes) {
    paths[route.path] = { ...paths[route.path], [route.method.toLowerCase()]: operation(route) };
  }
  return {
    openapi: '3.1.1',
    info: { title: 'kitvas studio API', version },
    // Either one: the CLI sends the token, the studio's pages send the cookie.
    security: [{ token: [] }, { page: [] }],
    components: {
      securitySchemes: {
        token: { type: 'http', scheme: 'bearer' },
        page: { type: 'apiKey', in: 'cookie', name: cookieName(port) },
      },
      schemas: { Problem: jsonSchema(ProblemSchema, 'output') },
    },
    paths,
  };
}
