// Secrets of one studio run: the session token, the frame key, the nonce of each response.

import { createHash, randomBytes, timingSafeEqual } from 'node:crypto';

/** 32 random bytes as base64url: the session token the CLI sends, and the page secret. */
export const newToken = (): string => randomBytes(32).toString('base64url');

/** 16 random bytes: the path part that keeps other sites from loading prototype files. */
export const newFrameKey = (): string => randomBytes(16).toString('base64url');

/** 16 random bytes: tells two frames of one page apart. Not a secret. */
export const newChannel = (): string => randomBytes(16).toString('base64url');

/** The nonce of one response's inline style and script. */
export const newNonce = (): string => randomBytes(16).toString('base64');

const digest = (text: string): Buffer => createHash('sha256').update(text).digest();

/** Constant-time comparison; hashing first gives both sides the same length. */
export function secretMatches(given: string | undefined, expected: string): boolean {
  if (given === undefined) return false;
  return timingSafeEqual(digest(given), digest(expected));
}
