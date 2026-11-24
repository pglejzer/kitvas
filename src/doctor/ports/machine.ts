// What the doctor asks of the machine. A fake of it tests every check.

export type DepsFacts = {
  /** How many packages kitvas loads at run time. */
  total: number;
  /** The ones that do not load, by name. */
  missing: string[];
};

export type Machine = {
  /** The text of a file; `undefined` when it cannot be read. */
  readText(file: string): string | undefined;
  /** True when the path names a folder. */
  isFolder(path: string): boolean;
  /** The third-party packages kitvas loads, and which of them are missing. */
  packages(): DepsFacts;
  /** Creates or replaces a file with `text`; throws when it cannot. */
  write(file: string, text: string): void;
  /**
   * Moves `from` over `to`, the way the draft store moves a file. A move another program blocks
   * for a moment is tried again; `retries` says how many tries it needed. Throws when it never
   * works.
   */
  move(from: string, to: string): { retries: number };
  /** Removes a file; does nothing when there is none. */
  remove(file: string): void;
  /** Opens a loopback port and closes it again; throws when it cannot. */
  openLoopback(): Promise<void>;
  /** The addresses a name resolves to; throws when it does not. */
  resolveHost(name: string): Promise<string[]>;
  /** The operating system as `<name> <version>` and the architecture. */
  system(): { os: string; arch: string };
};
