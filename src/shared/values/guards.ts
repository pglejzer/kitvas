// Plain-value guards shared by `src/` and `client/`. Package-free: imports nothing.

/** A plain object (not `null`, not an array). */
export const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);
