// Use case: keep the `@kit` entry kitvas writes in step with the catalog: a project kit's
// `generated/kit.ts`, and the entry of a built-in kit's additions in the project.

import { basename, dirname, isAbsolute, join, relative } from 'node:path';
import { type EntryAdditions, GENERATED_ENTRY, generatedEntry } from '../domain/generated-entry.ts';
import type { KitWriter } from '../ports/kit-writer.ts';
import { type LoadedKit, ownsGeneratedEntry } from './load-kit.ts';

const slashes = (path: string): string => path.split('\\').join('/');

/** `to` as an import path from the folder `from`, ending in `/`: `../../../additions/acme/`. */
function folderFrom(from: string, to: string): string {
  const path = slashes(relative(from, to));
  // Another drive on Windows has no relative path: the absolute one is used as it is.
  if (isAbsolute(path)) return `${path}/`;
  if (path === '') return './';
  return path.startsWith('.') ? `${path}/` : `./${path}/`;
}

/**
 * The text kitvas writes as the kit's `@kit` module, with each component's line; `undefined` when
 * it writes none (a built-in kit without additions, whose entry is its own file).
 */
export function entrySource(
  loaded: LoadedKit,
): { text: string; lines: Record<string, number> } | undefined {
  const { additionsDir } = loaded;
  if (ownsGeneratedEntry(loaded.kit, loaded.project)) {
    const generated = dirname(join(loaded.dir, ...GENERATED_ENTRY.split('/')));
    const additions: EntryAdditions | undefined =
      additionsDir === undefined
        ? undefined
        : { names: loaded.additions, dir: folderFrom(generated, additionsDir) };
    return generatedEntry(loaded.kit, additions);
  }
  if (loaded.additions.length === 0 || additionsDir === undefined) return undefined;
  const own = join(loaded.dir, ...loaded.kit.runtime.entry.split('/'));
  const generated = dirname(join(additionsDir, ...GENERATED_ENTRY.split('/')));
  return generatedEntry(loaded.kit, {
    names: loaded.additions,
    dir: folderFrom(generated, additionsDir),
    base: slashes(own),
  });
}

/**
 * Writes the `@kit` entry kitvas owns when missing or different: generated/kit.ts of a project kit,
 * or of a built-in kit's additions folder. No-op for a built-in kit without additions. True when
 * written.
 */
export function syncGeneratedEntry(writer: KitWriter, loaded: LoadedKit): boolean {
  const entry = entrySource(loaded);
  if (entry === undefined) return false;
  if (!ownsGeneratedEntry(loaded.kit, loaded.project)) {
    // The additions folder is named by the kit's folder, as the store found it.
    const folder = basename(loaded.additionsDir ?? loaded.dir);
    return writer.syncAdditionsEntry?.(folder, entry.text) ?? false;
  }
  // The folder name, not kit.id: a kit whose id differs from its folder still gets its own file.
  const id = basename(loaded.dir);
  if (writer.readText(id, GENERATED_ENTRY) === entry.text) return false;
  writer.writeText(id, GENERATED_ENTRY, entry.text);
  return true;
}
