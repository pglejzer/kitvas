// One Tailwind 3 build (3.0 to 3.4), run inside the worker process (tailwind-worker.ts) like the
// Tailwind 4 build of tailwind-compile.ts, which also uses the small helpers below. Everything
// comes from the person's project, never from kitvas: the `tailwindcss` PostCSS plugin, its
// `loadConfig` (3.3 on, for TypeScript and ESM configs) and `resolveConfig`, and the `postcss` and
// `postcss-import` Tailwind itself depends on, found from its own folder. The config is the
// project's, found as Tailwind finds it; kitvas replaces only `content`, with the candidates it
// found itself. Tailwind 3 has no design-system API: a class produced nothing when the CSS has no
// rule for it.

import { existsSync, readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
// One shared file at a time, not shared/index.ts: the worker process has no use for zod.
import { loadDep } from '../../shared/deps/deps.ts';
import { KitvasError } from '../../shared/errors/errors.ts';
import { isRecord } from '../../shared/values/guards.ts';
import type { TailwindTheme } from '../../shared/values/tailwind-file.ts';
import { fileCandidates, probeRule, unbuiltClasses } from '../domain/candidates.ts';
import type { UtilityInput } from '../ports/utility-css.ts';
import { realPath } from './real-path.ts';
import type { TailwindAnswer } from './tailwind-compile.ts';

type Config = Record<string, unknown>;

/** Exactly what kitvas calls of Tailwind 3 and of its PostCSS. */
type Plugin = (options?: Config) => unknown;
type LoadConfig = (file: string) => unknown;
type ResolveConfig = (config: Config) => unknown;
type PostcssMessage = { type?: unknown; file?: unknown };
type Processed = { css: string; messages: PostcssMessage[] };
type Postcss = (plugins: unknown[]) => {
  process(css: string, options: { from: string }): PromiseLike<Processed>;
};
type Tools = {
  tailwind: Plugin;
  resolveConfig: ResolveConfig;
  /** Absent before Tailwind 3.3. */
  loadConfig: LoadConfig | undefined;
  postcss: Postcss;
  atImport: Plugin;
};

/** The ends of the config files Tailwind 3.4 looks for in the project folder, in its order. */
const CONFIG_ENDS = ['js', 'cjs', 'mjs', 'ts', 'cts', 'mts'];
/** Configs only Tailwind's own `loadConfig` (3.3 on) reads; before it, Tailwind requires the file. */
const MODULE_CONFIG = /\.(?:ts|cts|mts|mjs)$/;
/** `@config "./tailwind.admin.js";`: the config a stylesheet names for itself. */
const CONFIG_LINE = /@config\s+(['"])([^'"\n]+)\1\s*;?/;
/** A length a media query reads: px, or rem and em at the browser's 16 px. */
const MIN_WIDTH = /^(\d+(?:\.\d+)?)(px|rem|em)$/;

export const readText = (file: string): string | undefined => {
  try {
    return readFileSync(file, 'utf8');
  } catch {
    return undefined;
  }
};

export const messageOf = (cause: unknown): string =>
  cause instanceof Error ? cause.message : String(cause);

/** The `version` in the package.json of the package folder `dir`, when there is one. */
export function packageVersion(dir: string): string | undefined {
  const text = readText(join(dir, 'package.json'));
  if (text === undefined) return undefined;
  try {
    const raw: unknown = JSON.parse(text);
    return isRecord(raw) && typeof raw.version === 'string' ? raw.version : undefined;
  } catch {
    return undefined;
  }
}

/** `700px`, `40rem` or `{ min: '700px' }` in px; a max, a raw query or a list is no plain screen. */
function minWidth(value: unknown): number | undefined {
  const text = isRecord(value) && Object.keys(value).length === 1 ? value.min : value;
  const match = typeof text === 'string' ? MIN_WIDTH.exec(text.trim()) : null;
  if (match === null) return undefined;
  const size = Number(match[1]);
  return match[2] === 'px' ? size : size * 16;
}

/** The plain min-width screens by name, in px (`TailwindTheme.screens`). */
export function screenWidths(
  entries: Iterable<readonly [string | null, unknown]>,
): Record<string, number> {
  const widths: Record<string, number> = {};
  for (const [name, value] of entries) {
    const width = minWidth(value);
    if (name !== null && width !== undefined) widths[name] = width;
  }
  return widths;
}

/** The package a `loadDep` could not find, or `undefined` for any other failure. */
const missingPackage = (cause: unknown): string | undefined =>
  cause instanceof KitvasError && cause.code === 'DEPS_MISSING'
    ? String(cause.params.name)
    : undefined;

/** What a CommonJS package sets as `module.exports`: `import()` gives it as `default`. */
async function exported<T>(name: string, root: string): Promise<T> {
  return (await loadDep<{ default: T }>(name, [root])).default;
}

async function loadTools(tailwindDir: string): Promise<Tools> {
  // The folder whose node_modules holds this Tailwind: its names resolve to this very package.
  const project = dirname(dirname(tailwindDir));
  // Tailwind's own dependencies, found from its real folder as Node finds them for Tailwind (pnpm
  // keeps them beside that folder, not in the project's node_modules).
  const own = realPath(tailwindDir);
  let loadConfig: LoadConfig | undefined;
  try {
    loadConfig = await exported<LoadConfig>('tailwindcss/loadConfig', project);
  } catch (cause) {
    if (missingPackage(cause) === undefined) throw cause;
  }
  return {
    tailwind: await exported<Plugin>('tailwindcss', project),
    resolveConfig: await exported<ResolveConfig>('tailwindcss/resolveConfig', project),
    loadConfig,
    postcss: await exported<Postcss>('postcss', own),
    atImport: await exported<Plugin>('postcss-import', own),
  };
}

/**
 * The entry without its `@config` line, and the config file: the one that line names, else the
 * project's `tailwind.config.*`, else none (Tailwind's defaults). Tailwind takes an `@config` line
 * over any config it is given, so the line must go.
 */
function findConfig(
  entry: string,
  text: string,
  project: string,
): { css: string; file: string | undefined } {
  const named = CONFIG_LINE.exec(text)?.[2];
  if (named !== undefined) {
    return { css: text.replace(CONFIG_LINE, ''), file: resolve(dirname(entry), named) };
  }
  const files = CONFIG_ENDS.map((end) => join(project, `tailwind.config.${end}`));
  return { css: text, file: files.find((file) => existsSync(file)) };
}

async function configModule(
  file: string,
  loadConfig: LoadConfig | undefined,
  version: string,
): Promise<unknown> {
  if (loadConfig !== undefined) return loadConfig(file);
  if (MODULE_CONFIG.test(file)) {
    throw new Error(
      `a config in TypeScript or ESM needs Tailwind CSS 3.3 or later; the project has ${version}.`,
    );
  }
  const loaded: unknown = await import(pathToFileURL(file).href);
  return isRecord(loaded) && loaded.default !== undefined ? loaded.default : loaded;
}

/** The project's config object; a file that does not load is an error that names it. */
async function readConfig(
  file: string | undefined,
  loadConfig: LoadConfig | undefined,
  version: string,
): Promise<Config> {
  if (file === undefined) return {};
  let raw: unknown;
  try {
    raw = await configModule(file, loadConfig, version);
  } catch (cause) {
    throw new Error(`Cannot load ${file}: ${messageOf(cause)}`);
  }
  if (!isRecord(raw)) throw new Error(`Cannot load ${file}: it exports no config object.`);
  return raw;
}

function themeOf(resolved: unknown): TailwindTheme {
  const config: Config = isRecord(resolved) ? resolved : {};
  const theme: Config = isRecord(config.theme) ? config.theme : {};
  const screens = isRecord(theme.screens) ? Object.entries(theme.screens) : [];
  return {
    version: 3,
    prefix: typeof config.prefix === 'string' ? config.prefix : '',
    screens: screenWidths(screens),
    // Tailwind 3 has no theme variables for a page variable to stand behind.
    aliases: {},
  };
}

/** The files PostCSS read besides the entry: what `postcss-import` put in. */
function dependencies(messages: PostcssMessage[]): string[] {
  const files: string[] = [];
  for (const { type, file } of messages) {
    if (type === 'dependency' && typeof file === 'string') files.push(file);
  }
  return files;
}

/** Runs `build` with Tailwind's console lines dropped: the worker's stdout is its answer only. */
async function quietly<T>(build: () => Promise<T>): Promise<T> {
  const { log, warn } = console;
  console.log = () => undefined;
  console.warn = () => undefined;
  try {
    return await build();
  } finally {
    console.log = log;
    console.warn = warn;
  }
}

/** `tailwindDir` is the folder of the project's `tailwindcss`, a 3.x one (`compileTailwind`). */
export async function compileTailwind3(
  input: UtilityInput,
  tailwindDir: string,
): Promise<TailwindAnswer> {
  const text = readText(input.entry);
  if (text === undefined) return { ok: false, message: `Cannot read ${input.entry}.` };
  let tools: Tools;
  try {
    tools = await loadTools(tailwindDir);
  } catch (cause) {
    const missing = missingPackage(cause);
    if (missing !== undefined) return { ok: false, missing };
    return { ok: false, message: messageOf(cause) };
  }
  const { css, file } = findConfig(input.entry, text, input.project);
  const version = packageVersion(tailwindDir) ?? '3';

  return quietly<TailwindAnswer>(async () => {
    try {
      const projectConfig = await readConfig(file, tools.loadConfig, version);
      const candidates = fileCandidates(input.sources, readText);
      // Only `content` is kitvas's: the candidates it found, as one file of text.
      const raw = candidates.join(' ');
      const config: Config = { ...projectConfig, content: [{ raw, extension: 'html' }] };
      const plugins = [tools.atImport(), tools.tailwind(config)];
      const source = `${css}\n${probeRule(input.probe)}`;
      const result = await tools.postcss(plugins).process(source, { from: input.entry });
      const read = file === undefined ? [input.entry] : [input.entry, file];
      return {
        ok: true,
        css: result.css,
        unknown: unbuiltClasses(candidates, result.css),
        files: [...new Set([...read, ...dependencies(result.messages)])],
        theme: themeOf(tools.resolveConfig(config)),
      };
    } catch (cause) {
      return { ok: false, message: messageOf(cause) };
    }
  });
}
