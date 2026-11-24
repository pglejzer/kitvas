// Element identity across a change (spec 4b, decision 7; plan 14, task B2). Every write is a set
// of splices, so each element's old `<` has a new place, or none when it was removed. With the
// compiled sites before and after, that gives old id → new id for every element of the file.

import { offsetOf } from '../tsx/tsx-reader.ts';
import type { OffsetMap } from '../types.ts';

/** An element of a compiled file, as `render`'s `elementIds` gives it (1-based line and column). */
export type SiteId = { id: string; line: number; column: number; tag: string };

/** The offset of a site's `<` in `text`; `null` when the site does not point at one. */
function startOf(text: string, site: SiteId): number | null {
  const at = offsetOf(text, site.line, site.column);
  return at >= 0 && text[at] === '<' ? at : null;
}

/**
 * Old id → new id for the elements whose id changed. An element the change removed, or whose tag
 * at the new place differs, is left out; ids that stayed the same are left out.
 *
 * An id can be a new id here without being an old one (the element that had it was removed, or a
 * sibling took its place): whoever holds that id for the removed element must drop it.
 */
export function renameMap(
  before: readonly SiteId[],
  after: readonly SiteId[],
  beforeText: string,
  afterText: string,
  moved: OffsetMap,
): Record<string, string> {
  // Each `<` of the new text holds one element at most, so the lookup by offset is exact.
  const afterAt = new Map<number, SiteId>();
  for (const site of after) {
    const at = startOf(afterText, site);
    if (at !== null) afterAt.set(at, site);
  }
  const renames: Record<string, string> = {};
  for (const site of before) {
    const at = startOf(beforeText, site);
    if (at === null) continue;
    const to = moved(at);
    if (to === null) continue;
    const found = afterAt.get(to);
    if (found === undefined || found.tag !== site.tag || found.id === site.id) continue;
    renames[site.id] = found.id;
  }
  return renames;
}
