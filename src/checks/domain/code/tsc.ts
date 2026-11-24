// The types check: the tsconfig kitvas writes for a draft, and what tsc prints.

import { posix } from 'node:path';
import { type RawFinding, toolText } from '../findings/finding.ts';
import type { IdEntry } from './ids.ts';

export type TypesConfigInput = {
  /** Absolute path of the draft's src/tsx/index.tsx. */
  entry: string;
  /** Absolute path of the kit's entry file. */
  kitEntry: string;
  /** Absolute folder of the @types/react package. */
  reactTypes: string;
  /** Absolute path of `client/types/assets.d.ts`: style and asset imports as modules. */
  assets: string;
  /** A project's `compilerOptions.paths` with absolute targets (`projectPaths`). */
  paths?: Record<string, string[]>;
};

/** Names kitvas points at its own files; a project's entries for them are dropped. */
const OWN_NAMES = /^(?:@kit|react)(?:\/|$)/;

/** Only the entry and the asset types are listed; the sections and the kit come in by imports. */
export function typesConfig({ entry, kitEntry, reactTypes, assets, paths = {} }: TypesConfigInput) {
  const react = (file: string): string[] => [`${reactTypes}/${file}`];
  const project = Object.entries(paths).filter(([name]) => !OWN_NAMES.test(name));
  return {
    compilerOptions: {
      noEmit: true,
      strict: true,
      target: 'ES2024',
      lib: ['ES2024', 'DOM', 'DOM.Iterable'],
      module: 'preserve',
      moduleResolution: 'bundler',
      jsx: 'react-jsx',
      allowImportingTsExtensions: true,
      resolveJsonModule: true,
      skipLibCheck: true,
      // Style sheets imported for their effect are the bundler's business, not tsc's.
      noUncheckedSideEffectImports: false,
      types: [],
      paths: {
        // The project's first, so `@/lib/utils` in its components resolves as in the project.
        ...Object.fromEntries(project),
        '@kit': [kitEntry],
        react: react('index.d.ts'),
        'react/jsx-runtime': react('jsx-runtime.d.ts'),
        'react/jsx-dev-runtime': react('jsx-dev-runtime.d.ts'),
      },
    },
    files: [entry, assets],
  };
}

/** Reads a file; `undefined` when it is missing or cannot be read. */
export type ReadText = (file: string) => string | undefined;

/** How many `extends` hops `projectPaths` follows from the project's tsconfig.json. */
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

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !isList(value);

/** A path written in a config, absolute against `dir`, with forward slashes. */
function absolute(dir: string, path: string): string {
  const slashed = path.split('\\').join('/');
  return ABSOLUTE.test(slashed) ? posix.normalize(slashed) : posix.join(dir, slashed);
}

type FoundPaths = {
  /** `compilerOptions.paths` of the nearest config that has them, and that config's folder. */
  paths?: { entries: [string, string[]][]; dir: string };
  /** The absolute `baseUrl` of the nearest config that sets one. */
  baseUrl?: string;
};

const pathEntries = (paths: Record<string, unknown>): [string, string[]][] =>
  Object.entries(paths).flatMap(([name, targets]): [string, string[]][] => {
    const list = isList(targets)
      ? targets.filter((target): target is string => typeof target === 'string')
      : [];
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

function findPaths(path: string, read: ReadText, hops: number): FoundPaths {
  const config = readConfig(path, read);
  const json = config?.json;
  if (!config || !isRecord(json)) return {};
  const dir = posix.dirname(config.file);

  let found: FoundPaths = {};
  const parents = isList(json.extends) ? json.extends : [json.extends];
  // Later parents win over earlier ones, the file itself over all of them. A package such as
  // `@tsconfig/strictest` is not followed: it holds no paths into the project.
  for (const parent of hops < MAX_EXTENDS ? parents : []) {
    if (typeof parent !== 'string') continue;
    const relative = parent.split('\\').join('/');
    if (!RELATIVE.test(relative)) continue;
    found = { ...found, ...findPaths(absolute(dir, relative), read, hops + 1) };
  }
  const options: Record<string, unknown> = isRecord(json.compilerOptions)
    ? json.compilerOptions
    : {};
  if (typeof options.baseUrl === 'string') found.baseUrl = absolute(dir, options.baseUrl);
  if (isRecord(options.paths)) found.paths = { entries: pathEntries(options.paths), dir };
  return found;
}

/**
 * `compilerOptions.paths` of a project's tsconfig.json with absolute targets, so the project's own
 * files (`import { cn } from "@/lib/utils"`) resolve in the types check as in the project. Relative
 * `extends` are followed up to three hops. Targets resolve as tsc resolves them: against the
 * nearest `baseUrl`, else against the folder of the config that holds the paths. A missing or
 * broken config gives none. `configFile` is absolute with forward slashes.
 */
export function projectPaths(configFile: string, read: ReadText): Record<string, string[]> {
  const { paths, baseUrl } = findPaths(configFile, read, 0);
  if (!paths) return {};
  const base = baseUrl ?? paths.dir;
  return Object.fromEntries(
    paths.entries.map(([name, targets]) => [name, targets.map((target) => absolute(base, target))]),
  );
}

export type ToolMessage = {
  /** As tsc prints it, relative to where it ran, with forward slashes. */
  file: string | null;
  line: number;
  column: number;
  /** `TS2322`. */
  code: string;
  text: string;
};

const AT_FILE = /^(.+?)\((\d+),(\d+)\): error (TS\d+): (.*)$/;
const GLOBAL = /^error (TS\d+): (.*)$/;

/** The errors of `tsc --pretty false`. Indented lines continue the message above them. */
export function parseTscOutput(output: string): ToolMessage[] {
  const messages: ToolMessage[] = [];
  for (const line of output.split(/\r?\n/)) {
    const located = AT_FILE.exec(line);
    if (located) {
      messages.push({
        file: (located[1] ?? '').split('\\').join('/'),
        line: Number(located[2]),
        column: Number(located[3]),
        code: located[4] ?? '',
        text: located[5] ?? '',
      });
      continue;
    }
    const global = GLOBAL.exec(line);
    if (global) {
      messages.push({
        file: null,
        line: 0,
        column: 0,
        code: global[1] ?? '',
        text: global[2] ?? '',
      });
      continue;
    }
    const last = messages.at(-1);
    if (last && /^\s+\S/.test(line)) last.text += `\n${line.trim()}`;
  }
  return messages;
}

/** The element that starts nearest before a place in a file: the one a message there is about. */
export function elementAt(
  ids: IdEntry[],
  file: string,
  line: number,
  column: number,
): string | null {
  let best: IdEntry | undefined;
  for (const entry of ids) {
    if (entry.file !== file) continue;
    const before = entry.line < line || (entry.line === line && entry.column <= column);
    if (!before) continue;
    const later =
      !best || entry.line > best.line || (entry.line === best.line && entry.column > best.column);
    if (later) best = entry;
  }
  return best?.id ?? null;
}

const inDraft = (message: ToolMessage): boolean => message.file?.startsWith('src/') === true;

/**
 * `onlyDraft` is for project kits: messages inside the kit's or the project's files are left to
 * `kit verify`, so only the draft's own messages and those without a file are kept.
 */
export function typeFindings(
  messages: ToolMessage[],
  ids: IdEntry[],
  options: { onlyDraft?: boolean } = {},
): RawFinding[] {
  const kept = options.onlyDraft
    ? messages.filter((message) => message.file === null || inDraft(message))
    : messages;
  return kept.map((message) => {
    const own = inDraft(message);
    return {
      check: 'types',
      rule: `types/${message.code}`,
      severity: own ? 'fix' : 'review',
      file: message.file,
      line: message.line,
      column: message.column,
      element:
        own && message.file ? elementAt(ids, message.file, message.line, message.column) : null,
      message: toolText(message.text),
      hint: { key: 'checkHint.types', params: {} },
      states: [],
      widths: [],
    };
  });
}
