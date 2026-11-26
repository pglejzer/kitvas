// Index-path helpers shared by `src/` and `client/`. Package-free: imports nothing.

/** Two index paths hold the same indexes in the same order. */
export function samePath(a: readonly number[], b: readonly number[]): boolean {
  return a.length === b.length && a.every((index, at) => index === b[at]);
}
