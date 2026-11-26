// What the Source strip at the bottom of Properties says (plan 18f, task 2; spec S4.6 item 7): the
// file and line of the element's opening tag, that tag as one line of code, and the file and line
// of its class rule. Each place copies as `path:line`. Pure over the inspect answer
// (`source-strip.ts` draws).

import type { Inspect } from '../../../../../src/studio/api/edit/edit-schemas.ts';
import { placeOf } from './header.ts';

/** A place in a file: its name for the eye, its line, and the text a click copies. */
export type Place = { name: string; line: number | null; copy: string };

export type SourceLines = {
  file: Place;
  /** The opening tag as the answer carries it; `null` from a studio that sends none. */
  tag: string | null;
  /** The class rule's place and its class; `null` when the element has no rule. */
  rule: (Place & { className: string | null }) | null;
};

/** `src/tsx/sections/Pricing.tsx` is `Pricing.tsx`. */
export const fileName = (path: string): string => path.slice(path.lastIndexOf('/') + 1);

export function sourceLines(
  view: Pick<Inspect, 'file' | 'line' | 'source' | 'styleClass'>,
): SourceLines {
  const line = view.line ?? null;
  const file: Place = { name: fileName(view.file), line, copy: placeOf(view) };
  const source = view.source;
  if (source === undefined) return { file, tag: null, rule: null };
  const { ruleFile, ruleLine } = source;
  const rule =
    ruleFile === null || ruleLine === null
      ? null
      : {
          name: fileName(ruleFile),
          line: ruleLine,
          copy: `${ruleFile}:${ruleLine}`,
          className: view.styleClass?.className ?? null,
        };
  return { file, tag: source.tag === '' ? null : source.tag, rule };
}
