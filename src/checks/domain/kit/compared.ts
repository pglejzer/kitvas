// How each component of a `code` kit was compared (`verify.json`, `compared`). Pure.

import type { ComparedEntry, LookEntry, OriginalEntry } from './kit-verify.ts';

/** A component whose styles could not be drawn, or drawn only in part: it is read, not measured. */
export type Drawn = { component: string; why: 'notDrawn' | 'partial' };

/** The component of an example key, `Button.1`. */
const componentOf = (key: string): string => key.slice(0, key.lastIndexOf('.'));

/**
 * `app` when one of its examples was scored against a picture from the app; else `code` when one
 * was compared with its drawn original in numbers; else `read`, with the reason.
 */
export function comparedLevels(
  kit: { components: { name: string }[] },
  look: LookEntry[],
  originals: OriginalEntry[],
  drawn: Drawn[],
): ComparedEntry[] {
  const scored = new Set(look.map((entry) => componentOf(entry.key)));
  const measured = new Set(originals.map((entry) => componentOf(entry.key)));
  return kit.components.map(({ name }): ComparedEntry => {
    if (scored.has(name)) return { component: name, level: 'app' };
    if (measured.has(name)) return { component: name, level: 'code' };
    return {
      component: name,
      level: 'read',
      why: drawn.find((entry) => entry.component === name)?.why ?? 'none',
    };
  });
}
