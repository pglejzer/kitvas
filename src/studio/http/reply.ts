// Writes responses. The caller passes its origin's security headers; every response gets them.

import type { ServerResponse } from 'node:http';

export const JSON_TYPE = 'application/json; charset=utf-8';
export const PROBLEM_TYPE = 'application/problem+json; charset=utf-8';
export const HTML_TYPE = 'text/html; charset=utf-8';

export type Reply = {
  status: number;
  /** Content-Type of the body. */
  type: string;
  body: string | Buffer;
  headers?: Record<string, string>;
};

export const jsonReply = (
  status: number,
  value: unknown,
  headers: Record<string, string> = {},
): Reply => ({ status, type: JSON_TYPE, body: JSON.stringify(value), headers });

/** Sends `reply` after the `base` headers; `head` leaves the body out. */
export function send(
  res: ServerResponse,
  reply: Reply,
  base: Record<string, string>,
  head = false,
): void {
  if (res.headersSent) {
    res.destroy();
    return;
  }
  const body = typeof reply.body === 'string' ? Buffer.from(reply.body, 'utf8') : reply.body;
  res.writeHead(reply.status, {
    ...base,
    ...reply.headers,
    'content-type': reply.type,
    'content-length': String(body.length),
  });
  res.end(head ? undefined : body);
}
