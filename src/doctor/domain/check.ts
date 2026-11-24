// What a doctor check answers.

export const CHECK_IDS = [
  'node',
  'deps',
  'plugin',
  'workspace',
  'kit',
  'browser',
  'data',
  'ports',
  'studio',
] as const;

export type CheckId = (typeof CHECK_IDS)[number];

export type CheckStatus = 'ok' | 'warn' | 'fail' | 'skipped';

export type CheckResult = {
  id: CheckId;
  status: CheckStatus;
  /** One short sentence of what was found. */
  detail: string;
  /** What to do, one line; absent when the status is `ok` or `skipped`. */
  fix?: string;
  /** The error code of a check that threw. */
  code?: string;
};

export type Tally = Record<CheckStatus, number>;

export function tally(results: readonly CheckResult[]): Tally {
  const counts: Tally = { ok: 0, warn: 0, fail: 0, skipped: 0 };
  for (const result of results) counts[result.status] += 1;
  return counts;
}

/** The code of whatever was thrown: a kitvas code, a system code such as `EPERM`, else `INTERNAL`. */
export function codeOf(error: unknown): string {
  if (typeof error === 'object' && error !== null && 'code' in error) {
    const code = error.code;
    if (typeof code === 'string' && /^[A-Z][A-Z0-9_]*$/.test(code)) return code;
  }
  return 'INTERNAL';
}

export const pass = (id: CheckId, detail: string): CheckResult => ({ id, status: 'ok', detail });
export const skip = (id: CheckId, detail: string): CheckResult => ({
  id,
  status: 'skipped',
  detail,
});
export const warn = (id: CheckId, detail: string, fix: string): CheckResult => ({
  id,
  status: 'warn',
  detail,
  fix,
});
export const fail = (id: CheckId, detail: string, fix: string, code?: string): CheckResult => ({
  id,
  status: 'fail',
  detail,
  fix,
  ...(code === undefined ? {} : { code }),
});
