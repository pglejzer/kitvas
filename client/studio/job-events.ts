// What a studio event means for an open page: a build or check of some draft has just ended, the
// studio's own build of a draft ended, a draft's sources changed on disk, or the stream lost events
// and the page cannot know. A catalog job builds a kit's examples; its `slug` is a kit id, so it
// never refreshes a draft page or the gallery.

import type { BuildEvent, SourceEvent } from '../../src/studio/api/edit-schemas.ts';
import type { StreamEvent } from './sse.ts';

const ENDED = new Set(['succeeded', 'failed']);

/** The data of an event of `type` as a plain object; `undefined` for another event or bad data. */
function dataOf(event: StreamEvent, type: string): Record<string, unknown> | undefined {
  if (event.event !== type) return undefined;
  let data: unknown;
  try {
    data = JSON.parse(event.data);
  } catch {
    return undefined;
  }
  if (typeof data !== 'object' || data === null || Array.isArray(data)) return undefined;
  return data as Record<string, unknown>;
}

/** The job a `job` event carries, as a plain object; `undefined` for another event or bad data. */
export function jobOf(event: StreamEvent): Record<string, unknown> | undefined {
  return dataOf(event, 'job');
}

const isVersion = (value: unknown): value is number =>
  typeof value === 'number' && Number.isInteger(value) && value >= 1;

/** A `source` event: files of a draft changed on disk; `undefined` for another event or bad data. */
export function sourceOf(event: StreamEvent): SourceEvent | undefined {
  const data = dataOf(event, 'source');
  if (!data) return undefined;
  const { slug, version, files, by } = data;
  if (typeof slug !== 'string' || !isVersion(version)) return undefined;
  if (by !== 'editor' && by !== 'other') return undefined;
  if (typeof files !== 'object' || files === null || Array.isArray(files)) return undefined;
  const etags: Record<string, string> = {};
  for (const [path, etag] of Object.entries(files as Record<string, unknown>)) {
    if (typeof etag !== 'string') return undefined;
    etags[path] = etag;
  }
  return { slug, version, files: etags, by };
}

/** A `build` event: the studio's own build of a draft ended; `undefined` for anything else. */
export function buildOf(event: StreamEvent): BuildEvent | undefined {
  const data = dataOf(event, 'build');
  if (!data) return undefined;
  const { slug, version, state, ms } = data;
  if (typeof slug !== 'string' || !isVersion(version)) return undefined;
  if (state !== 'succeeded' && state !== 'failed') return undefined;
  if (typeof ms !== 'number' || !Number.isInteger(ms) || ms < 0) return undefined;
  return { slug, version, state, ms };
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

/**
 * Whether the page loads itself again now. Never while the person edits: the editor loads only
 * its frame again and keeps its own state (`edit/live-frame.ts`). Otherwise as `needsRefresh`,
 * and also after a studio build of a draft it shows that succeeded; a failed one leaves the last
 * good page in place, so there is nothing new to show.
 */
export function needsReload(
  event: StreamEvent,
  shows: (slug: string) => boolean,
  editing: boolean,
): boolean {
  if (editing) return false;
  if (needsRefresh(event, shows)) return true;
  const build = buildOf(event);
  return build !== undefined && build.state === 'succeeded' && shows(build.slug);
}
