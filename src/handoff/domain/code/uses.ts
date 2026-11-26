// What a draft uses, counted from its own files (plan 22, goal B2): the components its ids name,
// each with the import that brings it in, and the kit variables its TSX and SCSS read. Pure: the
// text of the files comes in.

import type { IdsFile } from '../../../render/index.ts';

export type UseSource = { path: string; text: string };

const IMPORT = /\bimport\s+(?!type[\s{])([^'";]*?)\s*from\s*['"]([^'"]+)['"]/g;
const KIT_VAR = /var\(\s*(--kit-[A-Za-z0-9_-]+)/g;
const COMPONENT = /^[A-Z][A-Za-z0-9_$]*$/;

/** By code unit, so the order does not depend on a locale. */
function compare(a: string, b: string): number {
  if (a === b) return 0;
  return a < b ? -1 : 1;
}

/** The capitalised names an import clause brings in, as the file calls them. */
function importedNames(clause: string): string[] {
  const names: string[] = [];
  const open = clause.indexOf('{');
  const close = clause.indexOf('}');
  const braced = open >= 0 && close > open;
  const outside = braced ? `${clause.slice(0, open)} ${clause.slice(close + 1)}` : clause;
  for (const part of outside.split(',')) {
    const text = part.trim();
    if (text === '') continue;
    // `Default`, or `* as Namespace`.
    names.push(text.startsWith('*') ? (text.split(/\s+as\s+/)[1] ?? '') : text);
  }
  if (braced) {
    for (const part of clause.slice(open + 1, close).split(',')) {
      const text = part.trim();
      if (text === '' || /^type\s/.test(text)) continue;
      names.push(text.split(/\s+as\s+/).at(-1) ?? '');
    }
  }
  return names.filter((name) => COMPONENT.test(name));
}

/**
 * The capitalised tags of `ids.json`, counted, each joined with the module that brings it in. A
 * tag such as `Card.Header` counts for `Card`. A name no source imports is left out: it is not a
 * component of another module. Sorted by name.
 */
export function componentUses(input: {
  ids: IdsFile;
  sources: readonly UseSource[];
}): { name: string; from: string; uses: number }[] {
  const from = new Map<string, string>();
  for (const source of input.sources) {
    for (const found of source.text.matchAll(IMPORT)) {
      for (const name of importedNames(found[1] ?? '')) {
        if (!from.has(name)) from.set(name, found[2] ?? '');
      }
    }
  }
  const counts = new Map<string, number>();
  for (const entry of Object.values(input.ids.ids)) {
    const root = entry.tag.split('.')[0] ?? '';
    if (COMPONENT.test(root)) counts.set(root, (counts.get(root) ?? 0) + 1);
  }
  return [...counts]
    .flatMap(([name, uses]) => {
      const module = from.get(name);
      return module === undefined ? [] : [{ name, from: module, uses }];
    })
    .sort((a, b) => compare(a.name, b.name));
}

/** Every `var(--kit-…)` of the sources, counted once per place it is written. Sorted by name. */
export function tokenUsesOf(sources: readonly UseSource[]): { var: string; uses: number }[] {
  const counts = new Map<string, number>();
  for (const source of sources) {
    for (const found of source.text.matchAll(KIT_VAR)) {
      const name = found[1] ?? '';
      counts.set(name, (counts.get(name) ?? 0) + 1);
    }
  }
  return [...counts]
    .map(([name, uses]) => ({ var: name, uses }))
    .sort((a, b) => compare(a.var, b.var));
}
