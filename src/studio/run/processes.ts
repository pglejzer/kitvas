// Processes of the studio: start one detached from the CLI, ask whether one lives, end one.

import { spawn } from 'node:child_process';
import { closeSync, mkdirSync, openSync } from 'node:fs';
import { dirname } from 'node:path';

export type SpawnInput = {
  /** `bin/kitvas.ts` of the plugin. */
  bin: string;
  project: string;
  /** Output of the process goes here; it never shares the CLI's own output. */
  log: string;
  env: NodeJS.ProcessEnv;
};

/** Starts `node <bin> studio serve` in `project`, detached and without a window. Returns its pid. */
export function spawnServer(input: SpawnInput): number {
  mkdirSync(dirname(input.log), { recursive: true });
  const fd = openSync(input.log, 'a');
  try {
    const child = spawn(process.execPath, [input.bin, 'studio', 'serve'], {
      cwd: input.project,
      detached: true,
      stdio: ['ignore', fd, fd],
      windowsHide: true,
      shell: false,
      env: input.env,
    });
    // A failed start is reported by the missing pid; the event must not crash the CLI.
    child.once('error', () => undefined);
    child.unref();
    if (child.pid === undefined) throw new Error('the studio process did not start');
    return child.pid;
  } finally {
    closeSync(fd);
  }
}

/** Does a process with this pid run? One we may not signal still counts. */
export function isAlive(pid: number): boolean {
  try {
    process.kill(pid, 0);
    return true;
  } catch (error) {
    return (error as NodeJS.ErrnoException).code === 'EPERM';
  }
}

/** Ends a process at once (TerminateProcess on Windows). Only for a pid known to be a studio. */
export function forceKill(pid: number): void {
  try {
    process.kill(pid, 'SIGKILL');
  } catch {
    // Already gone.
  }
}
