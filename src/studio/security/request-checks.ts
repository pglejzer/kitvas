// Who may talk to the studio: checks on a request's headers, made before any route runs.

import type { IncomingHttpHeaders } from 'node:http';
import { HOST_NAMES } from './host-names.ts';

/** Headers that must come once; two copies could make two parts of a stack disagree. */
const SINGLE = ['host', 'origin', 'authorization', 'content-length'];

/** Names in `SINGLE` sent more than once, read from the raw header list. */
export function repeatedHeaders(rawHeaders: readonly string[]): string[] {
  const counts = new Map<string, number>();
  for (let index = 0; index < rawHeaders.length; index += 2) {
    const name = (rawHeaders[index] ?? '').toLowerCase();
    if (SINGLE.includes(name)) counts.set(name, (counts.get(name) ?? 0) + 1);
  }
  return SINGLE.filter((name) => (counts.get(name) ?? 0) > 1);
}

/**
 * The Host in lower case when it names this server: `kitvas.localhost:<port>`, `localhost:<port>`
 * or `127.0.0.1:<port>`. Host names are case-insensitive; the port must be this server's own.
 */
export function allowedHost(host: string | undefined, port: number): string | undefined {
  const value = (host ?? '').toLowerCase();
  return HOST_NAMES.some((name) => value === `${name}:${port}`) ? value : undefined;
}

/** Fetch Metadata: the studio's own pages, an address a person typed, or a client that is no browser. */
export function studioSiteAllowed(headers: IncomingHttpHeaders): boolean {
  const site = headers['sec-fetch-site'];
  return site === undefined || site === 'same-origin' || site === 'none';
}

/**
 * The prototype origin. Its files are guarded by the frame key, so any page may load them; a
 * navigation must be the studio framing the prototype, or a person opening it.
 */
export function frameSiteAllowed(headers: IncomingHttpHeaders): boolean {
  if (headers['sec-fetch-mode'] !== 'navigate') return true;
  const site = headers['sec-fetch-site'];
  if (site === undefined || site === 'none') return true;
  const dest = headers['sec-fetch-dest'];
  const framed = dest === 'iframe' || dest === 'frame';
  return framed && (site === 'same-origin' || site === 'same-site');
}

/** A write comes from the studio's own pages: `Origin` is `http://` plus the checked Host. */
export function originAllowed(origin: string | undefined, host: string): boolean {
  return origin === `http://${host}`;
}

/** The token of `Authorization: Bearer <token>`. */
export function bearerToken(header: string | undefined): string | undefined {
  return /^Bearer ([A-Za-z0-9_-]+)$/i.exec(header ?? '')?.[1];
}
