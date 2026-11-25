// The Source strip of Properties (plan 18f, task 2; spec S4.6 item 7): the element's opening tag
// as one line of text, and the file and line where its class rule starts. Pure over the texts the
// inspect read; `inspect.ts` fills the answer's `source` with it.

import { classRules } from '../domain/style/scss-rules.ts';
import type { Span } from '../domain/types.ts';

/** The most of the opening tag the answer carries (`InspectSchema.source.tag`). */
export const MAX_SOURCE_TAG = 200;

/** `InspectSchema.source`: the tag as one line, and the class rule's file and 1-based line. */
export type InspectSource = { tag: string; ruleFile: string | null; ruleLine: number | null };

/** The 1-based line `at` is on. */
export function lineAt(text: string, at: number): number {
  let line = 1;
  for (let i = text.indexOf('\n'); i >= 0 && i < at; i = text.indexOf('\n', i + 1)) line += 1;
  return line;
}

const isHighSurrogate = (code: number): boolean => code >= 0xd800 && code <= 0xdbff;

/**
 * A tag as one line: each run of white space (line breaks too) becomes one space, the ends are
 * trimmed, and a longer text is cut to `max` characters with an ellipsis, never through a
 * character written as two code units.
 */
export function oneLine(text: string, max = MAX_SOURCE_TAG): string {
  const flat = text.replace(/\s+/g, ' ').trim();
  if (flat.length <= max) return flat;
  let end = Math.max(0, max - 1);
  if (end > 0 && isHighSurrogate(flat.charCodeAt(end - 1))) end -= 1;
  return `${flat.slice(0, end)}…`;
}

/**
 * The strip's facts: the opening tag (`tag`, its span in `tsx`), and where the first rule of
 * `className` starts in the section's SCSS. `className` is `null` when the element has no class
 * of its own yet; no rule of it, or no SCSS file, gives `null` for both rule fields.
 */
export function sourceOf(input: {
  tsx: string;
  tag: Span;
  scssFile: string | null;
  scss: string | undefined;
  className: string | null;
}): InspectSource {
  const tag = oneLine(input.tsx.slice(input.tag.start, input.tag.end));
  const { scss, scssFile, className } = input;
  if (scss === undefined || scssFile === null || className === null) {
    return { tag, ruleFile: null, ruleLine: null };
  }
  const first = classRules(scss, className)[0];
  if (first === undefined) return { tag, ruleFile: null, ruleLine: null };
  return { tag, ruleFile: scssFile, ruleLine: lineAt(scss, first.view.span.start) };
}
