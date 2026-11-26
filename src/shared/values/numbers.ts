// Number helpers shared by `src/` and `client/`. Package-free: imports nothing.

/** `value` held between `low` and `high`. */
export const clamp = (value: number, low: number, high: number): number =>
  Math.min(high, Math.max(low, value));
