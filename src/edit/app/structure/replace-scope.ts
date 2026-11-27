// What a source needs of the file it replaces an element in (spec 4d, goal 5; plan 17, task D):
// the names it reads that the file does not have, and the kit components the file must import.
// `replaceElement` asks it when the paste rule (`checkPaste`: kit components, HTML tags and
// literals only) refuses a source, and Bring back shows the same answer before anything is sent,
// so the diff and the edit never disagree.
//
// A name is there when the replaced element reads it itself, when the file binds it (an import, a
// declaration, a parameter, a destructured name), or when it is a global of the language. This is
// by file, not by scope: a name bound in another function of the file passes. There is no parser
// here; the two questions are put to the readers the editor already trusts.

import { elementSpan, freeIdentifiers, wholeElement } from '../../domain/structure/subtree.ts';
import { syncKitImports } from '../../domain/tsx/kit-imports.ts';

/** `missing`: names the file lacks. `imports`: kit components the kit import will gain. */
export type ReplaceNeeds = { missing: string[]; imports: string[] };

/** A name no draft would use: read in the probe to tell that the probe itself was read. */
const SENTINEL = '__kitvas_scope_probe__';

/** Names every page has without an import. */
const GLOBALS: ReadonlySet<string> = new Set([
  ...'Array Boolean Date Error Infinity Intl JSON Map Math NaN Number Object Promise'.split(' '),
  ...'RegExp Set String Symbol console document globalThis isFinite isNaN navigator'.split(' '),
  ...'parseFloat parseInt window location encodeURIComponent decodeURIComponent'.split(' '),
]);

/**
 * Whether the file neither binds `name` at its top (an import from anywhere, a declaration) nor
 * imports it from the kit. Asked of the kit import's own reader: with one use of the name added,
 * it would write an import for it exactly then.
 */
function unimported(text: string, name: string): boolean {
  const probe = `${text}\n;(${name});`;
  return syncKitImports(probe, new Set([name])).text !== probe;
}

/**
 * The names of `names` some function, parameter list or declaration of the file binds. Asked of
 * `freeIdentifiers`: the file is read as the body of one function that also reads the names, and
 * a name that does not come out free is bound somewhere in it. When the reader cannot read the
 * file, the sentinel is missing and no name counts as bound.
 */
function boundInFile(text: string, names: readonly string[]): Set<string> {
  const probe = `{[${[SENTINEL, ...names].join(', ')}, (() => {\n${text}\n})]}`;
  const free = new Set(freeIdentifiers(probe, { start: 0, end: probe.length }));
  if (!free.has(SENTINEL)) return new Set();
  return new Set(names.filter((name) => !free.has(name)));
}

/**
 * What `source` (one element or fragment, as JSX) needs to stand in the place of the element at
 * `target.at` of `target.text`; `null` when the source is not one element. A kit component the
 * file does not import yet is in `imports` (the kit import follows use, spec 4b decision 8);
 * every other name the file does not have is in `missing`. Both sorted, each name once.
 */
export function replaceNeeds(
  source: string,
  kitNames: ReadonlySet<string>,
  target: { text: string; at: number },
): ReplaceNeeds | null {
  const span = wholeElement(source);
  if (span === null) return null;
  const read = freeIdentifiers(source, span);
  const there = elementSpan(target.text, target.at);
  const here = new Set(there === null ? [] : freeIdentifiers(target.text, there));
  const open = read.filter((name) => !GLOBALS.has(name) && unimported(target.text, name));
  const bound = boundInFile(target.text, open);
  const needs: ReplaceNeeds = { missing: [], imports: [] };
  for (const name of open) {
    if (bound.has(name)) continue;
    if (kitNames.has(name)) needs.imports.push(name);
    // What the replaced element reads itself is in scope at its place, whatever binds it.
    else if (!here.has(name)) needs.missing.push(name);
  }
  return needs;
}
