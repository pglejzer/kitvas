// Ends a job's process together with the processes it started (tsc, esbuild, Sass).

import type { ChildProcess } from 'node:child_process';

/** On Linux and macOS a job runs in a process group of its own, so one signal reaches all of it. */
export const OWN_GROUP = process.platform !== 'win32';

/**
 * Ends `child` and its children. Linux and macOS: SIGKILL to its process group (start it with
 * `detached: OWN_GROUP`). Windows: Node (libuv) puts the processes it starts into a job object
 * that ends them when their parent ends, so ending the child is enough.
 */
export function killTree(child: ChildProcess): void {
  if (OWN_GROUP && child.pid !== undefined) {
    try {
      process.kill(-child.pid, 'SIGKILL');
      return;
    } catch {
      // No such group any more: the child has ended; the kill below is then a no-op.
    }
  }
  child.kill('SIGKILL');
}
