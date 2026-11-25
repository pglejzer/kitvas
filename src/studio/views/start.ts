// What the start page decides: how long ago a draft changed, which commands the start switch
// offers, and the order of the cards. Pure; `pages/start/` renders it.

/** A message key and its values; the page puts it into words. */
export type Ago = { key: string; params?: Record<string, number | string> };

const MINUTE = 60_000;
const HOUR = 60 * MINUTE;
const DAY = 24 * HOUR;

/** The calendar day of a time, as a number that counts days in the person's own zone. */
const dayNumber = (time: Date): number =>
  Math.floor(Date.UTC(time.getFullYear(), time.getMonth(), time.getDate()) / DAY);

/** `2026-11-25`, in the person's zone. */
function dateText(time: Date): string {
  const pad = (value: number): string => String(value).padStart(2, '0');
  return `${time.getFullYear()}-${pad(time.getMonth() + 1)}-${pad(time.getDate())}`;
}

/** Words for how long ago `then` was; a time in the future reads as just now. */
export function agoOf(then: Date, now: Date): Ago {
  const passed = Math.max(0, now.getTime() - then.getTime());
  if (passed < MINUTE) return { key: 'studio.start.ago.now' };
  if (passed < HOUR) {
    const count = Math.floor(passed / MINUTE);
    return {
      key: count === 1 ? 'studio.start.ago.minute' : 'studio.start.ago.minutes',
      params: { count },
    };
  }
  if (passed < DAY) {
    const count = Math.floor(passed / HOUR);
    return {
      key: count === 1 ? 'studio.start.ago.hour' : 'studio.start.ago.hours',
      params: { count },
    };
  }
  const days = dayNumber(now) - dayNumber(then);
  if (passed < 7 * DAY) {
    if (days <= 1) return { key: 'studio.start.ago.yesterday' };
    return { key: 'studio.start.ago.days', params: { count: Math.min(days, 6) } };
  }
  if (passed < 14 * DAY) return { key: 'studio.start.ago.lastWeek' };
  if (passed < 60 * DAY) {
    return { key: 'studio.start.ago.weeks', params: { count: Math.floor(passed / (7 * DAY)) } };
  }
  return { key: 'studio.start.ago.date', params: { date: dateText(then) } };
}

export type StartChoice = {
  id: 'compose' | 'rework' | 'craft' | 'learn' | 'edit';
  command: string;
};

/** The commands of the start switch; `edit` names `lastSlug` and is left out when it is `null`. */
export function startChoices(lastSlug: string | null): StartChoice[] {
  const choices: StartChoice[] = [
    { id: 'compose', command: '/kitvas:compose a pricing page with three plans' },
    { id: 'rework', command: '/kitvas:rework https://your-app.example/billing' },
    { id: 'craft', command: '/kitvas:craft a date range picker' },
    { id: 'learn', command: '/kitvas:learn' },
  ];
  return lastSlug === null
    ? choices
    : [...choices, { id: 'edit', command: `/kitvas:edit ${lastSlug}` }];
}

/** Newest change first; an entry with no time (an unreadable draft) last, by slug. */
export function byChange<T extends { slug: string; changed: Date | null }>(
  items: readonly T[],
): T[] {
  return [...items].sort((a, b) => {
    if (a.changed !== null && b.changed !== null) {
      const later = b.changed.getTime() - a.changed.getTime();
      if (later !== 0) return later;
    } else if (a.changed !== null) {
      return -1;
    } else if (b.changed !== null) {
      return 1;
    }
    if (a.slug === b.slug) return 0;
    return a.slug < b.slug ? -1 : 1;
  });
}
