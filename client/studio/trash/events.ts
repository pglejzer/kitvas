// What the studio's `drafts` event means for an open page (ADR 0064): a draft was deleted,
// brought back or removed for good. The page that did it knows already; any other page looks again.

import type { StreamEvent } from '../live/sse.ts';

export type DraftsChange = { slug: string; change: 'deleted' | 'restored' | 'purged' };

/** The change a `drafts` event carries; `undefined` for another event or bad data. */
export function draftsEventOf(event: StreamEvent): DraftsChange | undefined {
  if (event.event !== 'drafts') return undefined;
  let data: unknown;
  try {
    data = JSON.parse(event.data);
  } catch {
    return undefined;
  }
  if (typeof data !== 'object' || data === null) return undefined;
  const { slug, change } = data as Record<string, unknown>;
  if (typeof slug !== 'string') return undefined;
  if (change !== 'deleted' && change !== 'restored' && change !== 'purged') return undefined;
  return { slug, change };
}

/** Where the script runs: the gallery, a draft's page, or the page of a draft that was deleted. */
export type Where = { kind: 'gallery' } | { kind: 'draft' | 'gone'; slug: string };

/** Whether the page loads itself again: the gallery for any change, a draft's page for its own. */
export function needsLook(change: DraftsChange, where: Where): boolean {
  return where.kind === 'gallery' || where.slug === change.slug;
}

/** How long a mark of a change this page made waits for its event. */
export const OWN_MS = 10_000;

/** The changes this page made itself: their events are not news to it. */
export type Own = {
  mark(change: DraftsChange): void;
  /** Whether the event is this page's own; an own change is told once. */
  take(change: DraftsChange): boolean;
  /** The call failed: no event will come. */
  drop(change: DraftsChange): void;
};

export function createOwn(now: () => number = Date.now): Own {
  const marks = new Map<string, number>();
  const key = (change: DraftsChange): string => `${change.change}:${change.slug}`;
  return {
    mark: (change) => marks.set(key(change), now()),
    take(change) {
      const at = marks.get(key(change));
      marks.delete(key(change));
      return at !== undefined && now() - at <= OWN_MS;
    },
    drop: (change) => {
      marks.delete(key(change));
    },
  };
}
