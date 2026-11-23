// Use cases: read one draft, list all drafts.

import { KitvasError } from '../../shared/index.ts';
import { type Draft, latestVersion, parseDraft } from '../domain/draft.ts';
import type { DraftStore } from '../ports/draft-store.ts';

export type DraftListItem = {
  slug: string;
  title: string | null;
  kit: string | null;
  /** Latest version, 0 when the draft cannot be read. */
  version: number;
  valid: boolean;
};

export function loadDraft(store: DraftStore, slug: string): Draft {
  const raw = store.readJson(slug, 'draft.json');
  if (raw === undefined) throw new KitvasError('DRAFT_NOT_FOUND', { slug });
  return parseDraft(raw, slug);
}

/** Every draft of the store. A draft that cannot be read is listed as not valid. */
export function listDrafts(store: DraftStore): DraftListItem[] {
  return store.list().map((slug) => {
    try {
      const draft = loadDraft(store, slug);
      return {
        slug,
        title: draft.title,
        kit: draft.kit.id,
        version: latestVersion(draft),
        valid: true,
      };
    } catch (error) {
      if (!(error instanceof KitvasError)) throw error;
      return { slug, title: null, kit: null, version: 0, valid: false };
    }
  });
}
