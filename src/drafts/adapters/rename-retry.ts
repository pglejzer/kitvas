// Windows refuses to move a file over one that another process holds open for a moment (the build
// reading a source, a virus scanner, an editor): the move fails with EPERM, EBUSY or EACCES. The
// draft store's atomic write moves a temporary file over the real one, so it tries again after
// short waits before it gives up with the last error.

/** The error codes of a file another process holds for a moment. */
const HELD = new Set(['EPERM', 'EBUSY', 'EACCES']);

/** The waits between the tries, in milliseconds: about 1.3 s in all. */
export const RENAME_WAITS: readonly number[] = [10, 20, 40, 80, 150, 250, 350, 400];

export type RetryIo = {
  rename(from: string, to: string): void;
  /** Blocks for `ms`: the draft store's calls are synchronous. */
  wait(ms: number): void;
};

function codeOf(error: unknown): string | undefined {
  if (typeof error !== 'object' || error === null || !('code' in error)) return undefined;
  return typeof error.code === 'string' ? error.code : undefined;
}

/** Whether `error` is a refusal because another process holds a file for a moment. */
export function isHeldError(error: unknown): boolean {
  const code = codeOf(error);
  return code !== undefined && HELD.has(code);
}

/** Moves `from` over `to`; a held file is tried again after each of `waits`. */
export function renameWithRetry(
  from: string,
  to: string,
  io: RetryIo,
  waits: readonly number[] = RENAME_WAITS,
): void {
  for (let attempt = 0; ; attempt += 1) {
    try {
      io.rename(from, to);
      return;
    } catch (error) {
      const wait = waits[attempt];
      const code = codeOf(error);
      if (wait === undefined || code === undefined || !HELD.has(code)) throw error;
      io.wait(wait);
    }
  }
}

/** Blocks this thread for `ms`. */
export function sleepSync(ms: number): void {
  Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, ms);
}
