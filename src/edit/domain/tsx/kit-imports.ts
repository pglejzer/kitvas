// The kit import follows use (spec 4b, decision 8; plan 14, task B1). After a structural op the
// file's import from the kit entry names exactly the kit components the file uses. No other import
// is ever touched, and the import keeps the way it is written (one line or several, quotes, order
// of the names that stay).
//
// What the file uses is read without a parser: the 4a reader's `openingTags` gives every JSX tag,
// and a small walk in the reader's manner collects the names written as code, never those in a
// string, a comment, a regular expression or JSX text.

import type { OffsetMap } from '../types.ts';
import { isSpace, openAt, openingTags } from './tsx-reader.ts';

/** A name written as code, and where. */
type Word = { name: string; at: number; end: number };
type Scanner = { text: string; tags: ReadonlySet<number>; words: Word[] };
/** One name of `import { … }`: `Card`, `Card as Box`, `type CardProps`. */
type Spec = { start: number; end: number; imported: string; local: string; type: boolean };
type Statement = {
  /** From `import` to the end of its `;`, or of the quote without one. */
  start: number;
  end: number;
  source: string;
  quote: string;
  semicolon: boolean;
  typeOnly: boolean;
  /** `import { … } from` with no default or namespace name beside the braces. */
  bracesOnly: boolean;
  /** The braces (offsets of `{` and `}`) and their names; `null` without braces. */
  named: { open: number; close: number; specs: Spec[] } | null;
  /** The braces hold something this file does not read (a comment): never edited. */
  unreadable: boolean;
  /** Every name the statement binds in the file. */
  locals: string[];
};
type Facts = { statements: Statement[]; uses: Set<string>; declared: Set<string> };
type Splice = { start: number; end: number; text: string };

const WORD = /[\w$\u0080-￿]+/y;
const IDENTIFIER = /^[A-Za-z_$][\w$]*$/;
/** Words after which a value starts, so a `/` there opens a regular expression. */
const BEFORE_VALUE = new Set(
  'return yield await case default typeof void delete throw new in of do else instanceof'.split(
    ' ',
  ),
);
const DECLARES = new Set(['const', 'let', 'var', 'function', 'class', 'interface', 'type', 'enum']);
const IMPORT =
  /import(\s+type)?\s+((?:[A-Za-z_$][\w$]*\s*,\s*)?(?:\{[^}]*\}|\*\s*as\s+[A-Za-z_$][\w$]*)|[A-Za-z_$][\w$]*)\s*from\s*(['"])([^'"\r\n]*)\3([ \t]*;)?/y;
const SPEC = /(type\s+)?([A-Za-z_$][\w$]*)(?:\s+as\s+([A-Za-z_$][\w$]*))?/y;

function matchAt(pattern: RegExp, text: string, at: number): RegExpExecArray | null {
  pattern.lastIndex = at;
  return pattern.exec(text);
}

// The walk below follows `tsx-reader.ts`, whose helpers are its own. It does not decide what JSX
// is: a `<` is an element exactly when the reader's `openingTags` found one there.

function skipString(text: string, at: number): number {
  const quote = text.charAt(at);
  let i = at + 1;
  while (i < text.length) {
    const char = text.charAt(i);
    if (char === '\\') {
      i += text.startsWith('\r\n', i + 1) ? 3 : 2;
      continue;
    }
    if (char === quote) return i + 1;
    if (char === '\n') return i;
    i += 1;
  }
  return text.length;
}

function skipRegex(text: string, at: number): number {
  let inClass = false;
  for (let i = at + 1; i < text.length; i += 1) {
    const char = text.charAt(i);
    if (char === '\n') return -1;
    if (char === '\\') i += 1;
    else if (char === '[') inClass = true;
    else if (char === ']') inClass = false;
    else if (char === '/' && !inClass) return i + 1;
  }
  return -1;
}

function scanTemplate(scan: Scanner, at: number): number {
  const { text } = scan;
  let i = at + 1;
  while (i < text.length) {
    const char = text.charAt(i);
    if (char === '\\') i += 2;
    else if (char === '`') return i + 1;
    else if (char === '$' && text.charAt(i + 1) === '{') i = scanCode(scan, i + 2, false);
    else i += 1;
  }
  return text.length;
}

/** Code from `from` to just after the `}` that closes it, or to the end with `toEnd`. */
function scanCode(scan: Scanner, from: number, toEnd: boolean): number {
  const { text } = scan;
  let depth = 0;
  let value = false;
  let i = from;
  while (i < text.length) {
    const char = text.charAt(i);
    const next = text.charAt(i + 1);
    if (isSpace(char)) {
      i += 1;
    } else if (char === '"' || char === "'") {
      i = skipString(text, i);
      value = true;
    } else if (char === '`') {
      i = scanTemplate(scan, i);
      value = true;
    } else if (char === '/' && next === '/') {
      const end = text.indexOf('\n', i);
      i = end < 0 ? text.length : end;
    } else if (char === '/' && next === '*') {
      const end = text.indexOf('*/', i + 2);
      i = end < 0 ? text.length : end + 2;
    } else if (char === '/') {
      const end: number = value ? -1 : skipRegex(text, i);
      value = end >= 0;
      i = end >= 0 ? end : i + 1;
    } else if (char === '{') {
      depth += 1;
      value = false;
      i += 1;
    } else if (char === '}') {
      if (depth === 0 && !toEnd) return i + 1;
      depth = Math.max(0, depth - 1);
      value = false;
      i += 1;
    } else if (char === '<' && scan.tags.has(i)) {
      i = scanElement(scan, i);
      value = true;
    } else if (char === '<' && !value && next === '>') {
      i = scanChildren(scan, i + 2);
      value = true;
    } else {
      const word = matchAt(WORD, text, i)?.[0] ?? null;
      if (word === null) {
        value = char === ')' || char === ']';
        i += 1;
      } else {
        if (IDENTIFIER.test(word)) scan.words.push({ name: word, at: i, end: i + word.length });
        value = !BEFORE_VALUE.has(word);
        i += word.length;
      }
    }
  }
  return text.length;
}

/** The code in an element's prop values and children. Its tag names are counted from the tags. */
function scanElement(scan: Scanner, at: number): number {
  const { text } = scan;
  const open = openAt(text, at);
  if (open === null) return at + 1;
  for (const attr of open.attrs) {
    const start = attr.value?.start;
    if (start === undefined) continue;
    if (text.charAt(start) === '{') scanCode(scan, start + 1, false);
    else if (scan.tags.has(start)) scanElement(scan, start);
  }
  return open.selfClosing ? open.end : scanChildren(scan, open.end);
}

/** JSX children up to the end of the closing tag; their text is passed over. */
function scanChildren(scan: Scanner, from: number): number {
  const { text } = scan;
  let i = from;
  while (i < text.length) {
    const char = text.charAt(i);
    if (char === '{') {
      i = scanCode(scan, i + 1, false);
    } else if (char !== '<') {
      i += 1;
    } else if (text.charAt(i + 1) === '/') {
      const end = text.indexOf('>', i);
      return end < 0 ? text.length : end + 1;
    } else if (scan.tags.has(i)) {
      i = scanElement(scan, i);
    } else if (text.charAt(i + 1) === '>') {
      i = scanChildren(scan, i + 2);
    } else {
      i += 1;
    }
  }
  return text.length;
}

function skipBlank(text: string, from: number, to: number): number {
  let i = from;
  while (i < to && isSpace(text.charAt(i))) i += 1;
  return i;
}

/** The names between `{` and `}`; `null` when anything else is there (a comment). */
function specsOf(text: string, open: number, close: number): Spec[] | null {
  const specs: Spec[] = [];
  let i = skipBlank(text, open + 1, close);
  while (i < close) {
    const match = matchAt(SPEC, text, i);
    const imported = match?.[2];
    if (match === null || imported === undefined || i + match[0].length > close) return null;
    const end = i + match[0].length;
    const local = match[3] ?? imported;
    specs.push({ start: i, end, imported, local, type: match[1] !== undefined });
    i = skipBlank(text, end, close);
    if (i < close) {
      if (text.charAt(i) !== ',') return null;
      i = skipBlank(text, i + 1, close);
    }
  }
  return specs;
}

/** The statement of the `import` word at `at`; `null` for `import(…)` or `import.meta`. */
function readImport(text: string, at: number): Statement | null {
  const match = matchAt(IMPORT, text, at);
  const clause = match?.[2];
  if (match === null || clause === undefined) return null;
  const clauseAt = skipBlank(text, at + 'import'.length + (match[1]?.length ?? 0), text.length);
  const statement: Statement = {
    start: at,
    end: at + match[0].length,
    source: match[4] ?? '',
    quote: match[3] ?? "'",
    semicolon: match[5] !== undefined,
    typeOnly: match[1] !== undefined,
    bracesOnly: clause.startsWith('{'),
    named: null,
    unreadable: false,
    locals: [],
  };
  const first = /^[A-Za-z_$][\w$]*/.exec(clause)?.[0];
  if (first !== undefined) statement.locals.push(first);
  const namespace = /\*\s*as\s+([A-Za-z_$][\w$]*)/.exec(clause)?.[1];
  if (namespace !== undefined) statement.locals.push(namespace);
  const open = clause.indexOf('{');
  if (open >= 0) {
    const close = clauseAt + clause.indexOf('}');
    const specs = specsOf(text, clauseAt + open, close);
    if (specs === null) statement.unreadable = true;
    else {
      statement.named = { open: clauseAt + open, close, specs };
      statement.locals.push(...specs.map((spec) => spec.local));
    }
  }
  return statement;
}

function previousChar(text: string, at: number): { char: string; at: number } {
  let i = at - 1;
  while (i >= 0 && isSpace(text.charAt(i))) i -= 1;
  return { char: text.charAt(i), at: i };
}

/** `a.Card`, `a?.Card`: a property, not the name. `...Card` is the name. */
function isProperty(text: string, word: Word): boolean {
  const before = previousChar(text, word.at);
  return before.char === '.' && text.charAt(before.at - 1) !== '.';
}

/** `{ Card: 1 }`, `{ Card?: string }`: an object or type key, not the name. */
function isKey(text: string, word: Word): boolean {
  const before = previousChar(text, word.at);
  if (before.at < 0 || !'{,;'.includes(before.char)) return false;
  let i = skipBlank(text, word.end, text.length);
  if (text.charAt(i) === '?') i = skipBlank(text, i + 1, text.length);
  return text.charAt(i) === ':' && text.charAt(i + 1) !== ':';
}

/** `Card` for `Card.Header`; tag roots that name a variable (capitalised, or before a `.`). */
function tagRoot(name: string): string | null {
  const root = name.split('.')[0] ?? '';
  return /^[A-Z]/.test(root) || name.includes('.') ? root : null;
}

function factsOf(text: string): Facts {
  const tags = openingTags(text);
  const scan: Scanner = { text, tags: new Set(tags), words: [] };
  scanCode(scan, 0, true);
  const statements: Statement[] = [];
  for (const word of scan.words) {
    const statement = word.name === 'import' ? readImport(text, word.at) : null;
    if (statement !== null) statements.push(statement);
  }
  const inImport = (at: number): boolean =>
    statements.some((statement) => at >= statement.start && at < statement.end);
  const uses = new Set<string>();
  for (const at of tags) {
    const root = tagRoot(openAt(text, at)?.name ?? '');
    if (root !== null) uses.add(root);
  }
  const declared = new Set<string>();
  scan.words.forEach((word, index) => {
    if (inImport(word.at) || isProperty(text, word) || isKey(text, word)) return;
    uses.add(word.name);
    const next = scan.words[index + 1];
    if (DECLARES.has(word.name) && next !== undefined) {
      if (/^[\s*]*$/.test(text.slice(word.end, next.at))) declared.add(next.name);
    }
  });
  return { statements, uses, declared };
}

/** Names the file defines itself: declarations, and imports from anywhere but the kit entry. */
function boundNames(facts: Facts, entry: string): Set<string> {
  const bound = new Set(facts.declared);
  for (const statement of facts.statements) {
    if (statement.source !== entry) for (const local of statement.locals) bound.add(local);
  }
  return bound;
}

/**
 * The kit components the file uses: JSX tag roots (`Card` for `Card.Header`) and names read as
 * values (`as={Card}`) that are in `kitNames`. Names the file binds itself (a `const Card =`, an
 * import from elsewhere) do not count; nor do words in strings, comments or JSX text.
 */
export function usedKitComponents(text: string, kitNames: ReadonlySet<string>): Set<string> {
  const facts = factsOf(text);
  const bound = boundNames(facts, '@kit');
  return new Set([...facts.uses].filter((name) => kitNames.has(name) && !bound.has(name)));
}

/** Case-blind first, so `Badge` comes before `button` and `ICON` beside `Icon`. */
function compareNames(a: string, b: string): number {
  const [x, y] = [a.toLowerCase(), b.toLowerCase()];
  return x === y ? Number(a > b) - Number(a < b) : Number(x > y) - Number(x < y);
}

/** What stands between two names: the file's own, else `, ` (`,` and the indent if multi-line). */
function separatorOf(text: string, named: NonNullable<Statement['named']>): string {
  const [first, second] = named.specs;
  if (first !== undefined && second !== undefined) return text.slice(first.end, second.start);
  const lead = text.slice(named.open + 1, first?.start ?? named.close);
  return lead.includes('\n') ? `,${lead}` : ', ';
}

/** The statement with its line, when it stands alone on the line; else the statement only. */
function lineRemoval(text: string, statement: Statement): Splice {
  const indent = /[ \t]*$/.exec(text.slice(0, statement.start))?.[0].length ?? 0;
  const start = statement.start - indent;
  const rest = /^[ \t]*(?:\r?\n|$)/.exec(text.slice(statement.end))?.[0].length;
  const alone = (start === 0 || text.charAt(start - 1) === '\n') && rest !== undefined;
  return alone
    ? { start, end: statement.end + (rest ?? 0), text: '' }
    : { start: statement.start, end: statement.end, text: '' };
}

/**
 * The splices of one `import { … } from '<entry>'`: unused kit names out with one separator each,
 * `additions` in before the first kept name that sorts after them (or after the last).
 */
function editStatement(
  text: string,
  statement: Statement,
  named: NonNullable<Statement['named']>,
  drop: (spec: Spec) => boolean,
  additions: readonly string[],
): Splice[] {
  const { specs } = named;
  const kept = specs.map((spec) => !drop(spec));
  const last = kept.lastIndexOf(true);
  const sep = separatorOf(text, named);
  if (last < 0) {
    if (additions.length === 0) return [lineRemoval(text, statement)];
    const [first, final] = [specs[0], specs.at(-1)];
    return first === undefined || final === undefined
      ? [{ start: named.open + 1, end: named.close, text: ` ${additions.join(', ')} ` }]
      : [{ start: first.start, end: final.end, text: additions.join(sep) }];
  }
  const splices: Splice[] = [];
  specs.forEach((spec, i) => {
    if (kept[i] === true) return;
    // A name before a kept one goes with the separator after it; one after the last kept name
    // with the separator before it, so the list keeps its trailing comma or its lack of one.
    const following = specs[i + 1];
    const preceding = specs[i - 1];
    if (i < last && following !== undefined) {
      splices.push({ start: spec.start, end: following.start, text: '' });
    } else if (preceding !== undefined) {
      splices.push({ start: preceding.end, end: spec.end, text: '' });
    }
  });
  const before = new Map<number, string[]>();
  const tail: string[] = [];
  for (const name of additions) {
    const index = specs.findIndex((spec, i) => kept[i] && compareNames(spec.imported, name) > 0);
    if (index < 0) tail.push(name);
    else before.set(index, [...(before.get(index) ?? []), name]);
  }
  for (const [index, names] of before) {
    const at = specs[index]?.start ?? named.close;
    splices.push({ start: at, end: at, text: names.map((name) => name + sep).join('') });
  }
  const end = specs[last]?.end ?? named.close;
  if (tail.length > 0) splices.push({ start: end, end, text: tail.map((n) => sep + n).join('') });
  return splices;
}

/** A new `import { … } from '<entry>';` after the last import, or at the top without one. */
function newImport(
  text: string,
  statements: readonly Statement[],
  names: readonly string[],
  entry: string,
): Splice {
  const newline = text.includes('\r\n') ? '\r\n' : '\n';
  let last: Statement | null = null;
  for (const statement of statements) {
    if (last === null || statement.end > last.end) last = statement;
  }
  const quote = last?.quote ?? "'";
  const semicolon = last === null || last.semicolon ? ';' : '';
  const line = `import { ${names.join(', ')} } from ${quote}${entry}${quote}${semicolon}`;
  if (last === null) {
    const blank = text === '' || text.startsWith('\n') || text.startsWith('\r\n');
    return { start: 0, end: 0, text: line + newline + (blank ? '' : newline) };
  }
  const lineEnd = text.indexOf('\n', last.end);
  let at = lineEnd < 0 ? text.length : lineEnd;
  if (lineEnd > 0 && text.charAt(lineEnd - 1) === '\r') at = lineEnd - 1;
  return { start: at, end: at, text: newline + line };
}

function spliced(text: string, splices: readonly Splice[]): { text: string; moved: OffsetMap } {
  // An insert sorts before a removal that starts at the same offset.
  const sorted = [...splices].sort((x, y) => x.start - y.start || x.end - y.end);
  let out = '';
  let cursor = 0;
  for (const splice of sorted) {
    out += text.slice(cursor, splice.start) + splice.text;
    cursor = splice.end;
  }
  out += text.slice(cursor);
  const moved: OffsetMap = (old) => {
    if (old < 0 || old > text.length) return null;
    let shift = 0;
    for (const splice of sorted) {
      if (old < splice.start) break;
      if (old < splice.end) return null;
      shift += splice.text.length - (splice.end - splice.start);
    }
    return old + shift;
  };
  return { text: out, moved };
}

/**
 * The text with its `import { … } from '<entry>'` naming exactly the used kit components: missing
 * ones added in sorted place, unused ones removed (an aliased name is kept while its alias is used),
 * the line removed when it names nothing and added after the last import when there was none.
 * Names that are not kit components (`type CardProps`, constants) stay as written. A kit import
 * this file cannot read (a comment between the names) leaves the text unchanged.
 */
export function syncKitImports(
  text: string,
  kitNames: ReadonlySet<string>,
  entry = '@kit',
): { text: string; moved: OffsetMap } {
  const facts = factsOf(text);
  const fromEntry = facts.statements.filter((statement) => statement.source === entry);
  if (fromEntry.some((statement) => statement.unreadable)) return spliced(text, []);
  const bound = boundNames(facts, entry);
  const present = new Set(fromEntry.flatMap((statement) => statement.locals));
  const missing = [...facts.uses]
    .filter((name) => kitNames.has(name) && !bound.has(name) && !present.has(name))
    .sort(compareNames);
  const drop = (spec: Spec): boolean =>
    !spec.type && kitNames.has(spec.imported) && !facts.uses.has(spec.local);
  const splices: Splice[] = [];
  let additions: readonly string[] = missing;
  for (const statement of fromEntry) {
    if (statement.typeOnly || !statement.bracesOnly || statement.named === null) continue;
    splices.push(...editStatement(text, statement, statement.named, drop, additions));
    additions = [];
  }
  if (additions.length > 0) splices.push(newImport(text, facts.statements, additions, entry));
  return spliced(text, splices);
}
