import { join } from 'node:path';
import { createFsDraftStore } from '../../src/drafts/adapters/fs-draft-store.ts';
import { createDraft, type DraftStore } from '../../src/drafts/index.ts';
import { tempDir } from './tmp.ts';

/** The kit reference of the `tiny` fixture kit. The hash is not checked by the drafts module. */
export const TINY = { id: 'tiny', version: '1.0.0', hash: 'a'.repeat(64) };
export const NOW = new Date('2026-11-22T10:00:00.000Z');

export function tempDrafts(): { store: DraftStore; root: string } {
  const root = join(tempDir('kitvas-drafts-'), 'drafts');
  return { store: createFsDraftStore(root), root };
}

/** A store with one draft `shop` at version 1. */
export function shopDraft(): { store: DraftStore; root: string } {
  const drafts = tempDrafts();
  createDraft(drafts.store, { slug: 'shop', title: 'Shop', kit: TINY, now: NOW });
  return drafts;
}

/** Writes files into one version of a draft, by path inside it: `{ 'src/tsx/…': '…' }`. */
export function writeVersionFiles(
  store: DraftStore,
  slug: string,
  version: number,
  files: Record<string, string>,
): void {
  for (const [relPath, text] of Object.entries(files)) {
    store.writeText(slug, `v${version}/${relPath}`, text);
  }
}

/** The texts of files in one version of a draft, by path inside it; a missing one is `undefined`. */
export function readVersionFiles(
  store: DraftStore,
  slug: string,
  version: number,
  paths: string[],
): Record<string, string | undefined> {
  return Object.fromEntries(
    paths.map((relPath): [string, string | undefined] => [
      relPath,
      store.readText(slug, `v${version}/${relPath}`),
    ]),
  );
}

export const GOOD_LAYOUT = [
  '# Layout: Shop',
  '',
  '## hero',
  'Purpose: Say what the shop sells.',
  'Components: Button',
  '',
  '## order-summary',
  'Purpose: List what the user pays for.',
  'Components: Button, Icon',
  '',
].join('\n');
