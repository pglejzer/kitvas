// Where kits are read from: the folders shipped with the plugin and, layered over them, the kits a
// project learned in `<project>/.kitvas/kits/`.

export type KitFiles = {
  id: string;
  /** Absolute path of the kit folder. */
  dir: string;
  /** Parsed kit.json, not yet checked against the contract. */
  kitJson: unknown;
  /** The project folder for a kit in `<project>/.kitvas/kits/`; absent for a built-in kit. */
  project?: string;
};

export interface KitStore {
  /** Ids of all kits, sorted. */
  list(): string[];
  /** `undefined` when there is no such kit. Throws KIT_INVALID when kit.json is not JSON. */
  read(id: string): KitFiles | undefined;
  /** Parsed JSON of a file inside the kit, or `undefined` when it is missing or outside the kit. */
  readJson(id: string, relPath: string): unknown;
  exists(id: string, relPath: string): boolean;
  /**
   * Text of every file under a folder of the kit, keyed by its path from the kit folder with
   * forward slashes, in sorted order; {} when the folder is missing. Optional so test fakes need
   * not have it; a written kit's hash covers its `components/` folder through it.
   */
  readTree?(id: string, dir: string): Record<string, string>;
  /**
   * Ids of project kit folders hidden by a built-in kit with the same id (the built-in kit wins).
   * Only the layered store has project folders to report.
   */
  shadowedIds?(): string[];
}
