// Use case: the map of the workspace for agents, from kitvas's own files only.
// The checks module reads drafts, so what comes from checks is passed in, not imported.

import { latestVersion } from '../domain/draft.ts';
import { parseLayout } from '../domain/layout.ts';
import { versionFolder } from '../domain/names.ts';
import type { DraftStore } from '../ports/draft-store.ts';
import { sectionPaths } from './layout.ts';
import { listDrafts, loadDraft } from './load-draft.ts';

export type MapChecked = { fix: number; review: number };
export type MapElement = { id: string; file: string; line: number; column: number; tag: string };

/** What the map needs from the checks module. */
export type MapSources = {
  /** Counts of the saved check of a version; null when it has none. */
  checked(slug: string, version: number): MapChecked | null;
  /** The elements in the raw content of `build/json/ids.json`. */
  elements(raw: unknown): MapElement[];
};

export type DraftsMap = {
  drafts: {
    slug: string;
    title: string;
    version: number;
    built: boolean;
    checked: MapChecked | null;
  }[];
};

export type DraftMap = {
  slug: string;
  version: number;
  built: boolean;
  /** Each section of md/layout.md with the files of it that exist, paths inside the draft. */
  sections: { id: string; files: string[] }[];
  /** Empty when the version is not built. */
  elements: MapElement[];
  checked: MapChecked | null;
};

const builtAt = (store: DraftStore, slug: string, base: string): boolean =>
  store.exists(slug, `${base}/build/html/index.html`);

/** The content of a built version's id file; `undefined` when it is missing or not JSON. */
function idFile(store: DraftStore, slug: string, base: string): unknown {
  const text = store.readText(slug, `${base}/build/json/ids.json`);
  if (text === undefined) return undefined;
  try {
    return JSON.parse(text);
  } catch {
    // A broken id file only costs the map its elements; the next build writes it again.
    return undefined;
  }
}

export function draftsMap(store: DraftStore, sources: MapSources): DraftsMap {
  const drafts = listDrafts(store).flatMap((item) => {
    if (!item.valid || item.title === null) return [];
    const built = builtAt(store, item.slug, versionFolder(item.version));
    return [
      {
        slug: item.slug,
        title: item.title,
        version: item.version,
        built,
        checked: built ? sources.checked(item.slug, item.version) : null,
      },
    ];
  });
  return { drafts };
}

export function draftMap(store: DraftStore, sources: MapSources, slug: string): DraftMap {
  const version = latestVersion(loadDraft(store, slug));
  const base = versionFolder(version);
  const built = builtAt(store, slug, base);
  const layoutText = store.readText(slug, `${base}/md/layout.md`);
  const sections = (layoutText === undefined ? [] : parseLayout(layoutText).sections).map(
    (section) => {
      const paths = sectionPaths(base, section.id);
      return {
        id: section.id,
        files: [paths.tsx, paths.scss].filter((path) => store.exists(slug, path)),
      };
    },
  );
  return {
    slug,
    version,
    built,
    sections,
    elements: built ? sources.elements(idFile(store, slug, base)) : [],
    checked: built ? sources.checked(slug, version) : null,
  };
}
