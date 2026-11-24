// The route table: what a route declares, and how a request finds its route.

import type { IncomingHttpHeaders, ServerResponse } from 'node:http';
import type { Zod } from '../../shared/index.ts';

export type Method = 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE';

type Common<P> = {
  /** Unique; the OpenAPI operationId of an API route. */
  id: string;
  /** `/api/v1/drafts/{slug}`: literal segments and `{name}` parameters. */
  path: string;
  /** Checks the path parameters; a mismatch is 404. */
  params: Zod.ZodType<P>;
};

type Input<P> = {
  params: P;
  headers: IncomingHttpHeaders;
  query: URLSearchParams;
  /** The request's Host, checked and lower-cased: a name the studio answers to, with its port. */
  host: string;
};

export type ApiInput<P, B> = Input<P> & { body: B };
export type PageInput<P> = Input<P> & { nonce: string };

export type ApiResult = {
  status: number;
  body: unknown;
  headers?: Record<string, string>;
  /** Set by a stream route: it writes the response itself, after the origin's headers. */
  open?: (res: ServerResponse, headers: Record<string, string>) => void;
};

/** A page answer other than plain HTML: a redirect, or a page with another status. */
export type PageReply = {
  status: number;
  body: string;
  headers?: Record<string, string>;
  /** The content type; HTML when absent. */
  type?: string;
};

/** `read` needs the token or the page cookie; `write` also needs the studio's own Origin. */
export type ApiRouteSpec<P, B> = Common<P> & {
  summary: string;
  method: Method;
  policy: 'read' | 'write';
  /** The JSON body; `null` when the route reads none. Every `write` route has one. */
  request: Zod.ZodType<B> | null;
  /** Largest body in bytes for this route; the studio's own limit when absent (image upload). */
  bodyLimit?: number;
  /** With `stream`, the response is `text/event-stream` and the schema is one event. */
  response: { status: number; schema: Zod.ZodType; stream?: true };
  handle(input: ApiInput<P, B>): ApiResult | Promise<ApiResult>;
};

export type PageRouteSpec<P> = Common<P> & {
  /** The page's HTML, or a reply with its own status and headers. */
  handle(input: PageInput<P>): string | PageReply | Promise<string | PageReply>;
};

export type ApiRoute = ApiRouteSpec<unknown, unknown> & { kind: 'api' };
/** `page` needs the page cookie; `open` does not (it is how a browser gets the cookie). */
export type PageRoute = PageRouteSpec<unknown> & {
  kind: 'page';
  method: 'GET';
  policy: 'page' | 'open';
};
export type Route = ApiRoute | PageRoute;

export function apiRoute<P, B = undefined>(spec: ApiRouteSpec<P, B>): ApiRoute {
  return { kind: 'api', ...spec } as unknown as ApiRoute;
}

/** Pages are GET only and need no token: a person opens them by address. */
export function pageRoute<P>(spec: PageRouteSpec<P>): PageRoute {
  return { kind: 'page', method: 'GET', policy: 'page', ...spec } as unknown as PageRoute;
}

/** A page that answers without the page cookie. Only `/open` is one. */
export function openPageRoute<P>(spec: PageRouteSpec<P>): PageRoute {
  return { kind: 'page', method: 'GET', policy: 'open', ...spec } as unknown as PageRoute;
}

const segmentsOf = (path: string): string[] => path.split('/').slice(1);
const isParam = (segment: string): boolean => segment.startsWith('{') && segment.endsWith('}');

/** Parameter names of a path template, in order. */
export const pathParams = (template: string): string[] =>
  segmentsOf(template)
    .filter(isParam)
    .map((segment) => segment.slice(1, -1));

function matchPath(template: string, path: string): Record<string, string> | undefined {
  const want = segmentsOf(template);
  const got = segmentsOf(path);
  if (want.length !== got.length) return undefined;
  const params: Record<string, string> = {};
  for (const [index, part] of want.entries()) {
    const value = got[index] ?? '';
    if (isParam(part)) {
      if (value === '') return undefined;
      params[part.slice(1, -1)] = value;
    } else if (part !== value) {
      return undefined;
    }
  }
  return params;
}

export type Found = { route: Route; params: Record<string, string> } | { allow: Method[] };

/** The route for `method` and `path`; `allow` when the path exists for other methods only. */
export function findRoute(
  routes: readonly Route[],
  method: string,
  path: string,
): Found | undefined {
  const allow = new Set<Method>();
  for (const route of routes) {
    const params = matchPath(route.path, path);
    if (!params) continue;
    if (route.method === method) return { route, params };
    allow.add(route.method);
  }
  return allow.size > 0 ? { allow: [...allow].sort() } : undefined;
}

/** Path and query of an origin-form target (`/a?b=1`); `undefined` for any other form. */
export function splitTarget(target: string): { path: string; query: URLSearchParams } | undefined {
  if (!target.startsWith('/') || target.startsWith('//')) return undefined;
  const at = target.indexOf('?');
  return {
    path: at === -1 ? target : target.slice(0, at),
    query: new URLSearchParams(at === -1 ? '' : target.slice(at + 1)),
  };
}
