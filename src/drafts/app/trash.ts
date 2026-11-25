// Use cases: delete a draft into the trash, bring it back, remove it for good, list what is in the
// trash (ADR 0064). A delete never destroys: the folder moves whole, and `purge` is the one step
// that removes anything.

import { KitvasError } from '../../shared/index.ts';
import { isSlug } from '../domain/names.ts';
import {
  type DeletedFile,
  parseDeletedFile,
  parseTrashEntry,
  TRASH_FILE,
  trashEntryName,
} from '../domain/trash.ts';
import type { DraftStore } from '../ports/draft-store.ts';

export type DeletedDraft = {
  slug: string;
  title: string;
  /** ISO date and time of the delete. */
  deletedAt: string;
  /** The folder name in the trash. */
  entry: string;
};

function parseJson(text: string | undefined): unknown {
  if (text === undefined) return undefined;
  try {
    return JSON.parse(text);
  } catch {
    return undefined;
  }
}

/** The draft's title as `draft.json` says it; the slug when that file does not read. */
function titleIn(read: (relPath: string) => string | undefined, slug: string): string {
  const raw = parseJson(read('draft.json'));
  if (typeof raw === 'object' && raw !== null && 'title' in raw) {
    const { title } = raw;
    if (typeof title === 'string' && title !== '') return title;
  }
  return slug;
}

/** Every deleted draft of the trash, newest first. A folder kitvas did not name is left out. */
export function listDeleted(store: DraftStore): DeletedDraft[] {
  const found: DeletedDraft[] = [];
  for (const name of store.trash.entries()) {
    const parsed = parseTrashEntry(name);
    if (!parsed) continue;
    const stored = parseDeletedFile(parseJson(store.trash.readText(name, TRASH_FILE)));
    found.push({
      slug: parsed.slug,
      title: stored?.title ?? titleIn((rel) => store.trash.readText(name, rel), parsed.slug),
      deletedAt: parsed.deletedAt,
      entry: name,
    });
  }
  return found.sort(newestFirst);
}

/** By the time of the delete, then by name, so the order never depends on the folder listing. */
function newestFirst(a: DeletedDraft, b: DeletedDraft): number {
  if (a.deletedAt !== b.deletedAt) return a.deletedAt < b.deletedAt ? 1 : -1;
  if (a.entry === b.entry) return 0;
  return a.entry < b.entry ? 1 : -1;
}

/** The deleted copies of one slug, newest first. */
const copiesOf = (store: DraftStore, slug: string): DeletedDraft[] =>
  listDeleted(store).filter((item) => item.slug === slug);

function requireSlug(slug: string): void {
  if (!isSlug(slug)) throw new KitvasError('DRAFT_INVALID', { slug, detail: 'slug' });
}

/**
 * The deleted copies of `slug`, newest first, for the CLI, whose message for a name that is not
 * in the trash points at `draft list --deleted`: DRAFT_NOT_DELETED when there is none.
 */
export function requireDeleted(store: DraftStore, slug: string): DeletedDraft[] {
  requireSlug(slug);
  const copies = copiesOf(store, slug);
  if (copies.length === 0) throw new KitvasError('DRAFT_NOT_DELETED', { slug });
  return copies;
}

/**
 * Moves the draft to the trash. A draft whose `draft.json` does not read can be deleted too: its
 * title is then its slug. Two deletes of one slug give two copies.
 */
export function deleteDraft(store: DraftStore, slug: string, now: Date): DeletedDraft {
  requireSlug(slug);
  if (!store.exists(slug, 'draft.json')) throw new KitvasError('DRAFT_NOT_FOUND', { slug });
  const title = titleIn((rel) => store.readText(slug, rel), slug);
  // Two deletes in one millisecond would share a name: the later one waits a millisecond.
  const taken = new Set(store.trash.entries());
  let at = now;
  while (taken.has(trashEntryName(slug, at))) at = new Date(at.getTime() + 1);
  const entry = trashEntryName(slug, at);
  store.trash.put(slug, entry);
  const deletedAt = at.toISOString();
  const file: DeletedFile = { schemaVersion: 1, slug, title, deletedAt };
  try {
    store.trash.writeText(entry, TRASH_FILE, `${JSON.stringify(file, null, 2)}\n`);
  } catch {
    // The draft is in the trash already; a copy without this file still lists, by its folder name.
  }
  return { slug, title, deletedAt, entry };
}

/**
 * Brings back the newest deleted copy of `slug`. DRAFT_EXISTS when a draft of that slug is there
 * now, DRAFT_NOT_FOUND when no copy is deleted.
 */
export function restoreDraft(store: DraftStore, slug: string): DeletedDraft {
  requireSlug(slug);
  const [newest] = copiesOf(store, slug);
  if (!newest) throw new KitvasError('DRAFT_NOT_FOUND', { slug });
  if (store.exists(slug)) throw new KitvasError('DRAFT_EXISTS', { slug });
  store.trash.take(newest.entry, slug);
  return newest;
}

/** Removes every deleted copy of `slug` for good. DRAFT_NOT_FOUND when there is none. */
export function purgeDeleted(store: DraftStore, slug: string): DeletedDraft[] {
  requireSlug(slug);
  const copies = copiesOf(store, slug);
  if (copies.length === 0) throw new KitvasError('DRAFT_NOT_FOUND', { slug });
  for (const copy of copies) store.trash.remove(copy.entry);
  return copies;
}

/** Removes every deleted draft for good; a draft that is live is never touched. */
export function purgeAllDeleted(store: DraftStore): DeletedDraft[] {
  const copies = listDeleted(store);
  for (const copy of copies) store.trash.remove(copy.entry);
  return copies;
}
