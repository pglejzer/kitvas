// Where drafts live. Paths inside a draft are relative, with forward slashes: `v1/md/layout.md`.

export interface DraftStore {
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
