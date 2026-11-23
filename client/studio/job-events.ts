// What a studio event means for an open page: a build or check of some draft has just ended, or
// the stream lost events and the page cannot know. A catalog job builds a kit's examples; its
// `slug` is a kit id, so it never refreshes a draft page or the gallery.

import type { StreamEvent } from './sse.ts';

const ENDED = new Set(['succeeded', 'failed']);

/** The job a `job` event carries, as a plain object; `undefined` for another event or bad data. */
export function jobOf(event: StreamEvent): Record<string, unknown> | undefined {
  if (event.event !== 'job') return undefined;
  let job: unknown;
  try {
    job = JSON.parse(event.data);
  } catch {
    return undefined;
  }
  if (typeof job !== 'object' || job === null || Array.isArray(job)) return undefined;
  return job as Record<string, unknown>;
}

/** The draft of a build or check that succeeded or failed; `undefined` for anything else. */
export function endedJobSlug(event: StreamEvent): string | undefined {
  const job = jobOf(event);
  if (!job || job.kind === 'catalog') return undefined;
  const { slug, state } = job;
  if (typeof slug !== 'string' || typeof state !== 'string') return undefined;
  return ENDED.has(state) ? slug : undefined;
}

/**
 * Whether the page should load itself again: a job of a draft it shows has ended, or a `reset`
 * says events were missed (one of them may have been such a job).
 */
export function needsRefresh(event: StreamEvent, shows: (slug: string) => boolean): boolean {
  if (event.event === 'reset') return true;
  const slug = endedJobSlug(event);
  return slug !== undefined && shows(slug);
}
