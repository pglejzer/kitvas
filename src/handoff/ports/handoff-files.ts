// The files the hand-off reads and writes outside the draft store: the images a package copies and
// the package folder itself (the draft store holds text only).

export type PackageFile = {
  /** Relative to the package folder, forward slashes, no `..`. */
  path: string;
  content: string | Uint8Array;
};

export interface HandoffFiles {
  /**
   * The real path of `path` (absolute, or relative to `root`) when it is a file inside `root`,
   * after links are followed; `undefined` for a missing file or one that leaves `root`.
   */
  resolveInside(root: string, path: string): string | undefined;
  /** Size in bytes of a file, `undefined` when it is missing. */
  size(path: string): number | undefined;
  /** The bytes of a file, `undefined` when it is missing. */
  readBytes(path: string): Uint8Array | undefined;
  /** The text of a file, `undefined` when it is missing. */
  readText(path: string): string | undefined;
  /** Makes `dir` hold exactly these files: what was there before is removed. */
  replaceFolder(dir: string, files: readonly PackageFile[]): void;
}
