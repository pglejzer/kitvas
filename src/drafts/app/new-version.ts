// Use case: start the next version of a draft from the latest one.

import { latestVersion, serializeJson } from '../domain/draft.ts';
import { versionFolder } from '../domain/names.ts';
import type { DraftStore } from '../ports/draft-store.ts';
import { loadDraft } from './load-draft.ts';

/** What a new version starts with. `build/` is never copied. */
const COPIED = ['md', 'src'];

export function addVersion(
  store: DraftStore,
  slug: string,
  now: Date,
): { slug: string; version: number } {
  const draft = loadDraft(store, slug);
  const from = latestVersion(draft);
  const version = from + 1;
  for (const folder of COPIED) {
    store.copyDir(slug, `${versionFolder(from)}/${folder}`, `${versionFolder(version)}/${folder}`);
  }
  const versions = [...draft.versions, { number: version, createdAt: now.toISOString() }];
  store.writeText(slug, 'draft.json', serializeJson({ ...draft, versions }));
  return { slug, version };
}
