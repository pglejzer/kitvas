// One Tailwind v4 build, run inside the worker process (tailwind-worker.ts) and spoken to over JSON.
// The compiler comes from the person's project, never from kitvas (docs/spikes/07-tailwind-v4.md):
// `compile(css, { base, onDependency })`, then `build(candidates)`; classes that produce nothing
// come from `__unstable__loadDesignSystem(...).candidatesToCss` when it exists, else from the
// selectors in the output.

import { readFileSync } from 'node:fs';
import { dirname } from 'node:path';
// One shared file at a time, not shared/index.ts: the worker process has no use for zod.
import { loadDep } from '../../shared/deps/deps.ts';
import { packageDirFrom } from '../../shared/env/packages.ts';
import { KitvasError } from '../../shared/errors/errors.ts';
import { isRecord } from '../../shared/values/guards.ts';
import { fileCandidates, hasClassRule, looksLikeClass, probeRule } from '../domain/candidates.ts';
import type { UtilityInput } from '../ports/utility-css.ts';

/** Exactly what kitvas calls of `@tailwindcss/node` 4.3. */
type TailwindCompiler = { build(candidates: string[]): string };
type TailwindDesignSystem = { candidatesToCss(classes: string[]): (string | null)[] };
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
  | { ok: true; css: string; unknown: string[]; files: string[] }
  | { ok: false; missing: string }
  | { ok: false; message: string };

const NODE_PACKAGE = '@tailwindcss/node';

const readText = (file: string): string | undefined => {
  try {
    return readFileSync(file, 'utf8');
  } catch {
    return undefined;
  }
};

const messageOf = (cause: unknown): string =>
  cause instanceof Error ? cause.message : String(cause);

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
    const classes = raw.unknown;
    if (typeof css !== 'string' || !isStrings(classes) || !isStrings(files)) return undefined;
    return { ok: true, css, unknown: classes, files };
  }
  if (raw.ok !== false) return undefined;
  if (typeof raw.missing === 'string') return { ok: false, missing: raw.missing };
  return typeof raw.message === 'string' ? { ok: false, message: raw.message } : undefined;
}

type Loaded = { tailwind: TailwindNode } | { answer: TailwindAnswer };

/** `@import "tailwindcss"` resolves from the project, so the project must have both packages. */
async function loadTailwind(project: string): Promise<Loaded> {
  // A hoisted workspace keeps both packages in a node_modules above the project.
  const tailwindDir = packageDirFrom(project, 'tailwindcss');
  if (tailwindDir === undefined) return { answer: { ok: false, missing: 'tailwindcss' } };
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

async function unknownOf(
  tailwind: TailwindNode,
  css: string,
  base: string,
  candidates: string[],
  built: string,
): Promise<string[]> {
  const list = candidates.filter(looksLikeClass);
  const load = tailwind.__unstable__loadDesignSystem;
  let produced: (string | null | undefined)[];
  if (typeof load === 'function') {
    const design = await load(css, { base });
    produced = design.candidatesToCss(list);
  } else {
    produced = list.map((candidate) => (hasClassRule(built, candidate) ? candidate : null));
  }
  return list.filter((_, index) => (produced[index] ?? null) === null).sort();
}

export async function compileTailwind(input: UtilityInput): Promise<TailwindAnswer> {
  const loaded = await loadTailwind(input.project);
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
    const unexplained = await unknownOf(tailwind, css, base, candidates, built);
    return { ok: true, css: built, unknown: unexplained, files: [...files] };
  } catch (cause) {
    return { ok: false, message: messageOf(cause) };
  }
}
