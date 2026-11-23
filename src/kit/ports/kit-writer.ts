// Writes the files kitvas itself puts into a project kit's folder (`kit new`, `generated/kit.ts`),
// into the project's additions to a kit (`.kitvas/additions/<id>/`), and out to a folder.

import type { KitComponent } from '../domain/contract.ts';

/** A text file to write: its path from the folder it goes to, with forward slashes. */
export type TextFile = { path: string; text: string };

export interface KitWriter {
  /** Text of a file inside the kit folder, or `undefined` when it is missing or outside the folder. */
  readText(id: string, relPath: string): string | undefined;
  /** Writes a file inside the kit folder, creating folders. Throws KIT_INVALID for a path outside it. */
  writeText(id: string, relPath: string, text: string): void;
  /** Writes a binary file inside the kit folder (copied images), creating folders. Throws KIT_INVALID outside it. */
  writeBytes(id: string, relPath: string, bytes: Uint8Array): void;
  /** Removes a file or a folder inside the kit folder; nothing when missing. Throws KIT_INVALID outside it. */
  remove(id: string, relPath: string): void;
  /**
   * Adds `component` to the project's additions of kit `id`: writes `files` (paths from the
   * additions folder, all inside its `components/`) and puts the component into `additions.json`,
   * in place of an earlier addition with its name when `replace` is set.
   * Throws KIT_NOT_FOUND for no such kit; ADDITION_EXISTS (`{kit, name}`) when the kit has the
   * name, or an earlier addition has it and `replace` is false; ADDITION_INVALID (`{name, detail}`)
   * for a file outside `components/`, a component the contract refuses, or an `additions.json`
   * that cannot be read. Nothing is written when it throws.
   */
  writeAddition(id: string, component: KitComponent, files: TextFile[], replace: boolean): void;
  /**
   * Writes plain files into `dir`, creating folders. Never overwrites: a file that is there already
   * throws USAGE (`{detail: <its path>}`), a path that leaves `dir` ADDITION_INVALID, and then
   * nothing is written.
   */
  exportFiles(dir: string, files: TextFile[]): void;
  /**
   * Writes `generated/kit.ts` into the additions folder of kit `id`: the `@kit` entry of a built-in
   * kit that has additions. Only when it is missing or different; true when written. Optional so
   * test fakes need not have it; without it such an entry is never written.
   */
  syncAdditionsEntry?(id: string, text: string): boolean;
}
