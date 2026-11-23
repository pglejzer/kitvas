// Use case: one version of a draft as the studio shows it: its date, whether it is built, its states.

import { KitvasError } from '../../shared/index.ts';
import { versionFolder } from '../domain/names.ts';
import { DEFAULT_STATES, type States, StatesSchema } from '../domain/states.ts';
import type { DraftStore } from '../ports/draft-store.ts';
import { loadDraft } from './load-draft.ts';

export type VersionInfo = {
  slug: string;
  number: number;
  createdAt: string;
  /** `build/html/index.html` exists. */
  built: boolean;
  states: States;
};

export function versionInfo(store: DraftStore, slug: string, number: number): VersionInfo {
  const draft = loadDraft(store, slug);
  const entry = draft.versions.find((version) => version.number === number);
  if (!entry) throw new KitvasError('VERSION_NOT_FOUND', { slug, version: number });
  const base = versionFolder(number);
  const states = StatesSchema.safeParse(store.readJson(slug, `${base}/src/json/states.json`));
  return {
    slug,
    number,
    createdAt: entry.createdAt,
    built: store.exists(slug, `${base}/build/html/index.html`),
    states: states.success ? states.data : DEFAULT_STATES,
  };
}
