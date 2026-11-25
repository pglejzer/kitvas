// The marks a draft page sends to its prototype: in compare mode an outline on each changed or
// added element, in every lens. Until plan 19 a numbered dot on each finding that names an element
// came first; those are the Checks lens's pins now (`client/studio/lens/pins/checks.ts`, plan 19,
// call 2), so `marks` carries compare's outlines alone.

import { MAX_ITEMS, type Mark } from '../../channel/protocol.ts';
import type { ElementDiff } from './diff.ts';

export const CHANGED_LABEL = '~';
export const ADDED_LABEL = '+';

/**
 * Compare's marks: `~` on changed and `+` on added elements; none without a diff. At most
 * `MAX_ITEMS`: the frame refuses a longer list whole.
 */
export function pageMarks(diff: ElementDiff | undefined): Mark[] {
  const marks: Mark[] = [];
  for (const id of diff?.changed ?? []) marks.push({ id, label: CHANGED_LABEL, tone: 'changed' });
  for (const id of diff?.added ?? []) marks.push({ id, label: ADDED_LABEL, tone: 'added' });
  return marks.slice(0, MAX_ITEMS);
}
