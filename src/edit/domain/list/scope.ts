// Which declaration a name in a data list's `.map` receiver reads (spec 4c, goal 9; plan 16,
// task D): an import, a parameter, or a `const` with an array literal. The nearest one in scope
// wins, as in JavaScript, so a parameter that shadows a module `const` is the parameter. Pure:
// it walks the tokens of the regions `list-path.ts` found, and never guesses past what it reads.

import type { Span } from '../types.ts';
import {
  arrowParams,
  charAt,
  closeOf,
  closes,
  enclosingOf,
  isArrow,
  opens,
  type Params,
  type Reader,
  type Region,
  spanOf,
  wordAt,
} from './path.ts';

/** What a name is bound to where it is read. */
export type Binding =
  | { kind: 'import' }
  /** `nested`: the function is inside another one (a callback), so its value is no prop. */
  | { kind: 'param'; nested: boolean }
  /** `array`: the token of the `[` that starts its value, when that is an array literal. */
  | { kind: 'const'; reader: Reader; array: number | null }
  | { kind: 'other' };

/** A name a pattern binds: `key` is the property it reads inside a top-level `{…}` pattern. */
export type Bound = { name: string; key: string | null; param: number; depth: number };

type Declared = { binding: Binding; scope: Span; at: number };
type Fn = { span: Span; params: Params };

/**
 * The names a parameter list or a destructuring pattern binds, in the tokens `[from, to)`. Types
 * after a top-level `:` and default values after `=` bind nothing.
 */
export function patternNames(reader: Reader, from: number, to: number): Bound[] {
  const out: Bound[] = [];
  const stack: string[] = [];
  let param = 0;
  /** At or above 0: inside a type or a default value, this many brackets deep. */
  let skip = -1;
  let key: string | null = null;
  for (let k = from; k < to; k += 1) {
    const char = charAt(reader, k);
    if (skip >= 0) {
      if (opens(char)) {
        skip += 1;
        continue;
      }
      if (closes(char) && skip > 0) {
        skip -= 1;
        continue;
      }
      if (!closes(char) && !(char === ',' && skip === 0)) continue;
      // The comma or the closer that ends the type or the default is read below.
      skip = -1;
    }
    if (char === '{' || char === '[') {
      stack.push(char);
      key = null;
    } else if (closes(char)) {
      stack.pop();
    } else if (char === ',') {
      if (stack.length === 0) param += 1;
      key = null;
    } else if (char === ':') {
      if (stack.length === 0) skip = 0;
    } else if (char === '=' && !isArrow(reader, k)) {
      skip = 0;
    } else {
      const word = wordAt(reader, k);
      if (word === '') continue;
      if (stack.at(-1) === '{' && charAt(reader, k + 1) === ':') {
        key = word;
        continue;
      }
      const top = stack.length === 1 && stack[0] === '{';
      out.push({ name: word, key: top ? (key ?? word) : null, param, depth: stack.length });
      key = null;
    }
  }
  return out;
}

/** The index of the `=` that ends a type annotation starting at `from`; `-1` when none does. */
function typeEnd(reader: Reader, from: number): number {
  let depth = 0;
  for (let k = from; k < reader.tokens.length; k += 1) {
    const char = charAt(reader, k);
    if (isArrow(reader, k)) {
      k += 1;
      continue;
    }
    if (opens(char)) depth += 1;
    else if (closes(char)) depth -= 1;
    if (depth < 0 || char === ';') return -1;
    if (depth === 0 && char === '=') return k;
  }
  return -1;
}

/** The block `{…}` around token `k`, or the whole region at the top. */
function blockOf(reader: Reader, k: number, region: Span): Span {
  for (let open = enclosingOf(reader, k); open >= 0; open = enclosingOf(reader, open)) {
    if (charAt(reader, open) !== '{') continue;
    const close = closeOf(reader, open);
    return close < 0 ? region : spanOf(reader, open, close);
  }
  return region;
}

/** The last token of an arrow's body, which starts at token `from`. */
function arrowBodyEnd(reader: Reader, from: number): number {
  const char = charAt(reader, from);
  if (char === '{' || char === '(') return closeOf(reader, from);
  if (reader.tokens[from]?.kind === 'jsx') return from;
  let depth = 0;
  for (let k = from; k < reader.tokens.length; k += 1) {
    const at = charAt(reader, k);
    if (opens(at)) depth += 1;
    else if (closes(at)) depth -= 1;
    if (depth < 0 || (depth === 0 && (at === ',' || at === ';'))) return k - 1;
  }
  return reader.tokens.length - 1;
}

/** The `function` at token `k`, named or not, with a block body. */
function namedFunction(reader: Reader, k: number): Fn | null {
  const paren = charAt(reader, k + 1) === '(' ? k + 1 : k + 2;
  if (charAt(reader, paren) !== '(') return null;
  const close = closeOf(reader, paren);
  if (close < 0 || charAt(reader, close + 1) !== '{') return null;
  const body = closeOf(reader, close + 1);
  if (body < 0) return null;
  return { span: spanOf(reader, k, body), params: { from: paren + 1, to: close } };
}

/** The arrow whose `=>` starts at token `k`. */
function arrowFunction(reader: Reader, k: number): Fn | null {
  const made = arrowParams(reader, k);
  const end = made === null ? -1 : arrowBodyEnd(reader, k + 2);
  if (made === null || end < 0) return null;
  return { span: spanOf(reader, made.start, end), params: made.params };
}

/** Every `function` and arrow among the tokens: its whole extent and its parameter list. */
function functionsOf(reader: Reader): Fn[] {
  const found: Fn[] = [];
  for (let k = 0; k < reader.tokens.length; k += 1) {
    const fn =
      wordAt(reader, k) === 'function'
        ? namedFunction(reader, k)
        : isArrow(reader, k)
          ? arrowFunction(reader, k)
          : null;
    if (fn !== null) found.push(fn);
  }
  return found;
}

/** The token of the module text that ends the import statement at `k`. */
function importEnd(reader: Reader, k: number): number {
  for (let i = k + 1; i < reader.tokens.length; i += 1) {
    if (reader.tokens[i]?.kind === 'literal' || charAt(reader, i) === ';') return i;
  }
  return reader.tokens.length - 1;
}

/** `name` is a value the import statement in `[from, to)` binds (not a type, not a renamed one). */
function importBinds(reader: Reader, from: number, to: number, name: string): boolean {
  if (wordAt(reader, from) === 'type') return false;
  for (let k = from; k < to; k += 1) {
    if (wordAt(reader, k) !== name) continue;
    if (wordAt(reader, k + 1) === 'as' || wordAt(reader, k - 1) === 'type') continue;
    return true;
  }
  return false;
}

/** A `const`, `let` or `var` at token `k` that binds `name`. */
function variable(reader: Reader, k: number, name: string, region: Span): Declared | null {
  const scope = blockOf(reader, k, region);
  const at = reader.tokens[k]?.start ?? 0;
  const next = k + 1;
  if (wordAt(reader, next) === name) {
    const equals = charAt(reader, next + 1) === ':' ? typeEnd(reader, next + 2) : next + 1;
    const assigned = charAt(reader, equals) === '=' && !isArrow(reader, equals);
    const array = assigned && charAt(reader, equals + 1) === '[' ? equals + 1 : null;
    const binding: Binding =
      wordAt(reader, k) === 'const' ? { kind: 'const', reader, array } : { kind: 'other' };
    return { binding, scope, at };
  }
  const char = charAt(reader, next);
  if (char !== '{' && char !== '[') return null;
  const close = closeOf(reader, next);
  const names = close < 0 ? [] : patternNames(reader, next, close + 1);
  return names.some((one) => one.name === name) ? { binding: { kind: 'other' }, scope, at } : null;
}

/** Every declaration of `name` among a region's tokens, with the span it is visible in. */
function declarations(region: Region, name: string, inJsx: boolean, file: Span): Declared[] {
  const out: Declared[] = [];
  for (let k = 0; k < region.tokens.length; k += 1) {
    const word = wordAt(region, k);
    const at = region.tokens[k]?.start ?? 0;
    if (word === 'import' && !inJsx && charAt(region, k - 1) !== '.') {
      const end = importEnd(region, k);
      if (importBinds(region, k + 1, end, name)) {
        out.push({ binding: { kind: 'import' }, scope: file, at });
      }
      k = end;
    } else if (word === 'const' || word === 'let' || word === 'var') {
      const declared = variable(region, k, name, region.span);
      if (declared !== null) out.push(declared);
    } else if ((word === 'function' || word === 'class') && wordAt(region, k + 1) === name) {
      out.push({ binding: { kind: 'other' }, scope: blockOf(region, k, region.span), at });
    }
  }
  const functions = functionsOf(region);
  for (const fn of functions) {
    if (!patternNames(region, fn.params.from, fn.params.to).some((one) => one.name === name)) {
      continue;
    }
    // A function inside another one is a callback or a helper: what it is given is no prop.
    const inside = functions.some(
      (other) => other !== fn && other.span.start <= fn.span.start && fn.span.end <= other.span.end,
    );
    const binding: Binding = { kind: 'param', nested: inJsx || inside };
    out.push({ binding, scope: fn.span, at: fn.span.start });
  }
  return out;
}

/**
 * What `name`, read at offset `use`, is bound to: the declaration with the smallest scope that
 * holds `use`, over the regions on the way to the element. `null` when none does (a global).
 */
export function bindingOf(regions: readonly Region[], name: string, use: number): Binding | null {
  const file = regions[0]?.span ?? { start: 0, end: 0 };
  let best: Declared | null = null;
  for (const [index, region] of regions.entries()) {
    for (const found of declarations(region, name, index > 0, file)) {
      if (use < found.scope.start || use >= found.scope.end) continue;
      const size = found.scope.end - found.scope.start;
      const bestSize = best === null ? Number.POSITIVE_INFINITY : best.scope.end - best.scope.start;
      if (size < bestSize || (size === bestSize && best !== null && found.at > best.at)) {
        best = found;
      }
    }
  }
  return best?.binding ?? null;
}
