// The editor of a section's SCSS file (spec 4a, decisions 3 and 10; spike 2): it reads top-level
// class rules and sets, adds or removes one declaration, or one whole rule. It is hand-written and
// has no parser behind it, so it only ever cuts and pastes inside the span it names: every other
// byte of the file, its line endings and its indentation stay as they were, and an operation
// followed by its inverse gives the file back exactly.

import { type EditOp, OFF_KIT_MARKER, type StyleValue, styleText } from './ops.ts';
import {
  blank,
  endOfLine,
  eolAt,
  eolBefore,
  type Found,
  lineStart,
  listRules,
  type Own,
  readRule,
  readRules,
  scssBalanced,
} from './scss-reader.ts';
import type { ApplyOptions, ApplyResult, Span } from './types.ts';

export { listRules, readRule, scssBalanced };

export type ScssOp = Extract<EditOp, { op: 'setStyle' | 'removeStyle' }>;
type SetStyle = Extract<EditOp, { op: 'setStyle' }>;
type RemoveStyle = Extract<EditOp, { op: 'removeStyle' }>;

// ---- Writing --------------------------------------------------------------------------------------

const splice = (text: string, start: number, end: number, insert: string): string =>
  text.slice(0, start) + insert + text.slice(end);

const eolOf = (text: string): string => (text.includes('\r\n') ? '\r\n' : '\n');

/** The first indent any line of the file has, else two spaces. */
const fileIndent = (text: string): string => /^([ \t]+)\S/m.exec(text)?.[1] ?? '  ';

/** The indent of the body's lines: the first statement that starts its own line. */
function bodyIndent(text: string, rule: Found): string {
  for (const start of rule.starts) {
    const line = lineStart(text, start);
    if (line >= rule.open && blank(text.slice(line, start))) return text.slice(line, start);
  }
  return fileIndent(text);
}

/** A new declaration as kitvas writes it (decision 3): the marker follows the semicolon. */
function declarationText(property: string, value: StyleValue): string {
  const written = styleText(value);
  return `${property}: ${written.value};${written.offKit ? ` ${OFF_KIT_MARKER}` : ''}`;
}

/** The declaration is what the person saw: `before`, or absent for `null`. */
function holds(found: Own | undefined, before: StyleValue | null): boolean {
  if (before === null) return found === undefined;
  if (found === undefined) return false;
  const seen = styleText(before);
  return seen.value === found.view.value && seen.offKit === found.view.offKit;
}

/**
 * A new value in an existing declaration. Only the value and the marker change; the spacing
 * around the colon and the semicolon is the file's own, so the inverse puts back every byte.
 */
function replaceValue(text: string, found: Own, value: StyleValue): ApplyResult {
  const { start, end } = found.view.span;
  const written = styleText(value);
  const mark = found.view.offKit ? text.slice(found.semiEnd, end) : ` ${OFF_KIT_MARKER}`;
  const next =
    text.slice(start, found.value.start) +
    written.value +
    text.slice(found.value.end, found.semiEnd) +
    (written.offKit ? mark : '');
  return { text: splice(text, start, end, next), changed: [{ start, end: start + next.length }] };
}

/**
 * A new declaration at the end of the body. With the closing brace on a line of its own it is a
 * new line above it; in a one-line body it goes right before the brace with one space after it.
 * `removeDeclaration` takes away exactly either.
 */
function appendDeclaration(text: string, rule: Found, op: SetStyle): ApplyResult {
  if (rule.dangling) return { refused: 'invalid' };
  const declaration = declarationText(op.property, op.value);
  const line = lineStart(text, rule.close);
  const ownLine = line >= rule.open && blank(text.slice(line, rule.close));
  const at = ownLine ? line : rule.close;
  const insert = ownLine
    ? `${bodyIndent(text, rule)}${declaration}${eolOf(text)}`
    : `${declaration} `;
  return {
    text: splice(text, at, at, insert),
    changed: [{ start: at, end: at + insert.length }],
  };
}

/** The whole line when the declaration is alone on it, else the declaration and one space. */
function declarationCut(text: string, span: Span): Span {
  const line = lineStart(text, span.start);
  const lineEnd = endOfLine(text, span.end);
  const eol = eolAt(text, lineEnd);
  if (eol > 0 && blank(text.slice(line, span.start)) && blank(text.slice(span.end, lineEnd))) {
    return { start: line, end: lineEnd + eol };
  }
  return { start: span.start, end: text[span.end] === ' ' ? span.end + 1 : span.end };
}

/**
 * The rule with its final line ending and one blank line in front of it. A rule that ends the
 * file with no line ending was created in a file that had none: there the blank line and the line
 * ending in front of it go, which is exactly what `createRule` added.
 */
function ruleCut(text: string, span: Span): Span {
  let { start, end } = span;
  const after = eolAt(text, end);
  const first = eolBefore(text, start);
  if (after > 0) {
    end += after;
    if (first > 0 && start - first > 0 && eolBefore(text, start - first) > 0) start -= first;
  } else if (end === text.length && first > 0) {
    start -= first;
    start -= eolBefore(text, start);
  }
  return { start, end };
}

function removeDeclaration(text: string, found: Own, op: RemoveStyle): ApplyResult {
  const cut = declarationCut(text, found.view.span);
  const next = splice(text, cut.start, cut.end, '');
  const result: ApplyResult = { text: next, changed: [{ start: cut.start, end: cut.start }] };
  if (!op.dropRule) return result;

  const rules = readRules(next).filter((rule) => rule.view.className === op.className);
  const rule = rules[0];
  if (rules.length !== 1 || rule === undefined || !rule.closed) return result;
  // A comment left in the body is someone's text: the rule stays.
  if (next.slice(rule.open, rule.close).trim() !== '') return result;
  const whole = ruleCut(next, rule.view.span);
  return {
    text: splice(next, whole.start, whole.end, ''),
    changed: [{ start: whole.start, end: whole.start }],
  };
}

/**
 * A new rule at the end of the file, after one blank line. The file keeps its ending: a final
 * line ending when it had one (or was empty), none when it had none, so that dropping the rule
 * gives the file back exactly.
 */
function createRule(text: string, op: SetStyle): ApplyResult {
  const eol = eolOf(text);
  const ended = text === '' || eolBefore(text, text.length) > 0;
  const lead = text === '' ? '' : ended ? eol : eol + eol;
  const declaration = declarationText(op.property, op.value);
  const rule = `.${op.className} {${eol}${fileIndent(text)}${declaration}${eol}}`;
  const start = text.length + lead.length;
  return {
    text: text + lead + rule + (ended ? eol : ''),
    changed: [{ start, end: start + rule.length }],
  };
}

/** Applies one style operation to a section's SCSS text; never a part of it. */
export function applyScss(text: string, op: ScssOp, options: ApplyOptions): ApplyResult {
  const rules = readRules(text).filter((rule) => rule.view.className === op.className);
  if (rules.length > 1) return { refused: 'ambiguous' };
  const rule = rules[0];
  if (rule === undefined) {
    if (op.op !== 'setStyle' || !op.newRule) return { refused: 'not-found' };
    // A rule the person saw a value in is gone: that is not a rule to create.
    return op.before === null || options.force ? createRule(text, op) : { refused: 'not-found' };
  }
  if (!rule.closed) return { refused: 'invalid' };

  const matches = rule.own.filter((declaration) => declaration.view.property === op.property);
  if (matches.length > 1) return { refused: 'ambiguous' };
  const found = matches[0];
  if (found === undefined && rule.view.nested.includes(op.property)) return { refused: 'nested' };
  if (!options.force && !holds(found, op.before)) return { conflict: 'changed' };

  if (op.op === 'setStyle') {
    return found === undefined
      ? appendDeclaration(text, rule, op)
      : replaceValue(text, found, op.value);
  }
  return found === undefined ? { refused: 'not-found' } : removeDeclaration(text, found, op);
}
