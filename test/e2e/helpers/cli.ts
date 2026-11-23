// The real `bin/kitvas.ts` as a child process, in a temp project with its own home and data
// folder, so nothing of the person running the tests is read or changed.

import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { PLUGIN_ROOT } from '../../../src/shared/env/paths.ts';
import { tempDir } from '../../helpers/tmp.ts';

const BIN = join(PLUGIN_ROOT, 'bin', 'kitvas.ts');
/** How much of a child's output goes into a failure message. */
const TAIL = 6_000;
/** After the process ended, how long its pipes may stay open before the output counts as read. */
const PIPE_GRACE_MS = 2_000;

export type Sandbox = { project: string; dataDir: string; env: NodeJS.ProcessEnv };

export type Run = {
  args: string[];
  exit: number | null;
  signal: string | null;
  timedOut: boolean;
  ms: number;
  stdout: string;
  stderr: string;
};

type CliAnswer =
  | { ok: true; data: unknown }
  | { ok: false; error: { code: string; message: string } };

/**
 * A project and a data folder, both new. KITVAS_* variables around the tests are dropped. The home
 * folder stays the real one: Chrome and Edge do not start on Windows with a USERPROFILE that is an
 * empty folder, and kitvas keeps everything it writes in KITVAS_DATA_DIR and the project anyway.
 */
export function sandbox(): Sandbox {
  const project = tempDir('kitvas-e2e-project-');
  const dataDir = tempDir('kitvas-e2e-data-');
  const env: NodeJS.ProcessEnv = {};
  for (const [name, value] of Object.entries(process.env)) {
    if (!name.toUpperCase().startsWith('KITVAS_')) env[name] = value;
  }
  return { project, dataDir, env: { ...env, KITVAS_DATA_DIR: dataDir } };
}

/** `node bin/kitvas.ts <args>` in the project, ended once `timeoutMs` is over. Never rejects. */
export function runKitvas(box: Sandbox, args: string[], timeoutMs: number): Promise<Run> {
  const started = Date.now();
  return new Promise((resolve) => {
    const child = spawn(process.execPath, [BIN, ...args], {
      cwd: box.project,
      env: box.env,
      shell: false,
      windowsHide: true,
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    let stdout = '';
    let stderr = '';
    let timedOut = false;
    let exit: number | null = null;
    let signal: string | null = null;
    let settled = false;
    child.stdout.setEncoding('utf8');
    child.stderr.setEncoding('utf8');
    child.stdout.on('data', (chunk: string) => {
      stdout += chunk;
    });
    child.stderr.on('data', (chunk: string) => {
      stderr += chunk;
    });
    const timer = setTimeout(() => {
      timedOut = true;
      child.kill('SIGKILL');
    }, timeoutMs);
    const finish = (): void => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      resolve({ args, exit, signal, timedOut, ms: Date.now() - started, stdout, stderr });
    };
    child.once('error', (error) => {
      stderr += `\n${String(error)}`;
      finish();
    });
    child.once('exit', (code, why) => {
      exit = code;
      signal = why;
      // A process it started (the studio) must never hold the test through a pipe it kept.
      setTimeout(finish, PIPE_GRACE_MS);
    });
    child.once('close', finish);
  });
}

const tail = (text: string): string => {
  const trimmed = text.trim();
  return trimmed.length > TAIL ? `...${trimmed.slice(-TAIL)}` : trimmed;
};

/** What a run printed and how it ended, for a failure message. */
export function describeRun(run: Run): string {
  const ended = run.timedOut
    ? `stopped after ${run.ms} ms`
    : `exit ${run.exit}${run.signal ? `, signal ${run.signal}` : ''}, ${run.ms} ms`;
  return [
    `kitvas ${run.args.join(' ')}: ${ended}`,
    `stdout: ${tail(run.stdout)}`,
    `stderr: ${tail(run.stderr)}`,
  ].join('\n');
}

/** The CLI's JSON answer: the last line of stdout that is one. */
function answerOf(stdout: string): CliAnswer | undefined {
  const lines = stdout
    .split('\n')
    .map((line) => line.trim())
    .filter((line) => line !== '')
    .reverse();
  for (const line of lines) {
    try {
      const parsed: unknown = JSON.parse(line);
      if (typeof parsed === 'object' && parsed !== null && 'ok' in parsed) {
        return parsed as CliAnswer;
      }
    } catch {
      // Not JSON: something else the process printed.
    }
  }
  return undefined;
}

/** `kitvas <args> --json`: its `data`, or a failure with everything the process printed. */
export async function kitvas<T>(box: Sandbox, args: string[], timeoutMs: number): Promise<T> {
  const run = await runKitvas(box, [...args, '--json'], timeoutMs);
  const answer = answerOf(run.stdout);
  if (run.exit !== 0 || answer?.ok !== true) assert.fail(describeRun(run));
  return answer.data as T;
}

/** The end of the studio's log in the data folder; the detached studio writes its errors there. */
export function studioLog(box: Sandbox): string {
  const dir = join(box.dataDir, 'studio');
  if (!existsSync(dir)) return '(no studio log)';
  const logs = readdirSync(dir).filter((name) => name.endsWith('.log'));
  if (logs.length === 0) return '(no studio log)';
  return logs.map((name) => `${name}: ${tail(readFileSync(join(dir, name), 'utf8'))}`).join('\n');
}

/** Pids named by studio state files in the data folder: the studio and its shared browser. */
export function statePids(box: Sandbox): number[] {
  const dir = join(box.dataDir, 'studio');
  if (!existsSync(dir)) return [];
  const pids: number[] = [];
  for (const name of readdirSync(dir).filter((file) => file.endsWith('.json'))) {
    try {
      const state = JSON.parse(readFileSync(join(dir, name), 'utf8')) as {
        pid?: unknown;
        browserPid?: unknown;
      };
      for (const pid of [state.pid, state.browserPid]) {
        if (typeof pid === 'number' && Number.isInteger(pid) && pid > 0) pids.push(pid);
      }
    } catch {
      // A file being written or one that is not a state file.
    }
  }
  return pids;
}

/** Writes `text` into `file`, with its folders. */
export function writeText(file: string, text: string): void {
  mkdirSync(dirname(file), { recursive: true });
  writeFileSync(file, text);
}
