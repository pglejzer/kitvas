// Strong entity tags and the If-Match rule for changes (RFC 9110, sections 8.8.3 and 13.1.1).

import { createHash } from 'node:crypto';
import { RequestError } from './problem.ts';

/** A strong ETag of a resource's stored text. */
export const etagOf = (text: string): string =>
  `"${createHash('sha256').update(text).digest('base64url').slice(0, 27)}"`;

/** Does an `If-Match` value allow a change to a resource tagged `etag`? Weak tags never match. */
export function ifMatchPasses(header: string, etag: string): boolean {
  const tags = header.split(',').map((tag) => tag.trim());
  return tags.includes('*') || tags.includes(etag);
}

/** A change needs `If-Match`: 428 without it, 412 when the resource changed since it was read. */
export function requireIfMatch(
  header: string | string[] | undefined,
  etag: string,
  path: string,
): void {
  if (header === undefined) throw new RequestError('PRECONDITION_REQUIRED', { path });
  const value = Array.isArray(header) ? header.join(', ') : header;
  if (!ifMatchPasses(value, etag)) throw new RequestError('PRECONDITION_FAILED', { path });
}
