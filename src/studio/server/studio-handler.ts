// The studio origin: pages and the JSON API, every request through the same checks in one order.

import type { IncomingMessage, ServerResponse } from 'node:http';
import { KitvasError, type Translate, type Zod } from '../../shared/index.ts';
import { readJsonBody } from '../http/body.ts';
import { issueEntries, problemReply, RequestError } from '../http/problem.ts';
import { HTML_TYPE, jsonReply, send } from '../http/reply.ts';
import { findRoute, type Route } from '../http/router.ts';
import { lockedPage } from '../pages/locked.ts';
import type { DeniedLog } from '../security/denied-log.ts';
import { cookieName, cookieValue } from '../security/page-cookie.ts';
import { bearerToken, originAllowed, studioSiteAllowed } from '../security/request-checks.ts';
import { studioHeaders } from '../security/response-headers.ts';
import { newNonce, secretMatches } from '../security/token.ts';
import { checkTransport, requestTarget } from './transport.ts';

export type StudioContext = {
  routes: Route[];
  token: string;
  /** The per-start secret of the page cookie. */
  pageSecret: string;
  /** The style sheet of the studio's pages, the locked page included. */
  skin: string;
  port: number;
  framePort: number;
  bodyLimit: number;
  t: Translate;
  onError: ((error: unknown) => void) | undefined;
  /** Every answer goes through it; it logs the refusals. */
  denied: DeniedLog | undefined;
};

/** Why a request was refused, for the log: set before the answer is sent. */
type Refusal = { code: string | undefined };

/** The code of the locked page, with or without a used-up link. */
const PAGE_LOCKED = 'PAGE_LOCKED';

/** Did the request bring this studio's page cookie? */
function hasPageCookie(ctx: StudioContext, req: IncomingMessage): boolean {
  const value = cookieValue(req.headers.cookie, cookieName(ctx.port));
  return secretMatches(value, ctx.pageSecret);
}

/** API routes: the Origin of a write, then the page cookie or the token, before any body is read. */
function authorize(ctx: StudioContext, route: Route, req: IncomingMessage, host: string): void {
  if (route.kind === 'page') return;
  if (route.policy === 'write' && !originAllowed(req.headers.origin, host)) {
    throw new RequestError('REQUEST_FORBIDDEN', { detail: ctx.t('studio.deny.origin') });
  }
  if (hasPageCookie(ctx, req)) return;
  if (!secretMatches(bearerToken(req.headers.authorization), ctx.token)) {
    throw new RequestError('TOKEN_INVALID', {}, { headers: { 'www-authenticate': 'Bearer' } });
  }
}

function parseBody(schema: Zod.ZodType, raw: unknown): unknown {
  const parsed = schema.safeParse(raw);
  if (parsed.success) return parsed.data;
  throw new RequestError('BODY_INVALID', {}, { errors: issueEntries(parsed.error.issues) });
}

async function serve(
  ctx: StudioContext,
  req: IncomingMessage,
  res: ServerResponse,
  nonce: string,
  headers: Record<string, string>,
  refusal: Refusal,
): Promise<void> {
  const host = checkTransport(req, ctx.port, ctx.t);
  if (!studioSiteAllowed(req.headers)) {
    throw new RequestError('REQUEST_FORBIDDEN', { detail: ctx.t('studio.deny.site') });
  }
  const { path, query } = requestTarget(req, ctx.t);
  const method = req.method ?? '';
  const found = findRoute(ctx.routes, method, path);
  if (!found) throw new RequestError('ROUTE_NOT_FOUND', { path });
  if ('allow' in found) {
    const allow = found.allow.join(', ');
    throw new RequestError('METHOD_NOT_ALLOWED', { method, path }, { headers: { allow } });
  }
  const { route } = found;
  authorize(ctx, route, req, host);
  const params = route.params.safeParse(found.params);
  if (!params.success) throw new RequestError('ROUTE_NOT_FOUND', { path });
  const input = { params: params.data, headers: req.headers, query, host };
  if (route.kind === 'page') {
    if (route.policy === 'page' && !hasPageCookie(ctx, req)) {
      refusal.code = PAGE_LOCKED;
      const body = lockedPage({ t: ctx.t, nonce, skin: ctx.skin, reason: 'closed' });
      send(res, { status: 401, type: HTML_TYPE, body }, headers);
      return;
    }
    const answer = await route.handle({ ...input, nonce });
    const reply = typeof answer === 'string' ? { status: 200, body: answer } : answer;
    // `/open` with a wrong or used code answers the locked page itself.
    if (reply.status === 401 || reply.status === 403) refusal.code = PAGE_LOCKED;
    send(res, { ...reply, type: reply.type ?? HTML_TYPE }, headers);
    return;
  }
  const body = route.request
    ? parseBody(route.request, await readJsonBody(req, ctx.bodyLimit, ctx.t))
    : undefined;
  const result = await route.handle({ ...input, body });
  if (result.open) {
    result.open(res, headers);
    return;
  }
  // An answer that does not match its schema is a bug: it becomes a 500, never a wrong payload.
  const value = route.response.schema.parse(result.body);
  send(res, jsonReply(result.status, value, result.headers), headers);
}

export async function handleStudio(
  ctx: StudioContext,
  req: IncomingMessage,
  res: ServerResponse,
): Promise<void> {
  const nonce = newNonce();
  const headers = studioHeaders(nonce, ctx.framePort);
  const refusal: Refusal = { code: undefined };
  res.once('finish', () => ctx.denied?.(req, res.statusCode, refusal.code));
  try {
    await serve(ctx, req, res, nonce, headers, refusal);
  } catch (cause) {
    if (cause instanceof KitvasError) refusal.code = cause.code;
    send(res, problemReply(cause, ctx.t, ctx.onError), headers, req.method === 'HEAD');
  }
}
