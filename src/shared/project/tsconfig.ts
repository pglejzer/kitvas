// A project's tsconfig.json or jsconfig.json, as far as kitvas follows it: where imports resolve
// and which files the type check takes in. tsc and esbuild read the rest of the file themselves.

import { posix } from 'node:path';
import { isRecord } from '../values/guards.ts';

/** Reads a file; `undefined` when it is missing or cannot be read. */
export type ReadText = (file: string) => string | undefined;

/** How many `extends` hops are followed from the project's config. */
const MAX_EXTENDS = 3;
const ABSOLUTE = /^(?:[A-Za-z]:)?\//;
const RELATIVE = /^\.\.?\//;

/** The index just past the JSON string that opens at `start`. */
function stringEnd(text: string, start: number): number {
  let index = start + 1;
  while (index < text.length && text.charAt(index) !== '"') {
    index += text.charAt(index) === '\\' ? 2 : 1;
  }
  return Math.min(index + 1, text.length);
}

/** JSON with comments and trailing commas, as tsconfig.json allows, made plain JSON. */
export function stripJsonc(text: string): string {
  const source = text.replace(/^\uFEFF/, '');
  let plain = '';
  let index = 0;
  while (index < source.length) {
    if (source.charAt(index) === '"') {
      const end = stringEnd(source, index);
      plain += source.slice(index, end);
      index = end;
    } else if (source.startsWith('//', index)) {
      const end = source.indexOf('\n', index);
      index = end === -1 ? source.length : end;
    } else if (source.startsWith('/*', index)) {
      const end = source.indexOf('*/', index + 2);
      index = end === -1 ? source.length : end + 2;
      plain += ' ';
    } else {
      plain += source.charAt(index);
      index += 1;
    }
  }

  // Comments are gone, so only spaces can stand between a trailing comma and its bracket.
  const closing = /\s*[}\]]/y;
  let json = '';
  index = 0;
  while (index < plain.length) {
    const char = plain.charAt(index);
    if (char === '"') {
      const end = stringEnd(plain, index);
      json += plain.slice(index, end);
      index = end;
      continue;
    }
    closing.lastIndex = index + 1;
    if (char !== ',' || !closing.test(plain)) json += char;
    index += 1;
  }
  return json;
}

function parseJsonc(text: string): unknown {
  try {
    const parsed: unknown = JSON.parse(stripJsonc(text));
    return parsed;
  } catch {
    return undefined;
  }
}

const isList = (value: unknown): value is unknown[] => Array.isArray(value);

const strings = (value: unknown): string[] | undefined =>
  isList(value) ? value.filter((item): item is string => typeof item === 'string') : undefined;

/** A path written in a config, absolute against `dir`, with forward slashes. */
function absolute(dir: string, path: string): string {
  const slashed = path.split('\\').join('/');
  return ABSOLUTE.test(slashed) ? posix.normalize(slashed) : posix.join(dir, slashed);
}

type Found = {
  /** `compilerOptions.paths` of the nearest config that has them, and that config's folder. */
  paths?: { entries: [string, string[]][]; dir: string };
  /** The absolute `baseUrl` of the nearest config that sets one. */
  baseUrl?: string;
  /** Each as the nearest config that sets it has it, absolute. */
  include?: string[];
  files?: string[];
  exclude?: string[];
  outputs?: string[];
};

const pathEntries = (paths: Record<string, unknown>): [string, string[]][] =>
  Object.entries(paths).flatMap(([name, targets]): [string, string[]][] => {
    const list = strings(targets) ?? [];
    return list.length > 0 ? [[name, list]] : [];
  });

/** The config at `path`, or at `path.json` as tsc tries for an `extends` without the extension. */
function readConfig(path: string, read: ReadText): { file: string; json: unknown } | undefined {
  const text = read(path);
  if (text !== undefined) return { file: path, json: parseJsonc(text) };
  if (path.endsWith('.json')) return undefined;
  const file = `${path}.json`;
  const fallback = read(file);
  return fallback === undefined ? undefined : { file, json: parseJsonc(fallback) };
}

function find(path: string, read: ReadText, hops: number): Found {
  const config = readConfig(path, read);
  const json = config?.json;
  if (!config || !isRecord(json)) return {};
  const dir = posix.dirname(config.file);

  let found: Found = {};
  const parents = isList(json.extends) ? json.extends : [json.extends];
  // Later parents win over earlier ones, the file itself over all of them. A package such as
  // `@tsconfig/strictest` is not followed: it holds no paths into the project.
  for (const parent of hops < MAX_EXTENDS ? parents : []) {
    if (typeof parent !== 'string') continue;
    const relative = parent.split('\\').join('/');
    if (!RELATIVE.test(relative)) continue;
    found = { ...found, ...find(absolute(dir, relative), read, hops + 1) };
  }
  const options: Record<string, unknown> = isRecord(json.compilerOptions)
    ? json.compilerOptions
    : {};
  if (typeof options.baseUrl === 'string') found.baseUrl = absolute(dir, options.baseUrl);
  if (isRecord(options.paths)) found.paths = { entries: pathEntries(options.paths), dir };
  const outputs = [options.outDir, options.declarationDir].flatMap((folder) =>
    typeof folder === 'string' ? [absolute(dir, folder)] : [],
  );
  if (outputs.length > 0) found.outputs = outputs;
  for (const key of ['include', 'files', 'exclude'] as const) {
    const list = strings(json[key]);
    if (list !== undefined) found[key] = list.map((entry) => absolute(dir, entry));
  }
  return found;
}

export type ProjectTsconfig = {
  /** The absolute `baseUrl`: the folder an import without `./` starts from. */
  baseUrl: string | undefined;
  /** `compilerOptions.paths` with absolute targets. */
  paths: Record<string, string[]>;
  /** `include`, `files` and `exclude`, absolute; `undefined` for one the config does not set. */
  include: string[] | undefined;
  files: string[] | undefined;
  exclude: string[] | undefined;
  /** Folders the project's own build writes (`outDir`, `declarationDir`), absolute. */
  outputs: string[];
};

/**
 * The configs `configFile` names in `references`, absolute, in their order. A reference to a
 * folder stands for the tsconfig.json in it; one that is not there is left out. `extends` does not
 * hand references on, so only the file itself is read.
 */
export function tsconfigReferences(configFile: string, read: ReadText): string[] {
  const json = readConfig(configFile, read)?.json;
  if (!isRecord(json) || !isList(json.references)) return [];
  const dir = posix.dirname(configFile);
  return json.references.flatMap((reference) => {
    if (!isRecord(reference) || typeof reference.path !== 'string') return [];
    const path = absolute(dir, reference.path);
    return [path, `${path}/tsconfig.json`].filter((file) => read(file) !== undefined).slice(0, 1);
  });
}

/**
 * What a project's tsconfig.json says about imports and files. Relative `extends` are followed up
 * to three hops, and each setting is the nearest config's that has it. Targets of `paths` resolve
 * as tsc resolves them: against the nearest `baseUrl`, else against the folder of the config that
 * holds the paths. A missing or broken config says nothing. `configFile` is absolute with forward
 * slashes.
 */
export function readTsconfig(configFile: string, read: ReadText): ProjectTsconfig {
  const { paths, baseUrl, include, files, exclude, outputs = [] } = find(configFile, read, 0);
  const base = baseUrl ?? paths?.dir ?? '';
  return {
    baseUrl,
    paths: Object.fromEntries(
      (paths?.entries ?? []).map(([name, targets]) => [
        name,
        targets.map((target) => absolute(base, target)),
      ]),
    ),
    include,
    files,
    exclude,
    outputs,
  };
}
