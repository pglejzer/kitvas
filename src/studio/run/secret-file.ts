// The page secret of a project's studio, kept on disk so a browser's cookie outlives a restart
// (ADR 0040). This file and the `Set-Cookie` of `/open` are the only places it goes.

import { randomBytes } from 'node:crypto';
import { mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs';
import { dirname } from 'node:path';

/** 32 random bytes as hex. */
const SECRET = /^[0-9a-f]{64}$/;

/**
 * The secret in `file`. A missing, unreadable or malformed file gets a new secret, which sends
 * every browser back to a one-time link: safer than guessing what a broken file meant.
 */
export function pageSecretOf(file: string): string {
  try {
    const text = readFileSync(file, 'utf8').trim();
    if (SECRET.test(text)) return text;
  } catch {
    // Missing or unreadable: replaced below.
  }
  const secret = randomBytes(32).toString('hex');
  mkdirSync(dirname(file), { recursive: true });
  // Whole or not at all, and readable by the user only (where the system has modes).
  const temp = `${file}.${process.pid}.tmp`;
  writeFileSync(temp, `${secret}\n`, { mode: 0o600 });
  renameSync(temp, file);
  return secret;
}
