// "Full check ran 3 minutes ago" (plan 18f, task 4): the words of the time since a check, as a text
// key under `studio.edit.checks.ran.` and a count. Pure.

export type Ago = { key: string; count: number };

const MINUTE = 60_000;
const HOUR = 60 * MINUTE;
const DAY = 24 * HOUR;

/** How long ago `ranAt` was at `now`, both in milliseconds; a time ahead of the clock is now. */
export function ranAgo(ranAt: number, now: number): Ago {
  const past = Math.max(0, now - ranAt);
  if (past < 45_000) return { key: 'checks.ran.now', count: 0 };
  if (past < 90 * MINUTE) {
    const count = Math.max(1, Math.round(past / MINUTE));
    return { key: count === 1 ? 'checks.ran.minute' : 'checks.ran.minutes', count };
  }
  if (past < 36 * HOUR) {
    const count = Math.round(past / HOUR);
    return { key: count === 1 ? 'checks.ran.hour' : 'checks.ran.hours', count };
  }
  const count = Math.max(2, Math.round(past / DAY));
  return { key: 'checks.ran.days', count };
}
