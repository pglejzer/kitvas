// What a subtree takes with it when it leaves its place (spec 4b, decisions 6 and 9; plan 14,
// task B4): the SCSS rules of the classes it writes, and the check that every name it reads still
// names the same thing where it lands. Nothing here reads a file: the request pipeline hands in
// the texts and writes what comes back with the rest of the request, all or nothing.
//
// The sections' SCSS files end up in one stylesheet, so a rule styles its class wherever the class
// is written. Carrying the rule keeps a section's styles in its own file (a section copied into
// another draft takes them along); it never changes the page's look by itself. That is also why a
// rule that cannot be carried (a target without SCSS) simply stays where it is.

import { elementSpan, freeIdentifiers, functionBodyOf } from '../../domain/structure/subtree.ts';
import { listRules, readRule } from '../../domain/style/apply-scss.ts';
import { eolAt, eolBefore } from '../../domain/style/scss-reader.ts';
import { newlineOf, withNewline } from '../../domain/tsx/format.ts';
import { usedKitComponents } from '../../domain/tsx/kit-imports.ts';
import { openingTags, readTag } from '../../domain/tsx/tsx-reader.ts';
import type { Refusal, RuleView, Span, TagView } from '../../domain/types.ts';

export type CarryInput = {
  /** The TSX the subtree leaves, as it is before the move. */
  sourceText: string;
  /** The source section's SCSS; `null` when it has none (a sketch). */
  sourceScss: string | null;
  /** The TSX the subtree goes into. */
  targetText: string;
  targetScss: string | null;
  /** The moved element in `sourceText`: its `<` to the end of its closing tag. */
  subtree: Span;
  /** The `<` of the anchor in `targetText`. */
  targetAt: number;
  /** The kit's component names: when given, the scope rule (`checkScope`) is checked first. */
  kitNames?: ReadonlySet<string> | undefined;
};

/** The new SCSS texts; each is the input itself when nothing changed there (`null` stays `null`). */
export type Carried = { targetScss: string | null; sourceScss: string | null };

// ---- The classes a TSX text writes ---------------------------------------------------------------

const splitClasses = (value: string): string[] => value.split(/\s+/).filter((name) => name !== '');

const escapeRegExp = (text: string): string => text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

/** The opening tags whose `<` lies inside `span`, in source order (JSX in props and `{…}` too). */
function tagsIn(text: string, span: Span): TagView[] {
  const tags: TagView[] = [];
  for (const at of openingTags(text)) {
    if (at < span.start || at >= span.end) continue;
    const tag = readTag(text, at);
    if (typeof tag !== 'string') tags.push(tag);
  }
  return tags;
}

/** The classes the tags in `span` write in a string `className`, in source order, each once. */
function writtenClasses(text: string, span: Span): string[] {
  const found = new Set<string>();
  for (const tag of tagsIn(text, span)) {
    if (tag.className?.kind !== 'string') continue;
    for (const name of splitClasses(tag.className.value)) found.add(name);
  }
  return [...found];
}

const QUOTED = /"([^"\n]*)"|'([^'\n]*)'|`([^`]*)`/g;

/**
 * Whether the TSX still writes `name` as a class: in a string `className`, or in a string inside a
 * `className={…}`. A `className` built from a variable may hold any class, so in a file that has
 * one, any mention of the name as a word keeps the rule: a rule left behind costs nothing, a rule
 * taken away unstyles an element.
 */
function stillWrites(text: string, name: string): boolean {
  let computed = false;
  for (const tag of tagsIn(text, { start: 0, end: text.length })) {
    const written = tag.className;
    if (written === null) continue;
    if (written.kind === 'string') {
      if (splitClasses(written.value).includes(name)) return true;
      continue;
    }
    const strings = [...written.source.matchAll(QUOTED)];
    const chunks = strings.map((match) => match[1] ?? match[2] ?? match[3] ?? '');
    if (chunks.some((chunk) => splitClasses(chunk).includes(name))) return true;
    const code = written.source.replace(QUOTED, '');
    if (written.source.includes('${') || /[A-Za-z_$]/.test(code)) computed = true;
  }
  return computed && new RegExp(`(?<![\\w-])${escapeRegExp(name)}(?![\\w-])`).test(text);
}

// ---- Rules ---------------------------------------------------------------------------------------

const ruleText = (scss: string, rule: RuleView): string =>
  scss.slice(rule.span.start, rule.span.end);

/** A rule as it reads, whatever its line endings and spacing: two rules alike style alike. */
const canonical = (rule: string): string =>
  rule
    .replace(/\s+/g, ' ')
    .replace(/\s*([{};])\s*/g, '$1')
    .replace(/;}/g, '}')
    .trim();

/** The first indent a line of the SCSS has, as the unit a copied rule is written in. */
const indentOf = (scss: string): string | null => /^([ \t]+)\S/m.exec(scss)?.[1] ?? null;

/** Each line's leading `from` units written as `to` units; the rest of the indent stays. */
function retab(rule: string, from: string, to: string): string {
  if (from === to) return rule;
  return rule.replace(/^[ \t]+/gm, (lead) => {
    let depth = 0;
    while (lead.startsWith(from, depth * from.length)) depth += 1;
    return to.repeat(depth) + lead.slice(depth * from.length);
  });
}

/**
 * The rule at the end of the file after one blank line. The file keeps its ending, as a rule the
 * 4a editor creates does: a final line ending when it had one, none when it had none.
 */
function appendRule(scss: string, rule: string, eol: string): string {
  if (scss === '') return `${rule}${eol}`;
  const last = eolBefore(scss, scss.length);
  if (last === 0) return `${scss}${eol}${eol}${rule}`;
  const blankLine = eolBefore(scss, scss.length - last) > 0;
  return `${scss}${blankLine ? '' : eol}${rule}${eol}`;
}

/**
 * The text without the rule: its lines and one blank line beside it (the one before it, or the
 * one after it when the rule opens the file). A rule that ends the file without a line ending
 * takes the line ending, and the blank line, in front of it.
 */
function cutRule(scss: string, span: Span): string {
  let { start, end } = span;
  const after = eolAt(scss, end);
  const before = eolBefore(scss, start);
  if (after > 0) {
    end += after;
    if (before > 0 && eolBefore(scss, start - before) > 0) start -= before;
    else if (start === 0) end += eolAt(scss, end);
  } else if (end === scss.length && before > 0) {
    start -= before;
    start -= eolBefore(scss, start);
  }
  return scss.slice(0, start) + scss.slice(end);
}

/** The SCSS names `.name` outside its own rule: an `@extend`, a compound or a nested selector. */
function mentionedElsewhere(scss: string, rule: RuleView): boolean {
  const rest = scss.slice(0, rule.span.start) + scss.slice(rule.span.end);
  return new RegExp(`\\.${escapeRegExp(rule.className)}(?![\\w-])`).test(rest);
}

type Copied = { scss: string | null; carried: string[] } | { refused: Refusal };

/**
 * The source's rules of `classes`, added to the end of the target in the order the source writes
 * them. `carried`: the classes whose rule the target has now, copied or already there alike. A
 * class with two rules on either side is `ambiguous`; another rule of the same name in the target
 * is a `class-clash`.
 */
function copyRules(
  classes: readonly string[],
  sourceScss: string | null,
  targetScss: string | null,
): Copied {
  if (sourceScss === null || targetScss === null || classes.length === 0) {
    return { scss: targetScss, carried: [] };
  }
  const wanted = new Set(classes);
  const rules = listRules(sourceScss).filter((rule) => wanted.has(rule.className));
  const eol = targetScss.includes('\n') ? newlineOf(targetScss) : newlineOf(sourceScss);
  const unit = indentOf(sourceScss) ?? '  ';
  const targetUnit = indentOf(targetScss) ?? unit;
  let scss = targetScss;
  const carried: string[] = [];
  for (const rule of rules) {
    if (carried.includes(rule.className)) return { refused: 'ambiguous' };
    const there = readRule(scss, rule.className);
    if (there === 'ambiguous') return { refused: 'ambiguous' };
    const text = ruleText(sourceScss, rule);
    if (there === null) {
      scss = appendRule(scss, retab(withNewline(text, eol), unit, targetUnit), eol);
    } else if (canonical(ruleText(scss, there)) !== canonical(text)) {
      return { refused: 'class-clash' };
    }
    carried.push(rule.className);
  }
  return { scss, carried };
}

/**
 * A move of `subtree` out of its section (decision 9): every class it writes in a string
 * `className` whose rule the source SCSS has is copied to the end of the target SCSS, unless
 * the target has that rule already, and the rule leaves the source when nothing left there
 * writes the class and no other selector of the source names it.
 */
export function carryAcross(input: CarryInput): Carried | { refused: Refusal } {
  const { sourceText, sourceScss, targetText, targetScss, subtree, targetAt, kitNames } = input;
  if (kitNames !== undefined) {
    const scope = checkScope(sourceText, subtree, targetText, targetAt, kitNames);
    if (scope !== null) return { refused: scope };
  }
  const copied = copyRules(writtenClasses(sourceText, subtree), sourceScss, targetScss);
  if ('refused' in copied) return copied;
  const left = sourceText.slice(0, subtree.start) + sourceText.slice(subtree.end);
  let source = sourceScss;
  for (const name of copied.carried) {
    if (source === null || stillWrites(left, name)) continue;
    const rule = readRule(source, name);
    if (rule === null || rule === 'ambiguous' || mentionedElsewhere(source, rule)) continue;
    source = cutRule(source, rule.span);
  }
  return { targetScss: copied.scss, sourceScss: source };
}

/**
 * A copy of `source` (a copied or cut subtree pasted, a duplicate) into another section: the
 * rules of its classes come along from the SCSS of the file it was copied from (`insertElement`'s
 * `from`), and that SCSS stays as it is.
 */
export function carryCopy(input: {
  source: string;
  fromScss: string | null;
  targetScss: string | null;
}): { targetScss: string | null } | { refused: Refusal } {
  const whole = { start: 0, end: input.source.length };
  const copied = copyRules(writtenClasses(input.source, whole), input.fromScss, input.targetScss);
  return 'refused' in copied ? copied : { targetScss: copied.scss };
}

// ---- Scope ---------------------------------------------------------------------------------------

const sameSpan = (a: Span | null, b: Span | null): boolean =>
  a === null || b === null ? a === b : a.start === b.start && a.end === b.end;

/** The capitalised tag roots of the tags in `span`: `Card` for `<Card>` and `<Card.Header>`. */
function componentRoots(text: string, span: Span): Set<string> {
  const roots = new Set<string>();
  for (const tag of tagsIn(text, span)) {
    const root = tag.name.split(/[.:-]/)[0] ?? '';
    if (/^[A-Z]/.test(root)) roots.add(root);
  }
  return roots;
}

/**
 * Whether the subtree in `span` names only what exists anywhere (decision 6): kit components (the
 * kit import follows use, decision 8), HTML tags and literals. `kitInSource`: the kit components
 * the subtree's own file takes from the kit, so a local `Card` is not taken for the kit's.
 * `target`: the text it lands in, whose own binding of a kit name would take the tag over.
 */
function portable(
  text: string,
  span: Span,
  kitNames: ReadonlySet<string>,
  kitInSource: ReadonlySet<string>,
  target: string | null,
): Refusal | null {
  const roots = componentRoots(text, span);
  // A name read in an expression (`{plan.name}`, the `motion` of `<motion.div>`) is a variable of
  // the place it was written in.
  if (freeIdentifiers(text, span).some((name) => !roots.has(name))) return 'scope';
  for (const root of roots) {
    if (!kitNames.has(root) || !kitInSource.has(root)) return 'unknown-component';
  }
  if (target === null || roots.size === 0) return null;
  // The kit import's reader knows what the target binds itself: ask it about one use of each.
  const probe = `${target}\n;${[...roots].map((root) => `<${root} />;`).join('')}`;
  const free = usedKitComponents(probe, kitNames);
  return [...roots].every((root) => free.has(root)) ? null : 'scope';
}

/**
 * Whether the subtree `subtree` of `text` may go to `targetAt` in `targetText` (decision 6). In
 * its own function body (`functionBodyOf`) anything goes: every name it reads is there. Into
 * another function or another file it may name only kit components, HTML tags and literals:
 * another name is `scope`, a capitalised tag that is not the kit's is `unknown-component`.
 */
export function checkScope(
  text: string,
  subtree: Span,
  targetText: string,
  targetAt: number,
  kitNames: ReadonlySet<string>,
): Refusal | null {
  const sameFile = text === targetText;
  if (sameFile && sameSpan(functionBodyOf(text, subtree.start), functionBodyOf(text, targetAt))) {
    return null;
  }
  return portable(text, subtree, kitNames, usedKitComponents(text, kitNames), targetText);
}

/** The one element or fragment `source` is, from its `<`; `null` for anything else. */
function wholeElement(source: string): Span | null {
  const start = source.length - source.trimStart().length;
  if (source.charAt(start) !== '<') return null;
  const span = elementSpan(source, start);
  return span !== null && source.slice(span.end).trim() === '' ? span : null;
}

/** The target holds the pasted element itself in the function body of `at`: a copy from there. */
function copiedHere(element: string, target: { text: string; at: number }): boolean {
  const body = functionBodyOf(target.text, target.at);
  let at = target.text.indexOf(element);
  while (at >= 0) {
    const span = elementSpan(target.text, at);
    if (span?.end === at + element.length && sameSpan(functionBodyOf(target.text, at), body)) {
      return true;
    }
    at = target.text.indexOf(element, at + 1);
  }
  return false;
}

/**
 * Whether pasted JSX (`insertElement`'s `source`) may go in (decision 6): it must read as one
 * element or one fragment (else `invalid`), and it names only kit components, HTML tags and
 * literals, as a move into another file. With `target` (its text and the anchor's `<`), a copy
 * of an element the same function body still holds may read that body's names, and a kit name
 * the target binds itself is refused. Compiling the result is the pipeline's own check.
 */
export function checkPaste(
  source: string,
  kitNames: ReadonlySet<string>,
  target?: { text: string; at: number },
): Refusal | null {
  const span = wholeElement(source);
  if (span === null) return 'invalid';
  if (target !== undefined && copiedHere(source.slice(span.start, span.end), target)) return null;
  return portable(source, span, kitNames, kitNames, target?.text ?? null);
}
