// Use case: start the next version of a draft from the latest one.

import { latestVersion, serializeJson } from '../domain/draft.ts';
import { versionFolder } from '../domain/names.ts';
import type { DraftStore } from '../ports/draft-store.ts';
import { loadDraft } from './load-draft.ts';

/** What a new version starts with. `build/` is never copied; the reasons (`why/`) go along. */
const COPIED = ['md', 'src', 'why'];

/** A picked craft draft carries on with the picked sketch only: these `src/` parts, then the sketch. */
const COPIED_WITHOUT_SKETCHES = ['src/json', 'src/scss', 'src/img', 'src/tsx/sections'];
const TSX_ENTRY = 'src/tsx/index.tsx';

export function addVersion(
  store: DraftStore,
  slug: string,
  now: Date,
): { slug: string; version: number } {
  const draft = loadDraft(store, slug);
  const from = latestVersion(draft);
  const version = from + 1;
  const source = versionFolder(from);
  const target = versionFolder(version);
  const picked = draft.craft?.picked ?? null;
  if (picked) {
    store.copyDir(slug, `${source}/md`, `${target}/md`);
    store.copyDir(slug, `${source}/why`, `${target}/why`);
    for (const folder of COPIED_WITHOUT_SKETCHES) {
      store.copyDir(slug, `${source}/${folder}`, `${target}/${folder}`);
    }
    for (const file of [TSX_ENTRY, `src/tsx/sketches/${picked}.tsx`]) {
      const text = store.readText(slug, `${source}/${file}`);
      if (text !== undefined) store.writeText(slug, `${target}/${file}`, text);
    }
  } else {
    for (const folder of COPIED) {
      store.copyDir(slug, `${source}/${folder}`, `${target}/${folder}`);
    }
  }
  const versions = [...draft.versions, { number: version, createdAt: now.toISOString() }];
  store.writeText(slug, 'draft.json', serializeJson({ ...draft, versions }));
  return { slug, version };
}
