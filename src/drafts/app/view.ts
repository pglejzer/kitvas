// Locked and hidden elements of a draft (spec 4d, goal 4; plan 17, task C): `<draft>/view.json`
// read and written, and the ids carried to the latest version through the rename logs (ADR 0052),
// as waivers are. A lock carries from the moment it was saved (`version`, `at`): only the steps
// after it rename it. The hidden ids are kept as the start of `version` names them, so every step
// of that version applies to them. The studio is the only writer of the file.

import { serializeJson } from '../domain/draft.ts';
import { versionFolder } from '../domain/names.ts';
import {
  type Lock,
  MAX_VIEW_IDS,
  VIEW_FILE,
  type ViewFile,
  ViewFileSchema,
} from '../domain/view.ts';
import { followRenames, type RenameLike } from '../domain/waivers.ts';
import type { DraftStore } from '../ports/draft-store.ts';
import { idAtStart, readRenames } from './rename-log.ts';

/** One version's rename steps, by version. */
export type StepsOf = (version: number) => readonly RenameLike[];

/** When an id was written: the version and the moment (ISO), as a waiver or a lock keeps them. */
export type Stamp = { version: number; at: string };

const emptyView = (): ViewFile => ({ schemaVersion: 1, locked: [], hidden: [], version: 1 });

const unique = (ids: readonly string[]): string[] => [...new Set(ids)];

/** `sections/Hero:section/Button` is written in `src/tsx/sections/Hero.tsx`. */
const fileOf = (id: string): string => `src/tsx/${id.slice(0, Math.max(0, id.indexOf(':')))}.tsx`;

/** Each version's rename steps, read once per call. */
export function renameSteps(drafts: DraftStore, slug: string): StepsOf {
  const cache = new Map<number, readonly RenameLike[]>();
  return (version) => {
    const known = cache.get(version);
    if (known) return known;
    const steps = readRenames(drafts, slug, version);
    cache.set(version, steps);
    return steps;
  };
}

/**
 * The id `id`, written at `stamp`, as `version` names it: the later steps of the stamp's own
 * version (a session goes on writing its log), then every step of the versions after it. An id
 * written on a later version than `version` stays as it is.
 */
export function carriedId(id: string, stamp: Stamp, version: number, stepsOf: StepsOf): string {
  if (stamp.version > version) return id;
  const steps: RenameLike[] = [];
  for (let at = stamp.version; at <= version; at += 1) {
    const all = stepsOf(at);
    steps.push(...(at === stamp.version ? all.filter((step) => step.at > stamp.at) : all));
  }
  return followRenames(id, steps);
}

/** The draft's view file; an empty one when it is missing or broken. */
export function readView(drafts: DraftStore, slug: string): ViewFile {
  let raw: unknown;
  try {
    raw = drafts.readJson(slug, VIEW_FILE);
  } catch {
    // Not JSON: locks and hide only help the editor, so a broken file never stops the studio.
    return emptyView();
  }
  const parsed = ViewFileSchema.safeParse(raw);
  return parsed.success ? parsed.data : emptyView();
}

/** Writes the view file at once (atomic, as the other draft files). */
export function writeView(drafts: DraftStore, slug: string, view: ViewFile): void {
  // Never more than the schema takes: a file it refuses would read back empty, every lock lost.
  const kept: ViewFile = {
    ...view,
    locked: view.locked.slice(0, MAX_VIEW_IDS),
    hidden: view.hidden.slice(0, MAX_VIEW_IDS),
  };
  drafts.replaceAll(slug, [{ relPath: VIEW_FILE, text: serializeJson(kept) }]);
}

/**
 * The locks with their ids (and files) as version `latest` names their elements. The text, the
 * version and the moment stay as they were saved.
 */
export function locksNow(drafts: DraftStore, slug: string, latest: number): Lock[] {
  const stepsOf = renameSteps(drafts, slug);
  return readView(drafts, slug).locked.map((lock) => {
    const id = carriedId(lock.id, lock, latest, stepsOf);
    return id === lock.id ? lock : { ...lock, id, file: fileOf(id) };
  });
}

/** The element ids of a version's last build; `null` when it has none that reads. */
function builtIds(drafts: DraftStore, slug: string, version: number): Set<string> | null {
  let raw: unknown;
  try {
    raw = drafts.readJson(slug, `${versionFolder(version)}/build/json/ids.json`);
  } catch {
    return null;
  }
  if (typeof raw !== 'object' || raw === null || !('ids' in raw)) return null;
  const { ids } = raw;
  if (typeof ids !== 'object' || ids === null || Array.isArray(ids)) return null;
  return new Set(Object.keys(ids));
}

/**
 * The locked ids as they are named in version `latest`; locks whose element is gone are left out
 * (gone: not among the ids of the version's build, when it has one).
 */
export function lockedIdsNow(drafts: DraftStore, slug: string, latest: number): string[] {
  const known = builtIds(drafts, slug, latest);
  const ids = locksNow(drafts, slug, latest).map((lock) => lock.id);
  return unique(ids.filter((id) => known === null || known.has(id)));
}

/** The hidden ids as version `latest` names their elements. */
export function hiddenNow(drafts: DraftStore, slug: string, latest: number): string[] {
  const view = readView(drafts, slug);
  if (view.version > latest) return [...view.hidden];
  const stepsOf = renameSteps(drafts, slug);
  // Kept as the start of `view.version` names them: every step of that version applies.
  const start: Stamp = { version: view.version, at: '' };
  return unique(view.hidden.map((id) => carriedId(id, start, latest, stepsOf)));
}

/**
 * A lock on the element `id` as it is named at `stamp`, keeping `text`: the element's source as
 * it was cut from its file (not collapsed, so Restore gives it back byte for byte).
 */
export const newLock = (id: string, text: string, stamp: Stamp): Lock => ({
  id,
  file: fileOf(id),
  text,
  version: stamp.version,
  at: stamp.at,
});

export type ViewSave = {
  /** The latest version: the one the hidden ids name. */
  latest: number;
  locked: readonly Lock[];
  hidden: readonly string[];
};

/**
 * Writes both lists; each lock carries its own stamp. A hidden id is written as the start of
 * `latest` named its element, so the session's earlier steps are not applied to it twice; an
 * element the session made has no such id and is written as it is. Answers the file as written.
 */
export function saveView(drafts: DraftStore, slug: string, save: ViewSave): ViewFile {
  const seen = new Set<string>();
  const locked = save.locked.filter((lock) => {
    if (seen.has(lock.id)) return false;
    seen.add(lock.id);
    return true;
  });
  const steps = readRenames(drafts, slug, save.latest);
  const hidden = unique(save.hidden.map((id) => idAtStart(steps, id) ?? id));
  writeView(drafts, slug, { schemaVersion: 1, locked, hidden, version: save.latest });
  return readView(drafts, slug);
}
