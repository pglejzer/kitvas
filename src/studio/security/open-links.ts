// One-time links that open the studio in a browser: a code that works once, for 60 s.

import { createHash } from 'node:crypto';
import { newToken } from './token.ts';

export const LINK_TTL_MS = 60_000;
/** Codes kept at once; the oldest goes first. */
const MAX_LINKS = 20;
/** The pages a link may lead to: the drafts, or one draft. */
export const PAGE_PATH = /^\/(drafts\/[a-z0-9][a-z0-9-]{0,62})?$/;

export const pagePathAllowed = (path: string): boolean => PAGE_PATH.test(path);

export type OpenLinks = {
  /** A new code and when it stops working. */
  issue(): { code: string; expiresAt: string };
  /** True once for a known, fresh code; the code is gone afterwards either way. */
  redeem(code: string | null): boolean;
};

const hashOf = (code: string): string => createHash('sha256').update(code).digest('hex');

export function createOpenLinks(now: () => Date, ttlMs = LINK_TTL_MS): OpenLinks {
  /** sha256 of a code to the time it stops working, in ms. Codes themselves are never kept. */
  const codes = new Map<string, number>();
  const prune = (at: number): void => {
    for (const [hash, expires] of codes) if (expires <= at) codes.delete(hash);
    for (const hash of [...codes.keys()].slice(0, Math.max(0, codes.size - MAX_LINKS + 1))) {
      codes.delete(hash);
    }
  };
  return {
    issue() {
      const at = now().getTime();
      prune(at);
      const code = newToken();
      const expires = at + ttlMs;
      codes.set(hashOf(code), expires);
      return { code, expiresAt: new Date(expires).toISOString() };
    },
    redeem(code) {
      if (code === null || code.length > 100) return false;
      const hash = hashOf(code);
      const expires = codes.get(hash);
      codes.delete(hash);
      return expires !== undefined && expires > now().getTime();
    },
  };
}
