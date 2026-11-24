// Use case: the saved results of the last check of one version, when they can be used.

import { type DraftStore, versionFolder } from '../../drafts/index.ts';
import { KitvasError } from '../../shared/index.ts';
import { ChecksFileSchema } from '../domain/findings/checks-file.ts';
import type { ChecksFile } from '../domain/findings/finding.ts';

/** `undefined` when the version was never checked, or its file is broken or of another version. */
export function readChecks(
  store: DraftStore,
  slug: string,
  number: number,
): ChecksFile | undefined {
  let raw: unknown;
  try {
    raw = store.readJson(slug, `${versionFolder(number)}/build/json/checks.json`);
  } catch (error) {
    if (error instanceof KitvasError) return undefined;
    throw error;
  }
  const parsed = ChecksFileSchema.safeParse(raw);
  if (!parsed.success) return undefined;
  const file = parsed.data;
  return file.slug === slug && file.version === number ? file : undefined;
}
