// Fake `bin/kitvas.ts` scripts for job tests; each one does a single thing.

import { writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { tempDir } from '../tmp.ts';

/** Writes `body` as a script in a temp folder and returns its path. */
export function fakeCli(body: string): string {
  const file = join(tempDir(), 'fake-kitvas.mjs');
  writeFileSync(file, body);
  return file;
}

/** Answers like `kitvas … --json`, with its arguments, heap flag, folder and shared browser. */
export const ECHO_CLI = `
const memory = process.execArgv.find((arg) => arg.startsWith('--max-old-space-size='));
const shared = process.env.KITVAS_BROWSER_WS ?? null;
const data = { args: process.argv.slice(2), memory, cwd: process.cwd(), shared };
console.log(JSON.stringify({ ok: true, data }));
`;

/** Reports an error the way the CLI does: JSON on stderr and a non-zero exit code. */
export const FAILING_CLI = `
const error = { code: 'DRAFT_NOT_FOUND', message: 'There is no draft shop.' };
console.error(JSON.stringify({ ok: false, error }));
process.exitCode = 9;
`;

/** Would answer after 30 s. */
export const SLOW_CLI = `setTimeout(() => console.log(JSON.stringify({ ok: true, data: {} })), 30000);`;

/** Prints 4 KiB that is not an answer. */
export const CHATTY_CLI = `process.stdout.write('x'.repeat(4096));`;

/** Dies without an answer. */
export const CRASHING_CLI = `process.stderr.write('boom\\n'); process.exit(3);`;

/** Starts a child that never ends, writes its pid to `KITVAS_TEST_PID_FILE`, then waits. */
export const PARENT_CLI = `
import { spawn } from 'node:child_process';
import { renameSync, writeFileSync } from 'node:fs';
const child = spawn(process.execPath, ['-e', 'setInterval(() => {}, 1000)'], { stdio: 'ignore' });
const file = process.env.KITVAS_TEST_PID_FILE;
writeFileSync(file + '.tmp', String(child.pid));
renameSync(file + '.tmp', file);
setInterval(() => {}, 1000);
`;

/** Answers with the value of `KITVAS_TEST_VALUE`. */
export const ENV_CLI = `
console.log(JSON.stringify({ ok: true, data: { value: process.env.KITVAS_TEST_VALUE ?? null } }));
`;
