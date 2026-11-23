// The ds check of a Tailwind draft's classes: they come from the kit's theme, not written by hand.

import { z } from '../../shared/index.ts';
import type { Message, RawFinding, Severity } from './finding.ts';
import { codeLines } from './styles.ts';

export type TailwindInput = {
  /** Path inside the draft version: `src/tsx/sections/Hero.tsx`. */
  file: string;
  text: string;
  /** Classes the build's Tailwind run made no CSS for (`build/json/tailwind.json`). */
  unknown: string[];
};

/** A class attribute up to its value: `className=`, `contentClassName=`. */
const CLASS_ATTRIBUTE = /\b(?:className|[a-z][A-Za-z0-9]*ClassName)\s*=\s*/g;
/** A call of a class helper up to its arguments. */
const CLASS_CALL = /\b(?:cn|clsx)\s*\(/g;
/** A value Tailwind paints as a colour. */
const COLOUR = /^(?:#|(?:rgba?|hsla?|hwb|lab|lch|oklab|oklch|color)\()/i;
/** A type hint at the start of a bracketed value: `bg-[color:var(--x)]`, `[mask-type:alpha]`. */
const TYPE_HINT = /^[a-z][a-z-]*:/;
const OPENERS = '([{';
const CLOSERS = ')]}';
/** A class in a selector: `.hero`, `.hero__title`. */
const CLASS_SELECTOR = /\.(-?[A-Za-z_][\w-]*)/g;
/** A class made from its parent rule's: `&-title`, `&__item`. */
const PARENT_SUFFIX = /&([\w-]+)/g;

const TailwindFileSchema = z.object({ schemaVersion: z.literal(1), unknown: z.array(z.string()) });

/** A string or template literal. Offsets in `text` are offsets in the source from `start` on. */
type Literal = { start: number; text: string };
type Collect = (literal: Literal) => void;

/** The `unknown` list of build/json/tailwind.json; none when the file is missing or of another shape. */
export function tailwindUnknown(raw: unknown): string[] {
  const parsed = TailwindFileSchema.safeParse(raw);
  return parsed.success ? parsed.data.unknown : [];
}

/**
 * Reads the literal that opens at `start`, hands it to `collect` and returns the index past it.
 * Escapes and `${…}` parts become spaces, so the text keeps the source's offsets; literals inside
 * `${…}` are collected too. JSX attribute strings have no escapes and may span lines.
 */
function readLiteral(source: string, start: number, jsx: boolean, collect: Collect): number {
  const quote = source.charAt(start);
  let text = '';
  let index = start + 1;
  while (index < source.length) {
    const char = source.charAt(index);
    if (char === quote) break;
    if (char === '\\' && !jsx) {
      text += '  ';
      index += 2;
    } else if (char === '\n' && quote !== '`' && !jsx) {
      break;
    } else if (quote === '`' && source.startsWith('${', index)) {
      const close = scanRegion(source, index + 2, collect);
      const stop = close === -1 ? source.length : close + 1;
      text += ' '.repeat(stop - index);
      index = stop;
    } else {
      text += char;
      index += 1;
    }
  }
  collect({ start: start + 1, text });
  return Math.min(index + 1, source.length);
}

/** Walks code from `from` to the bracket that closes it, collecting its literals. -1 when none does. */
function scanRegion(source: string, from: number, collect: Collect): number {
  let depth = 0;
  let index = from;
  while (index < source.length) {
    const char = source.charAt(index);
    if (char === '"' || char === "'" || char === '`') {
      index = readLiteral(source, index, false, collect);
    } else if (source.startsWith('//', index)) {
      const end = source.indexOf('\n', index);
      index = end === -1 ? source.length : end;
    } else if (source.startsWith('/*', index)) {
      const end = source.indexOf('*/', index + 2);
      index = end === -1 ? source.length : end + 2;
    } else {
      if (OPENERS.includes(char)) depth += 1;
      else if (CLOSERS.includes(char)) {
        if (depth === 0) return index;
        depth -= 1;
      }
      index += 1;
    }
  }
  return -1;
}

/**
 * The literals that hold classes: class attributes (a string, or the literals of the expression in
 * braces) and the arguments of `cn(…)` and `clsx(…)`. Other strings of the file are left alone: an
 * `href` or an `aria-label` is no class, and text in JSX may hold a lone apostrophe.
 */
function classLiterals(text: string): Literal[] {
  const found = new Map<number, Literal>();
  const collect: Collect = (literal) => {
    found.set(literal.start, literal);
  };
  for (const match of text.matchAll(CLASS_ATTRIBUTE)) {
    const at = (match.index ?? 0) + match[0].length;
    const char = text.charAt(at);
    if (char === '"' || char === "'") readLiteral(text, at, true, collect);
    else if (char === '{') scanRegion(text, at + 1, collect);
  }
  // A call inside a class attribute is found twice; the map keeps one of each literal.
  for (const match of text.matchAll(CLASS_CALL)) {
    scanRegion(text, (match.index ?? 0) + match[0].length, collect);
  }
  return [...found.values()].sort((a, b) => a.start - b.start);
}

/** The bracketed value of a class, its variants left out: `md:p-[13px]` -> `13px`. */
function arbitraryValue(token: string): string | undefined {
  let depth = 0;
  let start = 0;
  for (let index = 0; index < token.length; index += 1) {
    const char = token.charAt(index);
    if (char === '[' || char === '(') depth += 1;
    else if (char === ']' || char === ')') depth -= 1;
    else if (char === ':' && depth === 0) start = index + 1;
  }
  const utility = token.slice(start);
  const open = utility.indexOf('[');
  const close = open === -1 ? -1 : utility.indexOf(']', open);
  return close === -1 ? undefined : utility.slice(open + 1, close);
}

function placeOf(text: string, index: number): { line: number; column: number } {
  const before = text.slice(0, index);
  return { line: before.split('\n').length, column: index - before.lastIndexOf('\n') };
}

export function tailwindFindings({ file, text, unknown }: TailwindInput): RawFinding[] {
  const missing = new Set(unknown);
  const findings: RawFinding[] = [];
  const report = (
    index: number,
    rule: string,
    severity: Severity,
    message: Message,
    hint: string,
  ): void => {
    findings.push({
      check: 'ds',
      rule,
      severity,
      file,
      ...placeOf(text, index),
      element: null,
      message,
      hint: { key: hint, params: {} },
      states: [],
      widths: [],
    });
  };

  for (const literal of classLiterals(text)) {
    for (const match of literal.text.matchAll(/\S+/g)) {
      const token = match[0];
      const at = literal.start + (match.index ?? 0);
      const value = arbitraryValue(token);
      if (value !== undefined) {
        // One finding per class: an arbitrary value that also made no CSS is still to be replaced.
        const colour = COLOUR.test(value.replace(TYPE_HINT, ''));
        report(
          at,
          'ds/tailwind-arbitrary',
          colour ? 'fix' : 'review',
          { key: 'checkRule.tailwindArbitrary', params: { value: token } },
          'checkHint.tailwindArbitrary',
        );
      } else if (missing.has(token)) {
        report(
          at,
          'ds/tailwind-unknown',
          'review',
          { key: 'checkRule.tailwindUnknown', params: { name: token } },
          'checkHint.tailwindUnknown',
        );
      }
    }
  }
  return findings;
}

/**
 * The classes a style sheet defines, nested `&-suffix` ones joined to their parent's. A draft may
 * style a section with its own sheet; those classes make no Tailwind CSS and are not unknown.
 */
export function sheetClasses(text: string): string[] {
  const names = new Set<string>();
  const parents: string[][] = [];
  let selector = '';
  for (const char of codeLines(text).join('\n')) {
    if (char === '{') {
      const outer = parents.at(-1) ?? [];
      const own = [
        ...[...selector.matchAll(CLASS_SELECTOR)].map((match) => match[1] ?? ''),
        ...[...selector.matchAll(PARENT_SUFFIX)].flatMap((match) =>
          outer.map((name) => `${name}${match[1] ?? ''}`),
        ),
      ];
      for (const name of own) names.add(name);
      // A rule without classes (`@media`, `&:hover`) passes its parent's on to the rules inside.
      parents.push(own.length > 0 ? own : outer);
      selector = '';
    } else if (char === '}') {
      parents.pop();
      selector = '';
    } else if (char === ';') {
      selector = '';
    } else {
      selector += char;
    }
  }
  return [...names];
}
