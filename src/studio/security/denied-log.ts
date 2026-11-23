// A log line for every refused request (wrong Host, site, Origin, token or page cookie), so the
// studio's log shows probes and attacks (ASVS 5.0 v5.0.0-16.3.2, 16.3.3). At most 20 a minute.

import type { IncomingHttpHeaders } from 'node:http';

/** The parts of a request a line is made of; an `IncomingMessage` fits. */
export type DeniedRequest = {
  method?: string | undefined;
  url?: string | undefined;
  headers: IncomingHttpHeaders;
};

/** Logs `req` when `status` is a refusal (401 or 403); `code` says why, when known. */
export type DeniedLog = (req: DeniedRequest, status: number, code: string | undefined) => void;

export const DENIED_PER_MINUTE = 20;
const MINUTE_MS = 60_000;
const MAX_PATH = 200;
const MAX_HEADER = 100;

/** What a client sent, as one line of printable ASCII: anything else becomes `?`. */
function clean(text: string | undefined, max: number): string {
  if (text === undefined || text === '') return '-';
  return text.replace(/[^\x21-\x7e]/g, '?').slice(0, max);
}

/**
 * One refusal: status, code, method, the path without its query (it can hold a one-time code),
 * Host, and Origin when sent. Never the token, the cookie or any other header.
 */
export function deniedLine(req: DeniedRequest, status: number, code: string | undefined): string {
  const path = (req.url ?? '').split('?')[0];
  const host = typeof req.headers.host === 'string' ? req.headers.host : undefined;
  const origin = typeof req.headers.origin === 'string' ? req.headers.origin : undefined;
  const line = [
    'denied',
    String(status),
    clean(code, MAX_HEADER),
    clean(req.method, MAX_HEADER),
    clean(path, MAX_PATH),
    `host=${clean(host, MAX_HEADER)}`,
  ];
  if (origin !== undefined) line.push(`origin=${clean(origin, MAX_HEADER)}`);
  return line.join(' ');
}

/**
 * Writes refusals through `write`, at most 20 in a minute. The count of the ones left out is
 * written with the first refusal of the next minute.
 */
export function createDeniedLog(
  write: (line: string) => void,
  now: () => number = Date.now,
): DeniedLog {
  let start = Number.NEGATIVE_INFINITY;
  let written = 0;
  let dropped = 0;
  return (req, status, code) => {
    if (status !== 401 && status !== 403) return;
    const at = now();
    if (at - start >= MINUTE_MS) {
      if (dropped > 0) {
        write(
          `denied: ${dropped} more refused requests were not logged (at most ${DENIED_PER_MINUTE} a minute)`,
        );
      }
      start = at;
      written = 0;
      dropped = 0;
    }
    if (written >= DENIED_PER_MINUTE) {
      dropped += 1;
      return;
    }
    written += 1;
    write(deniedLine(req, status, code));
  };
}
