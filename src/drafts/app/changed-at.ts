// Use case: when a draft last changed, for the order of the studio's start page.

import { latestVersion } from '../domain/draft.ts';
import { versionFolder } from '../domain/names.ts';
import type { DraftStore } from '../ports/draft-store.ts';
import { loadDraft } from './load-draft.ts';

/**
 * When a draft last changed: the later of its latest version's creation and the newest file under
 * that version's `src/` (a saved edit rewrites a file there). A draft that cannot be read throws,
 * as `loadDraft` does.
 */
export function draftChangedAt(store: DraftStore, slug: string): Date {
  const draft = loadDraft(store, slug);
  const number = latestVersion(draft);
  const entry = draft.versions.find((version) => version.number === number);
  const times = [
    entry === undefined ? undefined : new Date(entry.createdAt),
    store.modifiedAt(slug, `${versionFolder(number)}/src`),
  ]
    .filter((time): time is Date => time !== undefined)
    .map((time) => time.getTime())
    .filter((time) => !Number.isNaN(time));
  return new Date(times.length === 0 ? 0 : Math.max(...times));
}
