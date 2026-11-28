// How one class of a Tailwind draft is read and put together (plan 29): its variants, its utility,
// and the project's prefix where its version writes it. Tailwind 3 writes the prefix after the
// variants, behind the important mark and a negative value's minus (`md:!-tw-mt-2`), and never on
// an arbitrary property (`[outline-style:none]`); Tailwind 4 writes it before every variant
// (`tw:md:p-6`). Types only besides, so the studio reads it through `utilities.ts` (ADR 0080).

import type { TailwindTheme } from '../../../shared/values/tailwind-file.ts';

/** What a class is read by: the project's Tailwind major and the prefix its classes carry. */
export type UtilityPrefix = Pick<TailwindTheme, 'version' | 'prefix'>;

/** A class read without a theme: Tailwind 4 with no prefix. */
export const NO_PREFIX: UtilityPrefix = { version: 4, prefix: '' };

/** The important mark and a negative value's minus, in front of a Tailwind 3 utility: `!-`. */
const MARKS = /^!?-?/;

/** Tailwind 3 takes the prefix on every utility but an arbitrary property. */
const takesPrefix = (utility: string): boolean => !utility.startsWith('[');

/**
 * `md:hover:p-6` is `p-6` under `md` and `hover`; a `:` inside `[…]` or `(…)` is the value's.
 * `base` is the utility without the project's prefix, its marks kept (`!-mt-2`). `null` for a
 * class that lacks the prefix: the project's Tailwind makes nothing of it.
 */
export function splitUtility(
  className: string,
  tailwind: UtilityPrefix,
): { variants: string[]; base: string } | null {
  const { version, prefix } = tailwind;
  const first = version === 4 && prefix !== '';
  if (first && !className.startsWith(prefix)) return null;
  const text = first ? className.slice(prefix.length) : className;
  const variants: string[] = [];
  let depth = 0;
  let from = 0;
  for (let at = 0; at < text.length; at += 1) {
    const char = text.charAt(at);
    if (char === '[' || char === '(') depth += 1;
    else if ((char === ']' || char === ')') && depth > 0) depth -= 1;
    else if (char === ':' && depth === 0) {
      variants.push(text.slice(from, at));
      from = at + 1;
    }
  }
  const base = text.slice(from);
  if (version === 4 || prefix === '') return { variants, base };
  const marks = MARKS.exec(base)?.[0] ?? '';
  const rest = base.slice(marks.length);
  if (!takesPrefix(rest)) return { variants, base };
  return rest.startsWith(prefix)
    ? { variants, base: `${marks}${rest.slice(prefix.length)}` }
    : null;
}

/** The class of `base` (a utility with its marks) under `variants` (`md:hover:`), prefixed. */
export function joinUtility(variants: string, base: string, tailwind: UtilityPrefix): string {
  const { version, prefix } = tailwind;
  if (version === 4) return `${prefix}${variants}${base}`;
  const marks = MARKS.exec(base)?.[0] ?? '';
  const rest = base.slice(marks.length);
  return takesPrefix(rest) ? `${variants}${marks}${prefix}${rest}` : `${variants}${base}`;
}

/** The utility itself: `!p-4` and `p-4!` are important, `-mt-2` is a negative margin. */
export const coreOf = (base: string): string =>
  base.replace(/^!/, '').replace(/!$/, '').replace(/^-/, '');
