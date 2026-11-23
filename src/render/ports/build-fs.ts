// The files a build reads and writes. All paths are absolute.

export interface BuildFs {
  exists(path: string): boolean;
  /** Files under a folder, recursive, relative with forward slashes, sorted. Empty when missing. */
  listFiles(dir: string): string[];
  readBytes(file: string): Uint8Array;
  /** `undefined` when the file is missing. */
  readText(file: string): string | undefined;
  /** Creates parent folders. */
  writeText(file: string, text: string): void;
  /** Removes a file or a folder. Does nothing when it is missing. */
  remove(path: string): void;
  /** Does nothing when the source is missing. */
  copyDir(from: string, to: string): void;
  /** Copies one file, creating parent folders. Does nothing when the source is missing. */
  copyFile(from: string, to: string): void;
}
