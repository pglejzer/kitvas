// Use cases around shared.json (plan 26): reading it in one place and checking it.

import { type Issue, KitvasError, SHARED_FILE, type SharedValue } from '../../shared/index.ts';
import { parseSharedValues, sharedValuesIssues } from '../domain/shared-values.ts';
import type { DraftStore } from '../ports/draft-store.ts';

export const sharedValuesPath = (base: string): string => `${base}/${SHARED_FILE}`;

/** The file's parsed text: `undefined` when it is missing, `null` when it is not JSON. */
function readRaw(store: DraftStore, slug: string, base: string): unknown {
  try {
    return store.readJson(slug, sharedValuesPath(base));
  } catch (error) {
    if (error instanceof KitvasError) return null;
    throw error;
  }
}

/**
 * The shared values of one version folder (`v<N>`). Empty for a missing file and for one that does
 * not read: the render, the checks and the context all read them here, and only here.
 */
export function readSharedValues(store: DraftStore, slug: string, base: string): SharedValue[] {
  return parseSharedValues(readRaw(store, slug, base));
}

/** The problems of the version's shared values file. */
export function checkSharedValues(store: DraftStore, slug: string, base: string): Issue[] {
  return sharedValuesIssues(readRaw(store, slug, base));
}
