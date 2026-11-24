// The operands a value can come from (ADR 0060): the branches of `?:`, both sides of `||` and
// `??`, and the right side of `&&` (its left side too where a falsy value counts, as in a
// `className`), inside any brackets around them. Anything else is one operand, read as a whole.
// Pure: it reads the tokens of the 4a scanner (`tsx-reader.ts`) and evaluates nothing.

import { charAt, closeOf, closes, opens, type Reader, wordAt } from '../list/path.ts';

/** A stretch of tokens, `[from, to)`. */
export type Range = { from: number; to: number };

/** `andLeft`: the left side of `&&` is a value too (a falsy one is kept, as `className` keeps it). */
export type LeafOptions = { andLeft?: boolean };

const touching = (reader: Reader, k: number): boolean => {
  const end = reader.tokens[k]?.end;
  return end !== undefined && end === reader.tokens[k + 1]?.start;
};

/** Token `k` is the `?` of a condition: not optional chaining (`?.`) and not a part of `??`. */
function isQuestion(reader: Reader, k: number): boolean {
  if (charAt(reader, k) !== '?') return false;
  if (charAt(reader, k - 1) === '?' && touching(reader, k - 1)) return false;
  const next = charAt(reader, k + 1);
  if (next === '?' && touching(reader, k)) return false;
  // `a?.b` chains; in `a ?.5 : 1` a number follows the dot, so it is a condition.
  if (next === '.' && touching(reader, k)) return /^\d/.test(wordAt(reader, k + 2));
  return true;
}

/** Token `k` is an `=` that assigns or starts an arrow (`=`, `+=`, `=>`), not a comparison. */
function assigns(reader: Reader, k: number): boolean {
  if (charAt(reader, k) !== '=') return false;
  const before = touching(reader, k - 1) ? charAt(reader, k - 1) : '';
  const after = touching(reader, k) ? charAt(reader, k + 1) : '';
  return after !== '=' && !(before !== '' && '=!<>'.includes(before));
}

/** `char char` at `k` (`||`, `??`, `&&`), and not `||=`. */
function pairAt(reader: Reader, k: number, char: string): boolean {
  if (charAt(reader, k) !== char || charAt(reader, k + 1) !== char || !touching(reader, k)) {
    return false;
  }
  return !(charAt(reader, k + 2) === '=' && touching(reader, k + 1));
}

/**
 * The value is one operand however it reads inside: it has a comma, an assignment or an arrow
 * outside brackets (`a, b`, `x = 'a'`, `(x) => 'a' || 'b'`).
 */
function whole(reader: Reader, from: number, to: number): boolean {
  let depth = 0;
  for (let k = from; k < to; k += 1) {
    const char = charAt(reader, k);
    if (opens(char)) depth += 1;
    else if (closes(char)) depth -= 1;
    else if (depth === 0 && (char === ',' || assigns(reader, k))) return true;
  }
  return false;
}

/** The `?` and the `:` of a condition: token indexes. */
type Condition = { question: number; colon: number };

/** The `?` of the condition outside brackets in `[from, to)`, and its `:`; `null` when none. */
function conditionAt(reader: Reader, from: number, to: number): Condition | null {
  let depth = 0;
  let question = -1;
  /** Conditions inside the first one's `then` part, whose `:` comes before its own. */
  let inner = 0;
  for (let k = from; k < to; k += 1) {
    const char = charAt(reader, k);
    if (opens(char)) depth += 1;
    else if (closes(char)) depth -= 1;
    else if (depth !== 0) continue;
    else if (isQuestion(reader, k)) {
      if (question < 0) question = k;
      else inner += 1;
    } else if (char === ':' && question >= 0) {
      if (inner === 0) return { question, colon: k };
      inner -= 1;
    }
  }
  return null;
}

/** `[from, to)` cut at every `char char` outside brackets, for each of `chars`. */
function splitPairs(reader: Reader, from: number, to: number, chars: string): Range[] {
  const parts: Range[] = [];
  let depth = 0;
  let start = from;
  for (let k = from; k < to; k += 1) {
    const char = charAt(reader, k);
    if (opens(char)) depth += 1;
    else if (closes(char)) depth -= 1;
    else if (depth === 0 && char !== '' && chars.includes(char) && pairAt(reader, k, char)) {
      parts.push({ from: start, to: k });
      start = k + 2;
      k += 1;
    }
  }
  parts.push({ from: start, to });
  return parts;
}

/**
 * The operands the value of the tokens `[from, to)` can come from, in source order. A condition
 * gives its two branches (never the test); `||` and `??` give every side; `&&` gives its last
 * side, or every side with `andLeft`. An empty value gives none.
 */
export function valueLeaves(
  reader: Reader,
  from: number,
  to: number,
  options: LeafOptions = {},
): Range[] {
  let start = from;
  let end = to;
  // Brackets around the whole value read as the value.
  while (end - start >= 2 && charAt(reader, start) === '(' && closeOf(reader, start) === end - 1) {
    start += 1;
    end -= 1;
  }
  if (start >= end) return [];
  if (whole(reader, start, end)) return [{ from: start, to: end }];
  const condition = conditionAt(reader, start, end);
  if (condition !== null) {
    return [
      ...valueLeaves(reader, condition.question + 1, condition.colon, options),
      ...valueLeaves(reader, condition.colon + 1, end, options),
    ];
  }
  const either = splitPairs(reader, start, end, '|?');
  if (either.length > 1) {
    return either.flatMap((part) => valueLeaves(reader, part.from, part.to, options));
  }
  const both = splitPairs(reader, start, end, '&');
  if (both.length > 1) {
    const kept = options.andLeft === true ? both : both.slice(-1);
    return kept.flatMap((part) => valueLeaves(reader, part.from, part.to, options));
  }
  return [{ from: start, to: end }];
}
