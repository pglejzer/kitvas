// Compare mode: which elements differ between two versions' answers to `measure`, and the
// sentence that says so.

import type { ElementSnapshot } from '../../channel/protocol.ts';

/** Element ids, each once: in the newer version's order for changed and added, else the older. */
export type ElementDiff = { changed: string[]; added: string[]; removed: string[] };

/** Message templates from the summary's `data-` attributes, each with `{count}`. */
export type SummaryTexts = { changed: string; added: string; removed: string; same: string };

/** Sizes closer than this are the same: rounding, not a change. */
const SIZE_SLACK_PX = 1;

/** One id can mark many elements (a list item drawn in a loop); they stay in document order. */
function byId(items: readonly ElementSnapshot[]): Map<string, ElementSnapshot[]> {
  const groups = new Map<string, ElementSnapshot[]>();
  for (const item of items) {
    const group = groups.get(item.id);
    if (group) group.push(item);
    else groups.set(item.id, [item]);
  }
  return groups;
}

function sameElement(a: ElementSnapshot, b: ElementSnapshot): boolean {
  return (
    a.text === b.text &&
    a.style === b.style &&
    Math.abs(a.width - b.width) <= SIZE_SLACK_PX &&
    Math.abs(a.height - b.height) <= SIZE_SLACK_PX
  );
}

/** The same number of elements, the n-th of one like the n-th of the other. */
function sameGroup(a: readonly ElementSnapshot[], b: readonly ElementSnapshot[]): boolean {
  if (a.length !== b.length) return false;
  return a.every((item, index) => {
    const other = b[index];
    return other !== undefined && sameElement(item, other);
  });
}

/**
 * Changed: an id in both versions whose text, style or size (by more than 1 px) differs, or
 * whose number of elements does. Added: only in `after`. Removed: only in `before`.
 */
export function diffElements(
  before: readonly ElementSnapshot[],
  after: readonly ElementSnapshot[],
): ElementDiff {
  const older = byId(before);
  const newer = byId(after);
  const changed: string[] = [];
  const added: string[] = [];
  for (const [id, group] of newer) {
    const earlier = older.get(id);
    if (earlier === undefined) added.push(id);
    else if (!sameGroup(earlier, group)) changed.push(id);
  }
  const removed = [...older.keys()].filter((id) => !newer.has(id));
  return { changed, added, removed };
}

const fill = (template: string, count: number): string =>
  template.split('{count}').join(String(count));

/** "3 changed, 1 added, 2 removed", leaving out the zeros; `same` when nothing differs. */
export function compareSummary(diff: ElementDiff, texts: SummaryTexts): string {
  const parts: [number, string][] = [
    [diff.changed.length, texts.changed],
    [diff.added.length, texts.added],
    [diff.removed.length, texts.removed],
  ];
  if (parts.every(([count]) => count === 0)) return texts.same;
  return parts
    .filter(([count]) => count > 0)
    .map(([count, template]) => fill(template, count))
    .filter((text) => text !== '')
    .join(', ');
}
