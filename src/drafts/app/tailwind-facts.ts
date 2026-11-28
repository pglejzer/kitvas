// What a maker or the hand-off is told of the project's Tailwind: the version and the prefix its
// classes carry, and the classes the kit's tokens map onto.

import { relative } from 'node:path';
import type { LoadedKit, ProjectSetup } from '../../kit/index.ts';
import {
  catalogDir,
  readTailwindFile,
  type TailwindFile,
  themePathOf,
} from '../../shared/index.ts';
import type { DraftStore } from '../ports/draft-store.ts';

export type TailwindFacts = { version: 3 | 4; prefix: string };

/** What the facts read of the project: a file's bytes and an installed package's version. */
export type TailwindFiles = Pick<ProjectSetup, 'readBytes' | 'packageVersion'>;

/** The major of an installed `tailwindcss` (`3.4.17` gives 3); 4 when it says nothing. */
export const majorOf = (installed: string | undefined): 3 | 4 =>
  /^\s*v?3\./.test(installed ?? '') ? 3 : 4;

/**
 * The facts of the latest built version, else of the kit's catalog build, else the major of the
 * installed package with no prefix.
 */
export function pickTailwindFacts(input: {
  version: TailwindFile | undefined;
  catalog: TailwindFile | undefined;
  installed: string | undefined;
}): TailwindFacts {
  const theme = input.version?.theme ?? input.catalog?.theme;
  return theme === null || theme === undefined
    ? { version: majorOf(input.installed), prefix: '' }
    : { version: theme.version, prefix: theme.prefix };
}

/** The facts for one draft version of a Tailwind kit, the project read through `files`. */
export function tailwindFacts(
  files: TailwindFiles,
  store: DraftStore,
  slug: string,
  base: string,
  kit: LoadedKit,
): TailwindFacts {
  // The catalog folder is `.kitvas/cache/catalog/<id>`: a project path.
  const catalog =
    kit.project === undefined
      ? undefined
      : relative(kit.project, catalogDir(kit.project, kit.kit.id)).replaceAll('\\', '/');
  const bytes = (file: string): string | undefined => {
    const read = files.readBytes(file);
    return read === undefined ? undefined : new TextDecoder().decode(read);
  };
  return pickTailwindFacts({
    version: readTailwindFile((file) => store.readText(slug, file), base),
    catalog: catalog === undefined ? undefined : readTailwindFile(bytes, catalog),
    installed: files.packageVersion('tailwindcss'),
  });
}

/** What the kit's tokens map onto, once each: a theme path as its dot path (`colors.primary`). */
export const tailwindClasses = (kit: LoadedKit): string[] => [
  ...new Set(Object.values(kit.cssVarMap).map((value) => themePathOf(value) ?? value)),
];
