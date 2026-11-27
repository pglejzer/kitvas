// How a project's own code finds its files and types (ADR 0092): one record, made from the
// project's tsconfig.json and from what its kit declares, that the bundler, Sass and the types
// check all follow. Every path in it is absolute with forward slashes.

import { readFileSync } from 'node:fs';
import { posix } from 'node:path';
import { type ReadText, readTsconfig, tsconfigReferences } from './tsconfig.ts';

/**
 * `resolve` of kit.json: what the project's build configuration says and its tsconfig.json does
 * not. Every path is a project path.
 */
export type DeclaredResolve = {
  /** Folders an import without `./` starts from, in scripts and in Sass. */
  roots: string[];
  /** Names that stand for a folder or a file: `{ "@": "src" }`. */
  alias: Record<string, string>;
  /** Type files, or folders of them, that nothing imports and the tsconfig does not take in. */
  types: string[];
};

export type ProjectResolve = {
  /** The project's tsconfig.json, or its jsconfig.json when it has no tsconfig. */
  config: string | undefined;
  /**
   * Import patterns to their targets, in the form of tsconfig `paths`. The pattern `*` holds the
   * folders an import without `./` starts from (`<folder>/*`), tried before `node_modules`.
   */
  paths: Record<string, string[]>;
  /**
   * What a types check reads besides its own entry: the type files the project's own check takes
   * in without an import, as `files`, `include` and `exclude` of a tsconfig.
   */
  types: { files: string[]; include: string[]; exclude: string[] };
};

/** The configs a project may have; the first one found is read. */
const CONFIGS = ['tsconfig.json', 'jsconfig.json'];

const TYPE_FILE = /\.d\.[cm]?ts$/;
/** One script or data file: it is read as a file, never as a folder. */
const SCRIPT = /\.(?:[cm]?[jt]sx?|json)$/;
/** The last part of an `include` pattern that takes in type files: `*`, `*.*`, `*.ts`. */
const TAKES_TYPE_FILES = /^\*(?:\.\*|\.[cm]?ts)?$/;

/** The type files (`.d.ts`) an `include` pattern of the project takes in, as a pattern. */
function typeFilesIn(pattern: string): string[] {
  const path = pattern.replace(/\/+$/, '');
  const last = path.slice(path.lastIndexOf('/') + 1);
  if (TYPE_FILE.test(last)) return [path];
  if (last === '**') return [`${path}/*.d.ts`];
  if (/[*?]/.test(last)) {
    return TAKES_TYPE_FILES.test(last) ? [`${path.slice(0, -last.length)}*.d.ts`] : [];
  }
  return SCRIPT.test(last) ? [] : [`${path}/**/*.d.ts`];
}

/**
 * The record of the project at `project` (absolute, forward slashes). Its tsconfig gives `paths`,
 * `baseUrl` (a folder imports start from) and the type files of `include` and `files`; the configs
 * it `references` (a project made by Vite keeps them there) give theirs after it. `declared` adds
 * what only the project's build configuration says, and comes first where both name a pattern. A
 * project without a config and without `declared` has an empty record.
 */
export function projectResolve(
  project: string,
  declared: DeclaredResolve | undefined,
  read: ReadText,
): ProjectResolve {
  const config = CONFIGS.map((name) => `${project}/${name}`).find(
    (file) => read(file) !== undefined,
  );
  const configs = (config === undefined ? [] : [config, ...tsconfigReferences(config, read)]).map(
    (file) => ({ dir: posix.dirname(file), ...readTsconfig(file, read) }),
  );
  const inProject = (path: string): string => posix.join(project, path);

  const paths: Record<string, string[]> = {};
  const add = (pattern: string, targets: string[]): void => {
    paths[pattern] = [...new Set([...(paths[pattern] ?? []), ...targets])];
  };
  for (const root of declared?.roots ?? []) add('*', [`${inProject(root)}/*`]);
  for (const [name, target] of Object.entries(declared?.alias ?? {})) {
    // The name alone is the target itself; anything under the name is under the target folder.
    add(name, [inProject(target)]);
    add(`${name}/*`, [`${inProject(target)}/*`]);
  }
  for (const found of configs) {
    for (const [pattern, targets] of Object.entries(found.paths)) add(pattern, targets);
    if (found.baseUrl !== undefined) add('*', [`${found.baseUrl}/*`]);
  }

  const declaredTypes = (declared?.types ?? []).map(inProject);
  const isFile = (path: string): boolean => SCRIPT.test(path);
  return {
    config,
    paths,
    types: {
      files: [
        ...declaredTypes.filter(isFile),
        ...configs.flatMap((found) => (found.files ?? []).filter((file) => TYPE_FILE.test(file))),
      ],
      include: [
        ...declaredTypes.filter((path) => !isFile(path)).map((path) => `${path}/**/*.d.ts`),
        ...configs.flatMap((found) => {
          // tsc reads every file under the config's folder when the config names neither.
          const everything = found.files === undefined ? [`${found.dir}/**/*`] : [];
          return (found.include ?? everything).flatMap(typeFilesIn);
        }),
      ],
      // A config's own `exclude` takes the place of tsc's default one, which leaves out the
      // folders the project's build writes.
      exclude: [...new Set(configs.flatMap((found) => found.exclude ?? found.outputs))],
    },
  };
}

const readText: ReadText = (file) => {
  try {
    return readFileSync(file, 'utf8');
  } catch {
    return undefined;
  }
};

/** `projectResolve` of the project folder `project` on disk (absolute, either kind of slash). */
export const readProjectResolve = (
  project: string,
  declared: DeclaredResolve | undefined,
): ProjectResolve => projectResolve(project.split('\\').join('/'), declared, readText);

/**
 * Where `specifier` leads by `patterns` (the form of tsconfig `paths`), as tsc picks: every target
 * of the pattern that equals it, else of the one with the longest text before its `*`. An empty
 * list for a specifier no pattern fits.
 */
export function pathTargets(patterns: Record<string, string[]>, specifier: string): string[] {
  let best: { before: string; after: string; targets: string[] } | undefined;
  for (const [pattern, targets] of Object.entries(patterns)) {
    const star = pattern.indexOf('*');
    if (star === -1) {
      if (pattern === specifier) return targets;
      continue;
    }
    const before = pattern.slice(0, star);
    const after = pattern.slice(star + 1);
    const fits =
      specifier.length >= before.length + after.length &&
      specifier.startsWith(before) &&
      specifier.endsWith(after);
    if (fits && (best === undefined || before.length > best.before.length)) {
      best = { before, after, targets };
    }
  }
  if (best === undefined) return [];
  const matched = specifier.slice(best.before.length, specifier.length - best.after.length);
  return best.targets.map((target) => target.replace('*', () => matched));
}
