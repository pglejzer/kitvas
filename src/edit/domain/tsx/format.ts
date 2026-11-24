// How a file writes its lines, for the structural ops (spec 4b, decision 9; plan 14, task A2):
// its newline, its indent unit, where a line starts and ends, and a subtree shifted to another
// depth. Pure text; nothing here reads JSX beyond "a line that starts with `<`".

/** A space or a tab: whitespace that never ends a line. */
export const isBlank = (char: string): boolean => char === ' ' || char === '\t';

/** `\r\n` when the file has one, else `\n`. */
export function newlineOf(text: string): string {
  return text.includes('\r\n') ? '\r\n' : '\n';
}

/** The offset where the line holding `at` starts. */
export function lineStartOf(text: string, at: number): number {
  return at <= 0 ? 0 : text.lastIndexOf('\n', at - 1) + 1;
}

/** The offset of the line break that ends the line holding `at` (its `\r` in a CRLF file). */
export function lineEndOf(text: string, at: number): number {
  const feed = text.indexOf('\n', at);
  if (feed < 0) return text.length;
  return feed > at && text.charAt(feed - 1) === '\r' ? feed - 1 : feed;
}

/** The spaces and tabs the line holding `at` starts with (up to `at` at most). */
export function indentAt(text: string, at: number): string {
  const start = lineStartOf(text, at);
  let end = start;
  while (end < at && isBlank(text.charAt(end))) end += 1;
  return text.slice(start, end);
}

/** Nothing but spaces and tabs stands between the start of the line and `at`. */
export function startsLine(text: string, at: number): boolean {
  return indentAt(text, at).length === at - lineStartOf(text, at);
}

/** Nothing but spaces and tabs stands between `at` and the end of its line. */
export function endsLine(text: string, at: number): boolean {
  let i = at;
  while (i < text.length && isBlank(text.charAt(i))) i += 1;
  return i === text.length || text.charAt(i) === '\n' || text.startsWith('\r\n', i);
}

const leadOf = (line: string): string => /^[ \t]*/.exec(line)?.[0] ?? '';

/**
 * One step of indentation as the file writes it: a tab when a JSX line starts with one, else the
 * smallest of the steps between the leading spaces of two JSX lines that follow each other and
 * the leading spaces of any line of code (a section with one element still shows it in its
 * `return`). Comment lines are left out: ` * text` is aligned, not indented. Two spaces when the
 * file shows nothing.
 */
export function indentUnitOf(text: string): string {
  let smallest = 0;
  let previous: number | null = null;
  const note = (size: number): void => {
    if (size > 0 && (smallest === 0 || size < smallest)) smallest = size;
  };
  for (const line of text.split('\n')) {
    const lead = leadOf(line);
    const rest = line.slice(lead.length);
    const jsx = rest.startsWith('<');
    if (jsx && lead.includes('\t')) return '\t';
    const comment = rest.startsWith('*') || rest.startsWith('/');
    if (rest.trim() === '' || comment || lead.includes('\t')) continue;
    note(lead.length);
    if (!jsx) continue;
    if (previous !== null) note(Math.abs(lead.length - previous));
    previous = lead.length;
  }
  return smallest === 0 ? '  ' : ' '.repeat(smallest);
}

/**
 * The indent a subtree's source was written at, read from the source alone (its first line has
 * lost its own): the indent of its last line when that is a closing tag or the end of an opening
 * one, else the smallest indent of its later lines. `''` for a source of one line.
 */
export function sourceIndent(source: string): string {
  const lines = source.split('\n').slice(1);
  const last = lines[lines.length - 1];
  if (last === undefined) return '';
  const lead = leadOf(last);
  const rest = last.slice(lead.length);
  if (rest.startsWith('</') || rest.startsWith('/>') || rest.startsWith('>')) return lead;
  let smallest: string | null = null;
  for (const line of lines) {
    const indent = leadOf(line);
    const blank = line.length === indent.length || line.slice(indent.length) === '\r';
    if (!blank && (smallest === null || indent.length < smallest.length)) smallest = indent;
  }
  return smallest ?? '';
}

/** A re-indented source, and where each offset of the source is in it. */
export type Reindented = { text: string; at: (offset: number) => number };
/** One line of a shifted source: where it started, where it starts now, what its indent became. */
type Line = { from: number; to: number; cut: number; added: number };

/**
 * `source` with every line after the first moved from the indent `from` to the indent `to`. The
 * lines keep their indentation relative to each other. A blank line stays as it is, and so does
 * a line that is not indented by `from` when the move is not simply deeper: nothing is ever cut
 * that is not the indent. Shifting back (`to`, `from`) gives the source again when every later
 * line started with `from`.
 */
export function reindented(source: string, from: string, to: string): Reindented {
  if (from === to || !source.includes('\n')) return { text: source, at: (offset) => offset };
  const deeper = to.startsWith(from) ? to.slice(from.length) : null;
  const lines: Line[] = [];
  let text = '';
  let start = 0;
  while (start <= source.length) {
    const feed = source.indexOf('\n', start);
    const end = feed < 0 ? source.length : feed + 1;
    const line = source.slice(start, end);
    const blank = line.trim() === '';
    let cut = 0;
    let added = '';
    if (start > 0 && !blank) {
      if (line.startsWith(from)) {
        cut = from.length;
        added = to;
      } else if (deeper !== null) {
        added = deeper;
      }
    }
    lines.push({ from: start, to: text.length, cut, added: added.length });
    text += added + line.slice(cut);
    if (feed < 0) break;
    start = end;
  }
  const at = (offset: number): number => {
    let line = lines[0];
    for (const next of lines) {
      if (next.from > offset) break;
      line = next;
    }
    if (line === undefined) return offset;
    const column = offset - line.from;
    // An offset inside the indent that was cut has no place of its own: the new indent's end.
    return line.to + (column < line.cut ? line.added : line.added + column - line.cut);
  };
  return { text, at };
}

/** `reindented` when only the text is wanted. */
export function reindent(source: string, from: string, to: string): string {
  return reindented(source, from, to).text;
}

/** `source` with every line break written as `newline` (`\n` or `\r\n`). */
export function withNewline(source: string, newline: string): string {
  return source.replace(/\r\n|\n/g, newline);
}
