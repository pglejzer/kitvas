// What a build needs from a project kit besides kit.json: where its components live, which files
// count for the cache key, which hold class names, and the import paths of its providers.

import { join } from 'node:path';
import { ADDITION_FILES, isWrittenKit, type LoadedKit, PROJECT_PATH } from '../../kit/index.ts';
import { packageDirFrom } from '../../shared/index.ts';
import { CANDIDATE_LIMITS } from '../domain/candidates.ts';
import type { MountProvider } from '../domain/provider-source.ts';
import type { BuildFs } from '../ports/build-fs.ts';
import type { UtilityCss, UtilityOutput } from '../ports/utility-css.ts';

const inProject = (project: string, relPath: string): string =>
  join(project, ...relPath.split('/'));

/** How a module path of the project may be spelled on disk: `src/theme` is `src/theme.ts`, … */
const MODULE_ENDINGS = [
  '',
  '.ts',
  '.tsx',
  '.js',
  '.jsx',
  '.mjs',
  '.cjs',
  '/index.ts',
  '/index.tsx',
  '/index.js',
  '/index.jsx',
];

/**
 * The import path for a provider's or a binding's `from`. A project path (C1 `PROJECT_PATH`) that
 * names a module of the project becomes its absolute path with forward slashes, which esbuild
 * takes from every working folder; `@kit` and package specifiers stay as they are.
 */
export function importPath(fs: BuildFs, project: string | undefined, from: string): string {
  if (project === undefined || !PROJECT_PATH.test(from)) return from;
  const base = inProject(project, from);
  return MODULE_ENDINGS.some((ending) => fs.exists(base + ending))
    ? base.split('\\').join('/')
    : from;
}

/** The kit's providers for a generated entry, with their bindings. */
export function mountProviders(fs: BuildFs, loaded: LoadedKit): MountProvider[] {
  const resolve = (from: string): string => importPath(fs, loaded.project, from);
  return loaded.kit.runtime.providers.map((provider) => ({
    from: resolve(provider.import.from),
    name: provider.import.name,
    isDefault: provider.import.default === true,
    props: provider.props,
    bindings: Object.entries(provider.bindings).map(([prop, binding]) => ({
      prop,
      from: resolve(binding.from),
      name: binding.name,
    })),
  }));
}

/** The folder of the kit's components: a repo kit's source folder, an npm kit's package folder. */
export function componentDir(loaded: LoadedKit): string | undefined {
  const { project } = loaded;
  const { source } = loaded.kit;
  if (isWrittenKit(loaded.kit)) return join(loaded.dir, 'components');
  if (project === undefined) return undefined;
  if (source.type === 'repo') return inProject(project, source.path);
  if (source.type !== 'npm') return undefined;
  return (
    packageDirFrom(project, source.package) ??
    join(project, 'node_modules', ...source.package.split('/'))
  );
}

/**
 * What of the project counts for a build's cache key besides the kit folder: every file of a repo
 * kit's folder; an npm kit's `package.json`, so an upgrade of the package builds again; the kit's
 * additions folder, for any kit that has one.
 */
export function projectInputs(loaded: LoadedKit): { dirs: string[]; files: string[] } {
  const added = loaded.additionsDir === undefined ? [] : [loaded.additionsDir];
  const dir = componentDir(loaded);
  if (dir === undefined) return { dirs: added, files: [] };
  const { type } = loaded.kit.source;
  // A written kit's components are inside the kit folder, which is hashed already.
  if (isWrittenKit(loaded.kit)) return { dirs: added, files: [] };
  return type === 'repo'
    ? { dirs: [dir, ...added], files: [] }
    : { dirs: added, files: [join(dir, 'package.json')] };
}

const SCRIPTS = { repo: /\.(tsx|ts|jsx|js)$/, npm: /\.(js|mjs)$/, written: /\.(tsx|ts)$/ };

/** Absolute files of the kit's components, its additions' included, that may hold class names. */
export function componentSources(fs: BuildFs, loaded: LoadedKit): string[] {
  return [...ownSources(fs, loaded), ...additionSources(fs, loaded)];
}

/** The scripts of the kit's additions (`.kitvas/additions/<id>/components/`). */
function additionSources(fs: BuildFs, loaded: LoadedKit): string[] {
  if (loaded.additionsDir === undefined) return [];
  const dir = join(loaded.additionsDir, ADDITION_FILES);
  return fs
    .listFiles(dir)
    .filter((relPath) => SCRIPTS.written.test(relPath) && !relPath.endsWith('.d.ts'))
    .map((relPath) => join(dir, ...relPath.split('/')));
}

function ownSources(fs: BuildFs, loaded: LoadedKit): string[] {
  const dir = componentDir(loaded);
  const { type } = loaded.kit.source;
  if (dir === undefined || type === 'builtin') return [];
  const scripts = isWrittenKit(loaded.kit)
    ? SCRIPTS.written
    : type === 'repo'
      ? SCRIPTS.repo
      : SCRIPTS.npm;
  return fs
    .listFiles(dir)
    .filter(
      (relPath) =>
        scripts.test(relPath) &&
        !relPath.endsWith('.d.ts') &&
        !relPath.split('/').includes('node_modules'),
    )
    .map((relPath) => join(dir, ...relPath.split('/')));
}

/**
 * Custom properties a utility build must define even when no class uses them: every variable the
 * kit's tokens point at (so `--kit-*` always resolves), then the ones a caller asks for.
 */
export const probeNames = (loaded: LoadedKit, extra: string[] = []): string[] => [
  ...new Set([...Object.values(loaded.cssVarMap), ...extra]),
];

/**
 * Tailwind's CSS for a kit with `runtime.styles.tailwind`; `undefined` for every other kit. `own`
 * are the build's own sources (the draft's TSX, the catalog's examples); they go first, so the cap
 * on files never drops them.
 */
export function utilityBuild(
  utility: UtilityCss,
  fs: BuildFs,
  loaded: LoadedKit,
  own: string[],
  probe: string[],
): Promise<UtilityOutput> | undefined {
  const tailwind = loaded.kit.runtime.styles.tailwind;
  if (tailwind === undefined || loaded.project === undefined) return undefined;
  const sources = [...own, ...componentSources(fs, loaded)].slice(0, CANDIDATE_LIMITS.files);
  return utility.build({
    project: loaded.project,
    entry: inProject(loaded.project, tailwind.entry),
    sources,
    probe,
  });
}

/** Sheets in order, each on its own lines, empty ones left out. */
export const joinSheets = (parts: string[]): string =>
  parts.filter((part) => part.trim() !== '').join('\n');

/** True when both lists hold the same files in the same order. */
export const sameFiles = (a: string[], b: string[]): boolean =>
  a.length === b.length && a.every((file, index) => file === b[index]);
