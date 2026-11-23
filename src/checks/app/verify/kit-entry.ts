// The kit's entry file as the tools name it, and the component behind one of its lines.

import { basename, dirname, relative, sep } from 'node:path';
import { entrySource, type LoadedKit } from '../../../kit/index.ts';

/**
 * Absolute path of the kit's `@kit` module: `generated/kit.ts` of a project kit, the one in the
 * additions folder of a built-in kit with additions, else the kit's own file.
 */
export const entryFile = (loaded: LoadedKit): string => loaded.entry;

/**
 * True when `file`, as esbuild or tsc printed it (relative to `workingDir`, forward slashes), is
 * the kit's entry. The tools resolve links (a temp folder on macOS, a short name on Windows), so
 * the end of the path counts as well: `<kit folder>/<entry>`, or `<kit id>/generated/kit.ts` for
 * the entry in the additions folder.
 */
export function isEntryFile(loaded: LoadedKit, workingDir: string, file: string): boolean {
  const entry = entryFile(loaded);
  const spelled = relative(workingDir, entry).split(sep).join('/');
  const inKit = entry.startsWith(loaded.dir + sep);
  const base = inKit ? loaded.dir : dirname(dirname(entry));
  const tail = `${basename(base)}/${relative(base, entry).split(sep).join('/')}`;
  return file === spelled || file === tail || file.endsWith(`/${tail}`);
}

/**
 * Index of the component a line of the generated entry re-exports. `undefined` for a built-in
 * kit without additions (its entry is written by hand) and for a line that is no component's.
 */
export function componentAtEntryLine(loaded: LoadedKit, line: number): number | undefined {
  const lines = entrySource(loaded)?.lines;
  if (lines === undefined) return undefined;
  const index = loaded.kit.components.findIndex((component) => lines[component.name] === line);
  return index === -1 ? undefined : index;
}
