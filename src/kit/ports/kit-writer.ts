// Writes the files kitvas itself puts into a project kit's folder (`kit new`, `generated/kit.ts`).

export interface KitWriter {
  /** Text of a file inside the kit folder, or `undefined` when it is missing or outside the folder. */
  readText(id: string, relPath: string): string | undefined;
  /** Writes a file inside the kit folder, creating folders. Throws KIT_INVALID for a path outside it. */
  writeText(id: string, relPath: string, text: string): void;
  /** Writes a binary file inside the kit folder (copied images), creating folders. Throws KIT_INVALID outside it. */
  writeBytes(id: string, relPath: string, bytes: Uint8Array): void;
  /** Removes a file or a folder inside the kit folder; nothing when missing. Throws KIT_INVALID outside it. */
  remove(id: string, relPath: string): void;
}
