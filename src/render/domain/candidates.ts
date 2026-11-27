// Class names a utility build looks for, read from source text without a parser. Tailwind ignores
// a word that is no class, so a generous split is enough (docs/spikes/07-tailwind-v4.md).

// The file itself, not shared/index.ts: the Tailwind worker loads this module and has no use for zod.
import { themePathOf, themeVariable } from '../../shared/values/theme-path.ts';

/** Characters that end a candidate. `[`, `]`, `:`, `/`, `.`, `#`, `%` and `!` stay: `md:p-[13px]`, `w-1/2`. */
const SEPARATORS = /[\s"'`{}()<>=;,]+/;
const LETTER = /[A-Za-z]/;

/** Every token of the text that has a letter, unique, in the order first seen. */
export function classCandidates(text: string): string[] {
  const seen = new Set<string>();
  for (const token of text.split(SEPARATORS)) {
    if (LETTER.test(token)) seen.add(token);
  }
  return [...seen];
}

export type CandidateLimits = { files: number; chars: number };

/** Enough for a large component library; a huge package cannot stall the build. */
export const CANDIDATE_LIMITS: CandidateLimits = { files: 2000, chars: 20 * 1024 * 1024 };

/**
 * Candidates of the files in order. Reading stops before the file that would pass `limits.files`
 * files or `limits.chars` characters in total; a file `read` cannot read is skipped.
 */
export function fileCandidates(
  files: string[],
  read: (file: string) => string | undefined,
  limits: CandidateLimits = CANDIDATE_LIMITS,
): string[] {
  const seen = new Set<string>();
  let count = 0;
  let chars = 0;
  for (const file of files) {
    if (count >= limits.files) break;
    const text = read(file);
    if (text === undefined) continue;
    if (chars + text.length > limits.chars) break;
    count += 1;
    chars += text.length;
    for (const candidate of classCandidates(text)) seen.add(candidate);
  }
  return [...seen];
}

/**
 * A candidate worth reporting when it produces no CSS: it has `-` or `:`, starts like a utility
 * (`p-4`, `-mt-2`, `!p-0`, `@md:flex`, `*:p-2`, `[mask:none]`) and does not end in `:`, which
 * TypeScript's `name:` and `prop?:` do.
 */
export const looksLikeClass = (candidate: string): boolean =>
  /[-:]/.test(candidate) && /^[a-z!@*[-]/.test(candidate) && !candidate.endsWith(':');

const hexEscape = (code: number): string => `\\${code.toString(16)} `;

/** A class name as a CSS selector writes it: the rules of `CSS.escape`. */
export function escapeClass(name: string): string {
  const chars = [...name];
  return chars
    .map((char, index) => {
      const code = char.codePointAt(0) ?? 0;
      const digit = code >= 0x30 && code <= 0x39;
      if (code === 0) return '�';
      if ((code >= 0x01 && code <= 0x1f) || code === 0x7f) return hexEscape(code);
      if (digit && (index === 0 || (index === 1 && chars[0] === '-'))) return hexEscape(code);
      if (char === '-' && index === 0 && chars.length === 1) return '\\-';
      if (code >= 0x80 || /[A-Za-z0-9_-]/.test(char)) return char;
      return `\\${char}`;
    })
    .join('');
}

/** True when the CSS has a rule for the class: its selector, not followed by more of a name. */
export function hasClassRule(css: string, candidate: string): boolean {
  const selector = `.${escapeClass(candidate)}`;
  let at = css.indexOf(selector);
  while (at >= 0) {
    const next = css[at + selector.length] ?? '';
    if (!/[A-Za-z0-9_\\-]/.test(next) && (next.codePointAt(0) ?? 0) < 0x80) return true;
    at = css.indexOf(selector, at + 1);
  }
  return false;
}

/** The class-like candidates the CSS has no rule for, sorted: the classes that produced nothing. */
export const unbuiltClasses = (candidates: string[], css: string): string[] =>
  candidates
    .filter((candidate) => looksLikeClass(candidate) && !hasClassRule(css, candidate))
    .sort();

const CUSTOM_PROPERTY = /^--[A-Za-z0-9_-]+$/;

/**
 * What a build must define even when no class uses it. A rule no element has uses each custom
 * property, so Tailwind 4 emits theme variables no class uses. Each theme path
 * (`theme(colors.primary)`) becomes its variable (`themeVariable`), filled by the project's
 * Tailwind; it is declared on the body too, since a theme's attributes, which switch the variables
 * a theme value reads, are there (why the token sheet uses `:root, body`). Any other name is left
 * out, so nothing else can be written into the stylesheet.
 */
export function probeRule(names: string[]): string {
  const unique = [...new Set(names)];
  const properties = unique.filter((name) => CUSTOM_PROPERTY.test(name));
  const paths = unique.flatMap((name) => themePathOf(name) ?? []);
  const lines: string[] = [];
  if (properties.length > 0) {
    lines.push(
      '.kitvas-probe {',
      ...properties.map((name, index) => `  --kitvas-probe-${index}: var(${name});`),
      '}',
    );
  }
  if (paths.length > 0) {
    lines.push(
      ':root, body {',
      ...paths.map((path) => `  ${themeVariable(path)}: theme('${path}');`),
      '}',
    );
  }
  return lines.length === 0 ? '' : [...lines, ''].join('\n');
}
