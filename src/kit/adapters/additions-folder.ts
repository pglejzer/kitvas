// The project's additions to kits on disk: `<root>/<kit id>/additions.json` and the files under
// `<root>/<kit id>/components/`, where `<root>` is `<project>/.kitvas/additions`. Also the plain
// export of files to a folder the person names, which never overwrites.

import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, resolve, sep } from 'node:path';
import { KitvasError } from '../../shared/index.ts';
import {
  ADDITION_FILES,
  ADDITIONS_FILE,
  type Additions,
  NO_ADDITIONS,
  parseAddition,
  parseAdditions,
} from '../domain/additions.ts';
import { type KitComponent, parseKit } from '../domain/contract.ts';
import { GENERATED_ENTRY } from '../domain/generated-entry.ts';
import type { KitStore } from '../ports/kit-store.ts';
import type { KitWriter, TextFile } from '../ports/kit-writer.ts';
import { kitDir, kitFile } from './kit-folder.ts';

/** `undefined` when the file is missing; `null` when it is there but not JSON. */
function readJson(file: string): unknown {
  if (!existsSync(file)) return undefined;
  try {
    const json: unknown = JSON.parse(readFileSync(file, 'utf8'));
    return json;
  } catch {
    return null;
  }
}

/** The additions of kit `id` under `root`, for `KitStore.readAdditions`. */
export function readAdditionsFile(
  root: string,
  id: string,
): { json: unknown; dir: string } | undefined {
  const file = kitFile(root, id, ADDITIONS_FILE);
  if (file === undefined) return undefined;
  const json = readJson(file);
  return json === undefined ? undefined : { json, dir: resolve(kitDir(root, id)) };
}

/** `file` resolved inside `dir`, or `undefined` when it would leave it (or is `dir` itself). */
function inside(dir: string, path: string): string | undefined {
  const base = resolve(dir);
  const file = resolve(base, path);
  return file.startsWith(base + sep) ? file : undefined;
}

function write(file: string, text: string): void {
  mkdirSync(dirname(file), { recursive: true });
  writeFileSync(file, text);
}

export type AdditionsWriterOptions = {
  /** `<project>/.kitvas/additions`. */
  root: string;
  /** Where the kits are read from: an addition may not take the name of a kit's own component. */
  kits: KitStore;
};

type AdditionsWriter = Required<
  Pick<KitWriter, 'writeAddition' | 'exportFiles' | 'syncAdditionsEntry'>
>;

export function createAdditionsWriter({ root, kits }: AdditionsWriterOptions): AdditionsWriter {
  const invalid = (name: string, detail: string): KitvasError =>
    new KitvasError('ADDITION_INVALID', { name, detail });

  /** The additions already there; NO_ADDITIONS when the kit has none yet. */
  const current = (id: string, name: string): Additions => {
    const read = readAdditionsFile(root, id);
    if (read === undefined) return NO_ADDITIONS;
    const parsed = parseAdditions(read.json);
    if ('at' in parsed) throw invalid(name, ADDITIONS_FILE);
    return parsed.additions;
  };

  /** The kit's own component names, read from its kit.json; additions are not in it. */
  const ownNames = (id: string): Set<string> => {
    const files = kits.read(id);
    if (!files) throw new KitvasError('KIT_NOT_FOUND', { id });
    return new Set(parseKit(files.kitJson, id).components.map((component) => component.name));
  };

  return {
    writeAddition(id: string, raw: KitComponent, files: TextFile[], replace: boolean): void {
      const taken = ownNames(id);
      const checked = parseAddition(raw);
      if ('at' in checked) throw invalid(raw.name, checked.at);
      const { component } = checked;
      const { name } = component;
      // Paths are from the kit's additions folder, and every file stays in its `components/`.
      const folder = kitFile(root, id, ADDITION_FILES);
      if (folder === undefined) throw invalid(name, ADDITION_FILES);
      const targets = files.map((file) => {
        const target = inside(dirname(folder), file.path);
        if (target === undefined || !target.startsWith(folder + sep)) {
          throw invalid(name, file.path);
        }
        return { target, text: file.text };
      });
      // A component of the kit itself is never replaced, whatever `replace` says.
      if (taken.has(name)) throw new KitvasError('ADDITION_EXISTS', { kit: id, name });
      const additions = current(id, name);
      const at = additions.components.findIndex((earlier) => earlier.name === name);
      if (at !== -1 && !replace) throw new KitvasError('ADDITION_EXISTS', { kit: id, name });
      const catalog = kitFile(root, id, ADDITIONS_FILE);
      if (catalog === undefined) throw invalid(name, ADDITIONS_FILE);

      const components =
        at === -1
          ? [...additions.components, component]
          : additions.components.map((earlier, index) => (index === at ? component : earlier));
      const next: Additions = { schemaVersion: 1, components };
      for (const { target, text } of targets) write(target, text);
      // The catalog goes last: it never names a file that was not written.
      write(catalog, `${JSON.stringify(next, null, 2)}\n`);
    },

    exportFiles(dir: string, files: TextFile[]): void {
      const targets = files.map((file) => {
        const target = inside(dir, file.path);
        if (target === undefined) throw invalid(file.path, dir);
        return { target, text: file.text };
      });
      const there = targets.find(({ target }) => existsSync(target));
      if (there) throw new KitvasError('EXPORT_EXISTS', { path: there.target });
      for (const { target, text } of targets) write(target, text);
    },

    syncAdditionsEntry(id: string, text: string): boolean {
      const file = kitFile(root, id, GENERATED_ENTRY);
      if (file === undefined) throw new KitvasError('KIT_NOT_FOUND', { id });
      if (existsSync(file) && readFileSync(file, 'utf8') === text) return false;
      write(file, text);
      return true;
    },
  };
}
