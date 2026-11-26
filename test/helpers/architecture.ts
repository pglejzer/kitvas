// Reads the import graph of src/ and client/ and reports imports that break the module rules.

import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { dirname, join, posix, relative, resolve, sep } from 'node:path';

export type SourceFile = {
  path: string;
  /** Every relative import and re-export, as a path from the root. */
  imports: string[];
  /** The imports that only ever come as `import type` or `export type`: erased, never run. */
  types?: string[];
  /** Bare specifiers that bring code: packages and `node:` built-ins. */
  packages?: string[];
};

const LAYERS = ['domain', 'app', 'ports', 'adapters'];
// A match starts a statement (a line's first word), so the word in a comment starts none, and
// `[^'";]` keeps it inside one statement, so the `type` it reads is the import's own.
const IMPORT =
  /^\s*(?:import|export)\s+(type\s+)?[^'";]*?from\s+['"](\.{1,2}\/[^'"]+)['"]|import\(\s*['"](\.{1,2}\/[^'"]+)['"]\s*\)/gm;
const PACKAGE =
  /^\s*(?:import|export)\s+(type\s+)?[^'";]*?from\s+['"]([^.'"][^'"]*)['"]|import\(\s*['"]([^.'"][^'"]*)['"]\s*\)|^\s*import\s+['"]([^.'"][^'"]*)['"]/gm;

/** The folder of the Figma builder: bundled into scripts that run inside Figma, not in Node. */
export const FIGMA_CLIENT = 'client/figma/';

const toPosix = (path: string): string => path.split(sep).join(posix.sep);

export function listFiles(root: string, dir: string): string[] {
  const start = join(root, dir);
  if (!existsSync(start)) return [];
  const found: string[] = [];
  const walk = (folder: string): void => {
    for (const name of readdirSync(folder)) {
      const full = join(folder, name);
      if (statSync(full).isDirectory()) walk(full);
      else found.push(toPosix(relative(root, full)));
    }
  };
  walk(start);
  return found.sort();
}

/** The imports of one file's text, as `SourceFile` keeps them. */
export function readImports(root: string, path: string, text: string): SourceFile {
  const seen = new Map<string, boolean>();
  const imports = [...text.matchAll(IMPORT)].map((match) => {
    const target = toPosix(
      relative(root, resolve(root, dirname(path), match[2] ?? match[3] ?? '')),
    );
    const typeOnly = match[1] !== undefined;
    seen.set(target, (seen.get(target) ?? true) && typeOnly);
    return target;
  });
  const types = [...seen].flatMap(([target, typeOnly]) => (typeOnly ? [target] : []));
  const packages = [...text.matchAll(PACKAGE)].flatMap((match) =>
    match[1] === undefined ? [match[2] ?? match[3] ?? match[4] ?? ''] : [],
  );
  return { path, imports, types, packages };
}

/** Every `.ts` file under `dir` (src/ by default) with its imports. */
export function collectSources(root: string, dir = 'src'): SourceFile[] {
  return listFiles(root, dir)
    .filter((path) => path.endsWith('.ts'))
    .map((path) => readImports(root, path, readFileSync(join(root, path), 'utf8')));
}

function describe(path: string) {
  const segments = path.split('/');
  const module = segments[1] ?? '';
  const second = segments[2] ?? '';
  return {
    module,
    layer: LAYERS.includes(second) ? second : undefined,
    isIndex: segments.length === 3 && second === 'index.ts',
  };
}

export function violations(files: SourceFile[]): string[] {
  const found: string[] = [];
  for (const file of files) {
    if (!file.path.startsWith('src/') || file.path === 'src/main.ts') continue;
    const from = describe(file.path);
    for (const target of file.imports) {
      if (!target.startsWith('src/')) continue;
      const to = describe(target);
      const where = `${file.path} -> ${target}`;
      if (target === 'src/main.ts') {
        found.push(`${where}: nothing imports main.ts`);
        continue;
      }
      if (from.module === 'shared' && to.module !== 'shared') {
        found.push(`${where}: shared imports nothing outside shared`);
      }
      if (to.module === 'cli' && from.module !== 'cli') {
        found.push(`${where}: only main.ts imports cli`);
      }
      if (to.layer === 'adapters' && !(from.module === to.module && from.layer === 'adapters')) {
        found.push(`${where}: only main.ts imports adapters`);
      }
      if (from.module !== to.module && to.module !== 'shared' && !to.isIndex) {
        found.push(`${where}: import another module through its index.ts`);
      }
      const ownDomain = to.module === from.module && to.layer === 'domain';
      // Types of another module, from its index.ts: erased at run time, so the domain stays pure.
      const typesOnly = to.isIndex && (file.types ?? []).includes(target);
      if (from.layer === 'domain' && to.module !== 'shared' && !ownDomain && !typesOnly) {
        found.push(`${where}: domain imports only its own domain and shared`);
      }
      const ownInner = to.module === from.module && to.layer !== 'adapters';
      if (from.layer === 'app' && to.module !== 'shared' && !ownInner && !to.isIndex) {
        found.push(`${where}: app imports its own domain, ports and app, and other modules' index`);
      }
    }
  }
  return found;
}

/**
 * The Figma builder runs inside Figma as one bundled script: it imports only its own folder, and no
 * package or Node built-in (a type-only import is erased, so it may name one).
 */
export function figmaClientViolations(files: SourceFile[]): string[] {
  const found: string[] = [];
  for (const file of files) {
    if (!file.path.startsWith(FIGMA_CLIENT)) continue;
    for (const target of file.imports) {
      if (!target.startsWith(FIGMA_CLIENT)) {
        found.push(`${file.path} -> ${target}: client/figma imports only client/figma`);
      }
    }
    for (const name of file.packages ?? []) {
      found.push(`${file.path} -> ${name}: client/figma imports no package`);
    }
  }
  return found;
}

/** A module's own `index.ts`: it gathers the whole module, packages and Node built-ins too. */
export const MODULE_INDEX = /^src\/[^/]+\/index\.ts$/;

const CLIENT_RULE = 'a client file imports values only from package-free src files (ADR 0080)';

/** The imports of `file` that bring code: every one but those that are only ever types. */
export function valueImports(file: SourceFile): string[] {
  const types = new Set(file.types ?? []);
  return [...new Set(file.imports)].filter((target) => !types.has(target));
}

/** Why `path` does not belong in a browser bundle on its own; `null` when nothing is wrong. */
function impurity(path: string, file: SourceFile | undefined): string | null {
  if (MODULE_INDEX.test(path)) return 'is the index.ts of a module';
  if (file === undefined) return 'is no .ts file the guard reads';
  const name = file.packages?.[0];
  return name === undefined ? null : `imports ${name}`;
}

/**
 * ADR 0080: a file under `client/` (but `client/figma/`, which has its own rule) imports values
 * from `src/` only where every file its value imports reach, one after another, imports no package
 * or Node built-in and is no module's `index.ts`. A type-only import is erased, so it may name any
 * file. One message per import that breaks it: the client file, the path, the first impure file.
 */
export function clientImportViolations(files: SourceFile[]): string[] {
  const byPath = new Map(files.map((file) => [file.path, file]));
  /** The path from `path` to the first impure file below it, `path` first; `null` for none. */
  const impurePath = (path: string, seen: Set<string>): string[] | null => {
    if (seen.has(path)) return null;
    seen.add(path);
    const file = byPath.get(path);
    if (file === undefined || impurity(path, file) !== null) return [path];
    for (const target of valueImports(file)) {
      const below = impurePath(target, seen);
      if (below !== null) return [path, ...below];
    }
    return null;
  };
  const found: string[] = [];
  for (const file of files) {
    if (!file.path.startsWith('client/') || file.path.startsWith(FIGMA_CLIENT)) continue;
    for (const target of valueImports(file)) {
      if (!target.startsWith('src/')) continue;
      const chain = impurePath(target, new Set());
      const last = chain?.at(-1);
      if (chain === null || last === undefined) continue;
      const why = impurity(last, byPath.get(last)) ?? '';
      found.push(`${[file.path, ...chain].join(' -> ')}: ${last} ${why}; ${CLIENT_RULE}`);
    }
  }
  return found;
}

/** Every `src/` file the value imports of `starts` reach, through any file on the way, sorted. */
export function valueReach(files: SourceFile[], starts: readonly string[]): string[] {
  const byPath = new Map(files.map((file) => [file.path, file]));
  const seen = new Set<string>();
  const stack = [...starts];
  for (let path = stack.pop(); path !== undefined; path = stack.pop()) {
    if (seen.has(path)) continue;
    seen.add(path);
    const file = byPath.get(path);
    if (file !== undefined) stack.push(...valueImports(file));
  }
  return [...seen].filter((path) => path.startsWith('src/')).sort();
}
