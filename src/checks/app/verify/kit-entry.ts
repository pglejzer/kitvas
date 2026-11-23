// The kit's entry file as the tools name it, and the component behind one of its lines.

import { basename, join, relative, sep } from 'node:path';
import { generatedEntry, type LoadedKit } from '../../../kit/index.ts';

/** Absolute path of the kit's entry: `generated/kit.ts` of a project kit, else its own file. */
export const entryFile = (loaded: LoadedKit): string =>
  join(loaded.dir, ...loaded.kit.runtime.entry.split('/'));

/**
 * True when `file`, as esbuild or tsc printed it (relative to `workingDir`, forward slashes), is
 * the kit's entry. The tools resolve links (a temp folder on macOS, a short name on Windows), so
 * the end of the path counts as well: `<kit folder>/<entry>`.
 */
export function isEntryFile(loaded: LoadedKit, workingDir: string, file: string): boolean {
  const spelled = relative(workingDir, entryFile(loaded)).split(sep).join('/');
  const tail = `${basename(loaded.dir)}/${loaded.kit.runtime.entry}`;
  return file === spelled || file === tail || file.endsWith(`/${tail}`);
}

/**
 * Index of the component a line of the generated entry re-exports. `undefined` for a built-in
 * kit (its entry is written by hand) and for a line that is no component's.
 */
export function componentAtEntryLine(loaded: LoadedKit, line: number): number | undefined {
  if (loaded.project === undefined) return undefined;
  const { lines } = generatedEntry(loaded.kit);
  const index = loaded.kit.components.findIndex((component) => lines[component.name] === line);
  return index === -1 ? undefined : index;
}
