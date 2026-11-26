// The facts about a project that `kitvas handoff target` answers with. The types and the caps live
// here, and so does the builder (`targetFacts`). Nothing in the facts is derived from a table of
// frameworks: a name appears only when it is a file's or a package's own.

import { ignoredNames, isIgnoredPath } from './ignore.ts';
import { isProtectedPath, normalizeFolder } from './scope.ts';

/** Names at the top of the folder read; more than this sets `capped`. */
export const TARGET_ROOT_CAP = 200;
/** Files under the folder read; more than this sets `capped` and the listing is not taken. */
export const TARGET_FILE_CAP = 20_000;
/** A file larger than this (in bytes) is never read. */
export const TARGET_READ_MAX = 256 * 1024;
/** A style file that declares at least this many custom properties or SCSS variables is a token file. */
export const TOKEN_FILE_MIN = 8;

export type TargetFacts = {
  schemaVersion: 1;
  /** The folder read, relative to the project root; '' for the root. */
  base: string;
  /** Names at the top of `base`, folders with a trailing `/`, sorted. */
  root: string[];
  packages: {
    path: string;
    dependencies: Record<string, string>;
    scripts: Record<string, string>;
  }[];
  /** The 20 most common extensions under `base`, highest first. */
  extensions: { ext: string; count: number }[];
  /** The 15 folders with the most files of their own, with three sample files each. */
  folders: { path: string; files: number; samples: string[] }[];
  /** Style files that declare TOKEN_FILE_MIN or more custom properties or SCSS variables. */
  tokens: { path: string; declares: number }[];
  /** Rule and style-guide files at the root (`AGENTS.md`, `CLAUDE.md`, `CONTRIBUTING.md`, lint and format configs). */
  conventions: string[];
  git: boolean;
  /** True when a cap cut the root, the files or a read. */
  capped: boolean;
};

/** Style files whose declarations are counted. */
const STYLE_EXTENSIONS = ['.css', '.scss', '.sass', '.less', '.styl', '.pcss'];
/** Style files read at most; more sets `capped`. */
const STYLE_READ_MAX = 500;
const EXTENSIONS_MAX = 20;
const FOLDERS_MAX = 15;
const SAMPLES_MAX = 3;
const TOKENS_MAX = 20;

/** `--name:` and `$name:` declarations. */
const DECLARATION = /(?:^|[\s;{])(?:--[A-Za-z0-9_-]+|\$[A-Za-z0-9_-]+)\s*:/g;

/** Names of rule and style-guide files looked for at the project root when `base` is a folder below it. */
export const CONVENTION_NAMES: readonly string[] = [
  'AGENTS.md',
  'CLAUDE.md',
  'CONTRIBUTING.md',
  'STYLEGUIDE.md',
  '.editorconfig',
  '.cursorrules',
  '.prettierrc',
  '.prettierrc.json',
  '.eslintrc',
  '.eslintrc.json',
  '.eslintrc.js',
  '.eslintrc.cjs',
  '.stylelintrc',
  '.stylelintrc.json',
  'prettier.config.js',
  'eslint.config.js',
  'eslint.config.mjs',
  'eslint.config.ts',
  'stylelint.config.js',
  'biome.json',
  'biome.jsonc',
];

const CONVENTION = [
  /^(?:AGENTS|CLAUDE|CONTRIBUTING|STYLEGUIDE)\.md$/i,
  /^\.editorconfig$/,
  /^\.cursorrules$/,
  /^\.(?:prettier|eslint|stylelint)rc(?:\.[a-z]+)?$/,
  /^(?:prettier|eslint|stylelint)\.config\.[cm]?[jt]s$/,
  /^biome\.jsonc?$/,
];

/** True for a file name (no slash) that holds the project's rules or style guide. */
export const isConventionName = (name: string): boolean =>
  CONVENTION.some((rule) => rule.test(name));

/** What `targetFacts` is given: the files under `base`, as project paths, and a way to read one. */
export type TargetInput = {
  /** The folder read, relative to the project root; '' for the root. */
  base: string;
  /** Project paths of the files found under `base` (a path outside it is ignored). */
  files: readonly string[];
  /** The text of a project file; undefined when it is missing or unreadable. Never asked for a `.env*` file or a lockfile. */
  read(path: string): string | undefined;
  git: boolean;
  /** True when the walk that found `files` was cut by a cap. */
  capped: boolean;
  /** Names of files at the project root, outside `base`, that the rule files are taken from too. */
  rootFiles?: readonly string[];
};

const byText = (a: string, b: string): number => (a < b ? -1 : Number(a > b));

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

function extensionOf(path: string): string {
  const name = path.slice(path.lastIndexOf('/') + 1);
  const dot = name.lastIndexOf('.');
  return dot <= 0 ? '' : name.slice(dot).toLowerCase();
}

/** The string values of an object, keys sorted; anything else gives {}. */
function strings(value: unknown): Record<string, string> {
  if (!isRecord(value)) return {};
  const entries = Object.entries(value).filter(
    (entry): entry is [string, string] => typeof entry[1] === 'string',
  );
  return Object.fromEntries(entries.sort(([a], [b]) => byText(a, b)));
}

/** A `package.json` as data: its packages and scripts; undefined when it is not JSON or not an object. */
type PackageData = { dependencies: Record<string, string>; scripts: Record<string, string> };

function readPackage(text: string): PackageData | undefined {
  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch {
    return undefined;
  }
  if (!isRecord(raw)) return undefined;
  const merged = { ...strings(raw.dependencies), ...strings(raw.devDependencies) };
  return { dependencies: strings(merged), scripts: strings(raw.scripts) };
}

/** The facts of one folder of a project, from the list of its files and a way to read a few. */
export function targetFacts(input: TargetInput): TargetFacts {
  const base = normalizeFolder(input.base);
  const prefix = base === '' ? '' : `${base}/`;
  const relOf = (path: string): string => path.slice(prefix.length);
  let capped = input.capped;

  /** A read that keeps to the caps and never asks for a protected file. */
  const readText = (path: string): string | undefined => {
    if (isProtectedPath(path)) return undefined;
    const text = input.read(path);
    if (text === undefined) return undefined;
    if (text.length > TARGET_READ_MAX) {
      capped = true;
      return undefined;
    }
    return text;
  };

  const gitignores = ['.gitignore', ...(base === '' ? [] : [`${prefix}.gitignore`])];
  const names = ignoredNames(gitignores.map((path) => readText(path) ?? '').join('\n'));

  let visible = input.files
    .filter(
      (path) =>
        path.startsWith(prefix) && !isProtectedPath(path) && !isIgnoredPath(relOf(path), names),
    )
    .sort(byText);
  if (visible.length > TARGET_FILE_CAP) {
    visible = visible.slice(0, TARGET_FILE_CAP);
    capped = true;
  }

  const top = new Set<string>();
  for (const path of visible) {
    const rel = relOf(path);
    const slash = rel.indexOf('/');
    top.add(slash === -1 ? rel : `${rel.slice(0, slash)}/`);
  }
  let root = [...top].sort(byText);
  if (root.length > TARGET_ROOT_CAP) {
    root = root.slice(0, TARGET_ROOT_CAP);
    capped = true;
  }

  const packages: TargetFacts['packages'] = [];
  for (const path of visible.filter((file) => /^(?:[^/]+\/)?package\.json$/.test(relOf(file)))) {
    const text = readText(path);
    const parsed = text === undefined ? undefined : readPackage(text);
    if (parsed) packages.push({ path, ...parsed });
  }

  const counts = new Map<string, number>();
  for (const path of visible) {
    const ext = extensionOf(path);
    if (ext !== '') counts.set(ext, (counts.get(ext) ?? 0) + 1);
  }
  const extensions = [...counts]
    .map(([ext, count]) => ({ ext, count }))
    .sort((a, b) => b.count - a.count || byText(a.ext, b.ext))
    .slice(0, EXTENSIONS_MAX);

  const own = new Map<string, string[]>();
  for (const path of visible) {
    if (!relOf(path).includes('/')) continue;
    const folder = path.slice(0, path.lastIndexOf('/'));
    own.set(folder, [...(own.get(folder) ?? []), path]);
  }
  const folders = [...own]
    .map(([path, list]) => ({ path, files: list.length, samples: list.slice(0, SAMPLES_MAX) }))
    .sort((a, b) => b.files - a.files || byText(a.path, b.path))
    .slice(0, FOLDERS_MAX);

  let styles = visible.filter((path) => STYLE_EXTENSIONS.includes(extensionOf(path)));
  if (styles.length > STYLE_READ_MAX) {
    styles = styles.slice(0, STYLE_READ_MAX);
    capped = true;
  }
  const tokens: TargetFacts['tokens'] = [];
  for (const path of styles) {
    const declares = readText(path)?.match(DECLARATION)?.length ?? 0;
    if (declares >= TOKEN_FILE_MIN) tokens.push({ path, declares });
  }
  tokens.sort((a, b) => b.declares - a.declares || byText(a.path, b.path));

  const conventions = new Set<string>(
    visible.filter((path) => !relOf(path).includes('/') && isConventionName(relOf(path))),
  );
  for (const name of input.rootFiles ?? []) {
    if (!name.includes('/') && isConventionName(name)) conventions.add(name);
  }

  return {
    schemaVersion: 1,
    base,
    root,
    packages,
    extensions,
    folders,
    tokens: tokens.slice(0, TOKENS_MAX),
    conventions: [...conventions].sort(byText),
    git: input.git,
    capped,
  };
}
