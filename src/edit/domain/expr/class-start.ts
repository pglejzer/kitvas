// The class every value of an expression `className` starts with (ADR 0060). In
// `className={featured ? 'card card--featured' : 'card'}` the element always carries `card`, so a
// style edit writes the rule of `card` and leaves the TSX alone. Every value an operand can give
// (`leaves.ts`) must be a string literal, or a template literal whose text before its first
// `${…}` holds a whole first class; anything else gives no class. Pure.

import { charAt, closeOf, type Reader } from '../list/path.ts';
import { decodeString } from '../list/text.ts';
import { CLASS_NAME } from '../ops.ts';
import { jsTokens } from '../tsx/tsx-reader.ts';
import { type Range, valueLeaves } from './leaves.ts';

/** The first word of a class list. */
const FIRST = /^\s*(\S+)/;
/** The first word, ended by a space: in a template's start, a name not followed by one may go on. */
const FIRST_WHOLE = /^\s*(\S+)\s/;

/** The last token of the template literal whose first token is `k`; `-1` when it is none. */
function templateEnd(reader: Reader, k: number): number {
  const first = reader.tokens[k];
  if (first?.kind !== 'literal' || reader.text.charAt(first.start) !== '`') return -1;
  let at = k;
  for (let guard = 0; guard < reader.tokens.length; guard += 1) {
    const token = reader.tokens[at];
    if (token?.kind !== 'literal') return -1;
    const raw = reader.text.slice(token.start, token.end);
    // A part ends at the closing backtick, or at the `$` of the next `${`.
    if (raw.endsWith('`') && (at !== k || raw.length >= 2)) return at;
    if (charAt(reader, at + 1) !== '{') return -1;
    const close = closeOf(reader, at + 1);
    if (close < 0) return -1;
    at = close + 1;
  }
  return -1;
}

/** The first class every value of `leaf` has; `null` when it may have none. */
function firstClass(reader: Reader, leaf: Range): string | null {
  const token = reader.tokens[leaf.from];
  if (token?.kind !== 'literal') return null;
  const raw = reader.text.slice(token.start, token.end);
  if (leaf.to - leaf.from === 1) {
    const value = decodeString(raw);
    return value === null ? null : (FIRST.exec(value)?.[1] ?? null);
  }
  if (templateEnd(reader, leaf.from) !== leaf.to - 1) return null;
  // The text before the first `${`, without the backtick and the `$`.
  return FIRST_WHOLE.exec(raw.slice(1, -1))?.[1] ?? null;
}

/**
 * The class the `className` expression `source` (the code inside `{…}`) gives in every case, when
 * it is a name kitvas may write (`CLASS_NAME`); `null` for anything else.
 */
export function constantClass(source: string): string | null {
  const reader: Reader = { text: source, tokens: jsTokens(source, 0, true) };
  const leaves = valueLeaves(reader, 0, reader.tokens.length, { andLeft: true });
  let found: string | null = null;
  for (const leaf of leaves) {
    const first = firstClass(reader, leaf);
    if (first === null || (found !== null && first !== found)) return null;
    found = first;
  }
  return found !== null && CLASS_NAME.test(found) ? found : null;
}
