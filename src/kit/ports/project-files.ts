// What the kit module reads from the person's project: its files and its installed packages.

export interface ProjectFiles {
  /**
   * True when the project path (C1 PROJECT_PATH) names something, resolved the way a bundler
   * resolves a module: the file itself, then with `.tsx`, `.ts`, `.jsx`, `.js`, `.mjs`, `.css`,
   * `.scss`, then `<path>/index.{tsx,ts,jsx,js}`, then the folder itself.
   */
  exists(relPath: string): boolean;
  /** True when what `exists` found, symlinks resolved, is still inside the project. */
  realInside(relPath: string): boolean;
  /** Version from the package.json of an installed package (found as C4 `packageDirFrom` finds it), or undefined. */
  packageVersion(name: string): string | undefined;
}

/** What `kit new` reads besides: the packages an installed package depends on. */
export interface ProjectSetup extends ProjectFiles {
  /**
   * Names in `dependencies` and `peerDependencies` of <project>/node_modules/<name>/package.json,
   * sorted; [] when the package is not installed.
   */
  packageDependencies(name: string): string[];
  /**
   * Files under a project folder (C1 PROJECT_PATH), recursive, relative to that folder with
   * forward slashes, sorted; [] when it is missing or its real path leaves the project.
   */
  listFiles(relPath: string): string[];
  /** Size in bytes of a project file; undefined when missing, a folder, or its real path leaves the project. */
  size(relPath: string): number | undefined;
  /** Bytes of a project file; undefined when missing, a folder, or its real path leaves the project. */
  readBytes(relPath: string): Uint8Array | undefined;
}
