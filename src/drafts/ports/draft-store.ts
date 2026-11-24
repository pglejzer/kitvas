// Where drafts live. Paths inside a draft are relative, with forward slashes: `v1/md/layout.md`.
// Deleted drafts wait in the trash beside them (`DraftTrash`).

/**
 * The deleted drafts (ADR 0064): one folder each, named `<slug>~<stamp>` (`domain/trash.ts`), in a
 * folder beside the drafts. An `entry` that is not such a name throws DRAFT_INVALID.
 */
export interface DraftTrash {
  /** Folder names in the trash, sorted. */
  entries(): string[];
  /** Absolute path of an entry's folder. */
  dir(entry: string): string;
  /** `undefined` when the file is missing. */
  readText(entry: string, relPath: string): string | undefined;
  /** Writes a file into a deleted draft's folder. */
  writeText(entry: string, relPath: string, text: string): void;
  /**
   * Moves the draft's whole folder to the trash as `entry`, in one move. DRAFT_NOT_FOUND when the
   * draft is not there; DRAFT_LOCKED when another program holds its files and the move still
   * fails after the tries, with the draft left whole where it was.
   */
  put(slug: string, entry: string): void;
  /**
   * Moves a deleted draft back as `slug` and drops its `deleted.json`. DRAFT_EXISTS when a draft of
   * that slug is there, DRAFT_NOT_FOUND when the entry is not; DRAFT_LOCKED as for `put`.
   */
  take(entry: string, slug: string): void;
  /** Removes a deleted draft for good. Does nothing when it is gone. DRAFT_LOCKED when it cannot. */
  remove(entry: string): void;
}

export interface DraftStore {
  /** The deleted drafts. */
  trash: DraftTrash;
  /** Slugs of all drafts, sorted. */
  list(): string[];
  /** Absolute path of a draft's folder. */
  dir(slug: string): string;
  /** Without `relPath`: does the draft folder exist. */
  exists(slug: string, relPath?: string): boolean;
  /** `undefined` when the file is missing or outside the draft. */
  readText(slug: string, relPath: string): string | undefined;
  /** Parsed JSON, `undefined` when missing. Throws DRAFT_INVALID when the file is not JSON. */
  readJson(slug: string, relPath: string): unknown;
  /** Creates parent folders. Throws DRAFT_INVALID for a path outside the draft. */
  writeText(slug: string, relPath: string, text: string): void;
  makeDir(slug: string, relPath: string): void;
  /** Copies a folder inside the draft. Does nothing when the source is missing. */
  copyDir(slug: string, fromRel: string, toRel: string): void;
  /**
   * Writes every file or none (spec 4a, decision 10): each text goes to a temporary file beside its
   * file, then each is moved over its file. When a move fails, the files already moved get their old
   * text back (a file that did not exist is removed), the temporary files are removed, and the
   * failure is thrown. A path outside the draft, or a path given twice, throws DRAFT_INVALID before
   * anything is written. `text: null` removes the file, and a rollback writes it back (spec 4b,
   * section ops).
   */
  replaceAll(slug: string, files: { relPath: string; text: string | null }[]): void;
}
