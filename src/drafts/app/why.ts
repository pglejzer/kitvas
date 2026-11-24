// Use cases: why each section of a version was made this way (spec 4d, goal 7; plan 17). The
// maker writes `<version>/why/<Section>.json` beside `src/` (the craft sketcher one per sketch);
// this reads them. A file that does not read is left out, as if the section had none. An entry is
// `stale` when the hash it holds is not the sha256 of the section's TSX now.
//
// An agent has no shell and cannot hash: it writes 64 zeros, and `stampWhy` puts the hash of the
// TSX in the first time the studio reads the file (`PENDING_HASH`).

import { createHash } from 'node:crypto';
import { serializeJson } from '../domain/draft.ts';
import { parseLayout } from '../domain/layout.ts';
import { pascalCase, versionFolder } from '../domain/names.ts';
import { WHY_FOLDER, WHY_NAME, type WhyFile, WhyFileSchema } from '../domain/why.ts';
import type { DraftStore } from '../ports/draft-store.ts';
import { loadDraft } from './load-draft.ts';

/** What an agent writes for the hash: "kitvas, fill this in". */
export const PENDING_HASH = '0'.repeat(64);

export type WhyEntry = {
  /** The section's component name (a sketch's letter in a craft draft). */
  section: string;
  /** The section's root element id in the build; `null` when the version has no build. */
  element: string | null;
  lines: string[];
  guidelines: string[];
  stale: boolean;
};

export type WhyReport = { sections: WhyEntry[]; missing: string[] };

type Place = { name: string; tsx: string; idPrefix: string };

const sha256 = (text: string): string => createHash('sha256').update(text).digest('hex');

/** The sections of `version` in layout order; a craft draft lists its sketches instead. */
function placesOf(store: DraftStore, slug: string, version: number): Place[] {
  const draft = loadDraft(store, slug);
  const base = versionFolder(version);
  if (draft.craft) {
    const names = draft.craft.picked ? [draft.craft.picked] : ['A', 'B', 'C'];
    return names
      .filter((name) => WHY_NAME.test(name))
      .map((name) => ({
        name,
        tsx: `${base}/src/tsx/sketches/${name}.tsx`,
        idPrefix: `sketches/${name}:`,
      }));
  }
  const layout = store.readText(slug, `${base}/md/layout.md`);
  if (layout === undefined) return [];
  return parseLayout(layout)
    .sections.map((section) => pascalCase(section.id))
    .filter((name) => WHY_NAME.test(name))
    .map((name) => ({
      name,
      tsx: `${base}/src/tsx/sections/${name}.tsx`,
      idPrefix: `sections/${name}:`,
    }));
}

/** The ids of a version's build, or none when there is no build or the file does not read. */
function builtIds(store: DraftStore, slug: string, version: number): string[] {
  const text = store.readText(slug, `${versionFolder(version)}/build/json/ids.json`);
  if (text === undefined) return [];
  try {
    const raw: unknown = JSON.parse(text);
    const ids = typeof raw === 'object' && raw !== null && 'ids' in raw ? raw.ids : null;
    return typeof ids === 'object' && ids !== null ? Object.keys(ids) : [];
  } catch {
    // A broken id file only costs the entries their click target; the next build writes it again.
    return [];
  }
}

/** The section's own outermost element: the id of its file with no `/` after the colon. */
function rootOf(ids: readonly string[], prefix: string): string | null {
  return ids.find((id) => id.startsWith(prefix) && !id.slice(prefix.length).includes('/')) ?? null;
}

function readFile(store: DraftStore, slug: string, version: number, name: string): WhyFile | null {
  try {
    const raw = store.readJson(slug, `${versionFolder(version)}/${WHY_FOLDER}/${name}.json`);
    const parsed = WhyFileSchema.safeParse(raw);
    return parsed.success ? parsed.data : null;
  } catch {
    // Not JSON: the entry is left out, and the section offers to ask Claude again.
    return null;
  }
}

/**
 * The reasons of every section of `version`, in layout order. `missing` names the sections with
 * no readable file. A hash that is still `PENDING_HASH` is not stale: it has not been stamped yet.
 */
export function readWhy(store: DraftStore, slug: string, version: number): WhyReport {
  const ids = builtIds(store, slug, version);
  const sections: WhyEntry[] = [];
  const missing: string[] = [];
  for (const place of placesOf(store, slug, version)) {
    const file = readFile(store, slug, version, place.name);
    if (file === null) {
      missing.push(place.name);
      continue;
    }
    const source = store.readText(slug, place.tsx);
    const stale =
      file.hash !== PENDING_HASH && (source === undefined || file.hash !== sha256(source));
    sections.push({
      section: place.name,
      element: rootOf(ids, place.idPrefix),
      lines: file.lines,
      guidelines: file.guidelines,
      stale,
    });
  }
  return { sections, missing };
}

/**
 * Puts the sha256 of the section's TSX into each file an agent left with `PENDING_HASH`. Answers
 * how many files it wrote. Files with another hash, and files that do not read, stay as they are.
 */
export function stampWhy(store: DraftStore, slug: string, version: number): number {
  let written = 0;
  for (const place of placesOf(store, slug, version)) {
    const file = readFile(store, slug, version, place.name);
    const source = store.readText(slug, place.tsx);
    if (file === null || file.hash !== PENDING_HASH || source === undefined) continue;
    const path = `${versionFolder(version)}/${WHY_FOLDER}/${place.name}.json`;
    store.writeText(slug, path, serializeJson({ ...file, hash: sha256(source) }));
    written += 1;
  }
  return written;
}
