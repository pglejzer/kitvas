/** Polls `check` every 50 ms until it gives something other than undefined or false. */
export async function until<T>(check: () => T | undefined | false, timeoutMs = 5_000): Promise<T> {
  const end = Date.now() + timeoutMs;
  for (;;) {
    const value = check();
    if (value !== undefined && value !== false) return value;
    if (Date.now() > end) throw new Error(`nothing within ${timeoutMs} ms`);
    await new Promise((resolve) => setTimeout(resolve, 50));
  }
}
