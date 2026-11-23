// Use case: keep a project kit's `generated/kit.ts` in step with its catalog.

import { basename } from 'node:path';
import { GENERATED_ENTRY, generatedEntry } from '../domain/generated-entry.ts';
import { isProjectKit } from '../domain/sources.ts';
import type { KitWriter } from '../ports/kit-writer.ts';
import type { LoadedKit } from './load-kit.ts';

/** Writes generated/kit.ts of a project kit when missing or different; no-op for built-in kits. True when written. */
export function syncGeneratedEntry(writer: KitWriter, loaded: LoadedKit): boolean {
  if (!isProjectKit(loaded.kit) || loaded.project === undefined) return false;
  // The folder name, not kit.id: a kit whose id differs from its folder still gets its own file.
  const id = basename(loaded.dir);
  const { text } = generatedEntry(loaded.kit);
  if (writer.readText(id, GENERATED_ENTRY) === text) return false;
  writer.writeText(id, GENERATED_ENTRY, text);
  return true;
}
