// Counts the error lines of a studio log per error code. Only codes and counts leave this file:
// the rest of a line (a path, a draft, a message) is never kept.

const DAY_MS = 24 * 60 * 60 * 1000;

/** `<ISO time> <text>`: the first line of every entry the studio writes. */
const ENTRY = /^(\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d(?:\.\d+)?Z) (.*)$/;
/** `KitvasError: EDIT_STALE_VERSION`, `Error: EPERM: operation not permitted, rename ...`. */
const ERROR_LINE = /^(?:[A-Za-z]*Error)(?:\s*\[[^\]]*\])?:\s*(.*)$/;
const CODE = /^([A-Z][A-Z0-9_]{2,})\b/;
const EXIT = /^kitvas .* ended with exit code (-?\d+)/;
const NO_START = /^kitvas .* could not start/;

/** The code an entry's text stands for; `undefined` when the entry is not an error. */
export function errorCodeOf(text: string): string | undefined {
  const error = ERROR_LINE.exec(text);
  if (error) return CODE.exec(error[1] ?? '')?.[1] ?? 'INTERNAL';
  const exit = EXIT.exec(text);
  if (exit) return `EXIT_${exit[1] ?? ''}`.replace('-', 'M');
  if (NO_START.test(text)) return 'JOB_NOT_STARTED';
  return undefined;
}

export type ErrorCount = { code: string; count: number };

/** Error lines per code in the 24 hours before `now`, the most frequent first. */
export function countLogErrors(log: string, now: Date): ErrorCount[] {
  const since = now.getTime() - DAY_MS;
  const counts = new Map<string, number>();
  for (const line of log.split(/\r?\n/)) {
    const entry = ENTRY.exec(line);
    if (!entry) continue;
    const time = Date.parse(entry[1] ?? '');
    if (Number.isNaN(time) || time < since || time > now.getTime()) continue;
    const code = errorCodeOf(entry[2] ?? '');
    if (code !== undefined) counts.set(code, (counts.get(code) ?? 0) + 1);
  }
  return [...counts.entries()]
    .map(([code, count]) => ({ code, count }))
    .sort((a, b) => b.count - a.count || a.code.localeCompare(b.code));
}
