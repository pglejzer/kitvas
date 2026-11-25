// The cuts and pastes of the SCSS editor, shared by the base writer (`apply-scss.ts`) and the
// context writer (`scss-context.ts`, spec 4c). Each one touches only the span it names and is made
// so that its opposite takes away exactly what it put in: a new line with its line ending, or a
// piece of a line with one space after it. A class with no rule gets one nested as `&__part` in
// the rule of its block when it has one (ADR 0067), else a top-level one at the end of the file.

import { type EditOp, OFF_KIT_MARKER, type StyleValue, styleText } from '../ops.ts';
import type { ApplyOptions, ApplyResult, Span } from '../types.ts';
import {
  type Body,
  blank,
  endOfLine,
  eolAt,
  eolBefore,
  lineAfter,
  lineStart,
  type Own,
} from './scss-reader.ts';
import { classRules, type Found, readRules } from './scss-rules.ts';

export type ScssOp = Extract<EditOp, { op: 'setStyle' | 'removeStyle' }>;
/**
 * `hasImage`: the version has this file in `src/img`. Without it no background image is written,
 * since nothing says the file is there. `breakpoints`: the kit's widths; with it a context of
 * another width is refused (`not-breakpoint`).
 */
export type ScssOptions = ApplyOptions & {
  hasImage?: ((file: string) => boolean) | undefined;
  breakpoints?: (() => readonly number[]) | undefined;
};

export const splice = (text: string, start: number, end: number, insert: string): string =>
  text.slice(0, start) + insert + text.slice(end);

export const eolOf = (text: string): string => (text.includes('\r\n') ? '\r\n' : '\n');

/** The first indent any line of the file has, else two spaces. */
export const fileIndent = (text: string): string => /^([ \t]+)\S/m.exec(text)?.[1] ?? '  ';

/**
 * The indent of the body's lines: the first statement that starts its own line, else one step
 * more than `outer`, the indent of the body's own first line (none for a rule).
 */
export function bodyIndent(text: string, body: Body, outer: string): string {
  for (const part of body.parts) {
    const line = lineStart(text, part.start);
    if (line >= body.open && blank(text.slice(line, part.start))) {
      return text.slice(line, part.start);
    }
  }
  return outer + fileIndent(text);
}

/** A new declaration as kitvas writes it (decision 3): the marker follows the semicolon. */
export function declarationText(property: string, value: StyleValue): string {
  const written = styleText(value);
  return `${property}: ${written.value};${written.offKit ? ` ${OFF_KIT_MARKER}` : ''}`;
}

/** The declaration is what the person saw: `before`, or absent for `null`. */
export function holds(found: Own | undefined, before: StyleValue | null): boolean {
  if (before === null) return found === undefined;
  if (found === undefined) return false;
  const seen = styleText(before);
  return seen.value === found.view.value && seen.offKit === found.view.offKit;
}

/**
 * The last declaration of `property` in `bodies` (in file order), the one the browser applies:
 * a write of the property goes there. `'ambiguous'` when the body that holds it declares the
 * property twice, as a fallback pair may.
 */
export function lastDeclaration(
  bodies: readonly Body[],
  property: string,
): Own | undefined | 'ambiguous' {
  let found: { body: Body; own: Own } | undefined;
  for (const body of bodies) {
    for (const own of body.own) {
      if (own.view.property === property) found = { body, own };
    }
  }
  if (found === undefined) return undefined;
  const twice = found.body.own.filter((own) => own.view.property === property).length > 1;
  return twice ? 'ambiguous' : found.own;
}

/**
 * A new value in an existing declaration. Only the value and the marker change; the spacing
 * around the colon and the semicolon is the file's own, so the inverse puts back every byte.
 */
export function replaceValue(text: string, found: Own, value: StyleValue): ApplyResult {
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

/** Where a new statement goes, and how: on lines of its own, or inside a line. */
export type Slot = {
  at: number;
  /** It gets whole lines; else it goes inside a line, with one space after it. */
  lines: boolean;
  /** A statement of the body stands before it. */
  lead: boolean;
};

/**
 * The place right before `next` (the start of a statement of the body, or its closing brace). On
 * lines of its own it is the first line after the statement in front, so a blank line or a comment
 * above `next` stays with `next`.
 */
export function slotBefore(text: string, body: Body, next: number): Slot {
  const front = body.parts.filter((part) => part.end <= next).at(-1);
  const line = lineAfter(text, front?.end ?? body.open, next);
  const own = lineStart(text, next);
  const lines = line >= 0 && own >= line && blank(text.slice(own, next));
  return { at: lines ? line : next, lines, lead: front !== undefined };
}

const inserted = (text: string, at: number, insert: string): ApplyResult => ({
  text: splice(text, at, at, insert),
  changed: [{ start: at, end: at + insert.length }],
});

/** The start of the body's first context block or joined rule, whichever comes first. */
function firstNested(body: Body): number | undefined {
  const starts = [body.blocks[0]?.span.start, body.joins[0]?.span.start];
  const known = starts.filter((start): start is number => start !== undefined);
  return known.length === 0 ? undefined : Math.min(...known);
}

/**
 * A new declaration in a body. Without context blocks or joined rules it goes to the end: a new
 * line above a closing brace that has a line of its own, else right before the brace with one
 * space after it. With them it goes above the first: Sass keeps a declaration written after a
 * nested rule after it in the CSS, where it would win over the block's value or a modifier's
 * (`&--row`). `declarationCut` takes away exactly what either put in.
 */
export function addDeclaration(
  text: string,
  body: Body,
  outer: string,
  declaration: string,
): ApplyResult {
  const indent = bodyIndent(text, body, outer);
  const first = firstNested(body);
  if (first !== undefined) {
    const slot = slotBefore(text, body, first);
    const insert = slot.lines ? `${indent}${declaration}${eolOf(text)}` : `${declaration} `;
    return inserted(text, slot.at, insert);
  }
  if (body.dangling) return { refused: 'invalid' };
  const line = lineStart(text, body.close);
  const ownLine = line >= body.open && blank(text.slice(line, body.close));
  return ownLine
    ? inserted(text, line, `${indent}${declaration}${eolOf(text)}`)
    : inserted(text, body.close, `${declaration} `);
}

/** The whole line when the declaration is alone on it, else the declaration and one space. */
export function declarationCut(text: string, span: Span): Span {
  const line = lineStart(text, span.start);
  const lineEnd = endOfLine(text, span.end);
  const eol = eolAt(text, lineEnd);
  if (eol > 0 && blank(text.slice(line, span.start)) && blank(text.slice(span.end, lineEnd))) {
    return { start: line, end: lineEnd + eol };
  }
  return { start: span.start, end: text[span.end] === ' ' ? span.end + 1 : span.end };
}

/**
 * A context block with one declaration, as `blockCut` takes it away again. On lines: each prelude
 * a step deeper than the one around it, every line ended. In a line: `a { b { x: y; } } `.
 */
export function blockText(
  preludes: readonly string[],
  declaration: string,
  lines: { indent: string; eol: string; unit: string } | null,
): string {
  if (lines === null) {
    const open = preludes.map((prelude) => `${prelude} { `).join('');
    return `${open}${declaration}${' }'.repeat(preludes.length)} `;
  }
  const { indent, eol, unit } = lines;
  const depth = preludes.length;
  const opened = preludes.map((prelude, at) => `${indent}${unit.repeat(at)}${prelude} {${eol}`);
  const closed = preludes.map((_prelude, at) => `${indent}${unit.repeat(depth - 1 - at)}}${eol}`);
  return `${opened.join('')}${indent}${unit.repeat(depth)}${declaration}${eol}${closed.join('')}`;
}

/**
 * New blocks in `parent` right before `next` (the start of one of its statements, or its closing
 * brace), `preludes[0]` outermost, with the declaration inside. On lines of their own they get the
 * body's indent (`outer`: the indent of the body's own first line) after one blank line when a
 * statement stands before them; else they go inside the line. `blockCut` takes them away again.
 */
export function insertNested(
  text: string,
  parent: Body,
  outer: string,
  next: number,
  preludes: readonly string[],
  declaration: string,
): ApplyResult {
  // After a last declaration without its `;` a block would not parse.
  if (next === parent.close && parent.dangling) return { refused: 'invalid' };
  const slot = slotBefore(text, parent, next);
  const eol = eolOf(text);
  const insert = slot.lines
    ? (slot.lead ? eol : '') +
      blockText(preludes, declaration, {
        indent: bodyIndent(text, parent, outer),
        eol,
        unit: fileIndent(text),
      })
    : blockText(preludes, declaration, null);
  return inserted(text, slot.at, insert);
}

/**
 * A block's own lines, with the one blank line above it when a statement of `parent` stands
 * before it (what a new block gets); a block inside a line goes with one space after it.
 */
export function blockCut(text: string, parent: Body, nest: { span: Span }): Span {
  const { start, end } = nest.span;
  const line = lineStart(text, start);
  const lineEnd = endOfLine(text, end);
  const eol = eolAt(text, lineEnd);
  if (eol === 0 || !blank(text.slice(line, start)) || !blank(text.slice(end, lineEnd))) {
    return { start, end: text[end] === ' ' ? end + 1 : end };
  }
  const lead = parent.parts.some((part) => part.end <= start);
  const gap = eolBefore(text, line);
  const above = lineStart(text, line - gap);
  const isBlank = gap > 0 && above >= parent.open && blank(text.slice(above, line - gap));
  return { start: lead && isBlank ? above : line, end: lineEnd + eol };
}

/** A body with nothing in it; a comment left there is someone's text, so it is not empty. */
export const emptyBody = (text: string, body: Body): boolean =>
  body.closed && text.slice(body.open, body.close).trim() === '';

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

/**
 * The text without the rule `.className` when it is the class's only rule and its body is empty;
 * `null` when the rule stays. A rule nested in another goes as a block of that rule does.
 */
export function dropEmptyRule(text: string, className: string): ApplyResult | null {
  const rules = classRules(text, className);
  const rule = rules[0];
  if (rules.length !== 1 || rule === undefined || !emptyBody(text, rule)) return null;
  const whole =
    rule.parent === null ? ruleCut(text, rule.view.span) : blockCut(text, rule.parent, rule.view);
  return {
    text: splice(text, whole.start, whole.end, ''),
    changed: [{ start: whole.start, end: whole.start }],
  };
}

/**
 * A new rule at the end of the file, after one blank line, with `body(indent, eol)` as its lines.
 * The file keeps its ending: a final line ending when it had one (or was empty), none when it had
 * none, so that dropping the rule gives the file back exactly.
 */
export function createRule(
  text: string,
  className: string,
  body: (indent: string, eol: string) => string,
): ApplyResult {
  const eol = eolOf(text);
  const ended = text === '' || eolBefore(text, text.length) > 0;
  const lead = text === '' ? '' : ended ? eol : eol + eol;
  const rule = `.${className} {${eol}${body(fileIndent(text), eol)}}`;
  const start = text.length + lead.length;
  return {
    text: text + lead + rule + (ended ? eol : ''),
    changed: [{ start, end: start + rule.length }],
  };
}

/**
 * The top-level rule a new class nests in: of the classes whose name, followed by `__` or `--`,
 * starts `className`, the longest; of its rules, the last. `undefined` when there is none.
 */
function hostOf(text: string, className: string): Found | undefined {
  let host: Found | undefined;
  for (const rule of readRules(text)) {
    const name = rule.view.className;
    if (rule.parent !== null || className.length <= name.length + 2) continue;
    if (!className.startsWith(`${name}__`) && !className.startsWith(`${name}--`)) continue;
    if (host === undefined || name.length >= host.view.className.length) host = rule;
  }
  return host;
}

/**
 * The rule of a class that has none yet, with the declaration inside `preludes` (the blocks of a
 * width or a state; none for the base). `plans__switch` in a file with a top-level `.plans` is
 * written at the end of that rule's body as `&__switch { … }`, in its indent and line endings;
 * any other name, or a host rule that cannot take a block, gets a top-level rule at the end of
 * the file. `dropEmptyRule` takes either away again.
 */
export function newRule(
  text: string,
  className: string,
  preludes: readonly string[],
  declaration: string,
): ApplyResult {
  const host = hostOf(text, className);
  if (host?.closed === true) {
    const inside = [`&${className.slice(host.view.className.length)}`, ...preludes];
    const nested = insertNested(text, host, host.outer, host.close, inside, declaration);
    if ('text' in nested) return nested;
  }
  return createRule(text, className, (indent, eol) =>
    preludes.length === 0
      ? `${indent}${declaration}${eol}`
      : blockText(preludes, declaration, { indent, eol, unit: indent }),
  );
}
