// One Tailwind build, run inside the worker process (tailwind-worker.ts) and spoken to over JSON.
// The compiler comes from the person's project, never from kitvas, and the major of the project's
// `tailwindcss` picks the build: 4 here, 3 in tailwind3-compile.ts, any other is refused.
// Tailwind 4 (docs/spikes/07-tailwind-v4.md): `compile(css, { base, onDependency })`, then
// `build(candidates)`. Its design system (`__unstable__loadDesignSystem`, when it exists) names the
// classes that produce nothing (`candidatesToCss`), the prefix and the `--breakpoint-*` screens;
// without it the classes come from the selectors in the output.

import { dirname } from 'node:path';
// One shared file at a time, not shared/index.ts: the worker process has no use for zod.
import { loadDep } from '../../shared/deps/deps.ts';
import { packageDirFrom } from '../../shared/env/packages.ts';
import { KitvasError } from '../../shared/errors/errors.ts';
import { isRecord } from '../../shared/values/guards.ts';
import { parseTailwindFile, type TailwindTheme } from '../../shared/values/tailwind-file.ts';
import { fileCandidates, looksLikeClass, probeRule, unbuiltClasses } from '../domain/candidates.ts';
import type { UtilityInput } from '../ports/utility-css.ts';
import {
  compileTailwind3,
  messageOf,
  packageVersion,
  readText,
  screenWidths,
} from './tailwind3-compile.ts';

/** Exactly what kitvas calls of `@tailwindcss/node` 4.3. */
type TailwindCompiler = { build(candidates: string[]): string };
type TailwindDesignSystem = {
  candidatesToCss(classes: string[]): (string | null)[];
  theme: { prefix: string | null; namespace(name: string): Map<string | null, string> };
};
type TailwindNode = {
  compile(
    css: string,
    options: { base: string; onDependency: (path: string) => void },
  ): Promise<TailwindCompiler>;
  __unstable__loadDesignSystem?: (
    css: string,
    options: { base: string },
  ) => Promise<TailwindDesignSystem>;
};

/** The worker's answer on stdout. `missing` names a package the project does not have. */
export type TailwindAnswer =
  | { ok: true; css: string; unknown: string[]; files: string[]; theme: TailwindTheme }
  | { ok: false; missing: string }
  | { ok: false; message: string };

const NODE_PACKAGE = '@tailwindcss/node';

const isStrings = (value: unknown): value is string[] =>
  Array.isArray(value) && value.every((item) => typeof item === 'string');

/** The request read from stdin, or `undefined` when it is not a `UtilityInput`. */
export function parseRequest(text: string): UtilityInput | undefined {
  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch {
    return undefined;
  }
  if (!isRecord(raw)) return undefined;
  const { project, entry, sources, probe } = raw;
  if (typeof project !== 'string' || typeof entry !== 'string') return undefined;
  if (!isStrings(sources) || !isStrings(probe)) return undefined;
  return { project, entry, sources, probe };
}

/** The answer read from the worker's stdout, or `undefined` when it is not one. */
export function parseAnswer(text: string): TailwindAnswer | undefined {
  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch {
    return undefined;
  }
  if (!isRecord(raw)) return undefined;
  if (raw.ok === true) {
    const { css, files } = raw;
    // The classes and the theme are what the Tailwind file keeps: read them the way it is read.
    const facts = parseTailwindFile({ schemaVersion: 2, unknown: raw.unknown, theme: raw.theme });
    if (typeof css !== 'string' || !isStrings(files) || !facts?.theme) return undefined;
    return { ok: true, css, unknown: facts.unknown, files, theme: facts.theme };
  }
  if (raw.ok !== false) return undefined;
  if (typeof raw.missing === 'string') return { ok: false, missing: raw.missing };
  return typeof raw.message === 'string' ? { ok: false, message: raw.message } : undefined;
}

type Loaded = { tailwind: TailwindNode } | { answer: TailwindAnswer };

/** `@import "tailwindcss"` resolves from the project: Tailwind 4 needs `@tailwindcss/node` there. */
async function loadNode(project: string): Promise<Loaded> {
  // A hoisted workspace keeps the package in a node_modules above the project.
  const nodeDir = packageDirFrom(project, NODE_PACKAGE);
  if (nodeDir === undefined) return { answer: { ok: false, missing: NODE_PACKAGE } };
  try {
    return {
      tailwind: await loadDep<TailwindNode>(NODE_PACKAGE, [dirname(dirname(dirname(nodeDir)))]),
    };
  } catch (cause) {
    if (cause instanceof KitvasError && cause.code === 'DEPS_MISSING') {
      return { answer: { ok: false, missing: NODE_PACKAGE } };
    }
    return { answer: { ok: false, message: messageOf(cause) } };
  }
}

function unknownOf(
  design: TailwindDesignSystem | undefined,
  candidates: string[],
  built: string,
): string[] {
  if (design === undefined) return unbuiltClasses(candidates, built);
  const list = candidates.filter(looksLikeClass);
  const produced = design.candidatesToCss(list);
  return list.filter((_, index) => (produced[index] ?? null) === null).sort();
}

/** The namespaces a token's page variable may stand behind, in the order an alias is taken. */
const ALIAS_NAMESPACES = [
  '--color',
  '--radius',
  '--spacing',
  '--text',
  '--font-weight',
  '--leading',
];
/** `var(--primary)`: one custom property, no fallback. */
const POINTER = /^var\((--[A-Za-z0-9_-]+)\)$/;

/**
 * For each page variable a theme variable only points at (`@theme inline { --color-primary:
 * var(--primary) }`), that theme variable: `--primary` → `--color-primary`. The first one wins.
 */
function aliasesOf(theme: TailwindDesignSystem['theme']): Record<string, string> {
  const aliases: Record<string, string> = {};
  for (const namespace of ALIAS_NAMESPACES) {
    for (const [key, value] of theme.namespace(namespace)) {
      const page = POINTER.exec(value)?.[1];
      if (page === undefined || aliases[page] !== undefined) continue;
      aliases[page] = key === null ? namespace : `${namespace}-${key}`;
    }
  }
  return aliases;
}

function themeOf(design: TailwindDesignSystem | undefined): TailwindTheme {
  if (design === undefined) return { version: 4, prefix: '', screens: {}, aliases: {} };
  const { prefix } = design.theme;
  return {
    version: 4,
    // A Tailwind 4 prefix is a variant in front of every class: `tw:hover:p-4`.
    prefix: prefix ? `${prefix}:` : '',
    screens: screenWidths(design.theme.namespace('--breakpoint')),
    aliases: aliasesOf(design.theme),
  };
}

async function compileTailwind4(input: UtilityInput): Promise<TailwindAnswer> {
  const loaded = await loadNode(input.project);
  if ('answer' in loaded) return loaded.answer;
  const { tailwind } = loaded;
  const text = readText(input.entry);
  if (text === undefined) return { ok: false, message: `Cannot read ${input.entry}.` };

  const css = `${text}\n${probeRule(input.probe)}`;
  const base = dirname(input.entry);
  const files = new Set<string>([input.entry]);
  try {
    const compiler = await tailwind.compile(css, {
      base,
      onDependency: (path) => {
        files.add(path);
      },
    });
    const candidates = fileCandidates(input.sources, readText);
    const built = compiler.build(candidates);
    const load = tailwind.__unstable__loadDesignSystem;
    const design = typeof load === 'function' ? await load(css, { base }) : undefined;
    return {
      ok: true,
      css: built,
      unknown: unknownOf(design, candidates, built),
      files: [...files],
      theme: themeOf(design),
    };
  } catch (cause) {
    return { ok: false, message: messageOf(cause) };
  }
}

export async function compileTailwind(input: UtilityInput): Promise<TailwindAnswer> {
  // A hoisted workspace keeps the package in a node_modules above the project.
  const tailwindDir = packageDirFrom(input.project, 'tailwindcss');
  if (tailwindDir === undefined) return { ok: false, missing: 'tailwindcss' };
  const version = packageVersion(tailwindDir);
  const major = version === undefined ? undefined : /^(\d+)\./.exec(version)?.[1];
  if (major === '4') return compileTailwind4(input);
  if (major === '3') return compileTailwind3(input, tailwindDir);
  const which = version ?? 'of an unknown version';
  const message = `Tailwind CSS ${which} is not supported: kitvas builds with Tailwind 3 or 4.`;
  return { ok: false, message };
}
