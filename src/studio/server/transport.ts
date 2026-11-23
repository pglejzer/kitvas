// Checks every request gets first, on both origins.

import type { IncomingMessage } from 'node:http';
import type { Translate } from '../../shared/index.ts';
import { RequestError } from '../http/problem.ts';
import { splitTarget } from '../http/router.ts';
import { allowedHost, repeatedHeaders } from '../security/request-checks.ts';

/** One copy of the key headers, HTTP/1.1, a Host naming this server. Returns the Host. */
export function checkTransport(req: IncomingMessage, port: number, t: Translate): string {
  const repeated = repeatedHeaders(req.rawHeaders);
  if (repeated.length > 0) {
    const detail = t('studio.bad.duplicate', { name: repeated.join(', ') });
    throw new RequestError('REQUEST_INVALID', { detail });
  }
  if (req.httpVersion !== '1.1') {
    throw new RequestError('REQUEST_INVALID', { detail: t('studio.bad.version') });
  }
  const host = allowedHost(req.headers.host, port);
  if (!host) throw new RequestError('REQUEST_FORBIDDEN', { detail: t('studio.deny.host') });
  return host;
}

/** The path and query of the target; any form but a plain path is refused. */
export function requestTarget(
  req: IncomingMessage,
  t: Translate,
): { path: string; query: URLSearchParams } {
  const target = splitTarget(req.url ?? '');
  if (!target) throw new RequestError('REQUEST_INVALID', { detail: t('studio.bad.target') });
  return target;
}
