// The marks a draft page sends to its prototype: one per numbered finding that names an element,
// and in compare mode one per changed or added element.

import { MAX_ITEMS, type Mark, parseStudioMessage } from '../../channel/protocol.ts';
import type { ElementDiff } from './diff.ts';

/** A note as plain values: `data-element` and `data-tone` of `li.note`, the text of its `.num`. */
export type NoteInfo = { element: string | undefined; label: string; tone: string | undefined };

export const CHANGED_LABEL = '~';
export const ADDED_LABEL = '+';

/** Only for asking the protocol whether a mark is valid; never sent. */
const PROBE_CHANNEL = 'mark-check';

/** The frame would accept it: the protocol's own check decides, so its rules live in one place. */
function accepted(mark: Mark): boolean {
  const message = { kitvas: 1, channel: PROBE_CHANNEL, type: 'marks', marks: [mark] };
  return parseStudioMessage(message, PROBE_CHANNEL) !== undefined;
}

/** Notes without an element, or with an id or number the frame would refuse, give no mark. */
export function marksFromNotes(notes: readonly NoteInfo[]): Mark[] {
  const marks: Mark[] = [];
  for (const note of notes) {
    const { element, tone } = note;
    if (element === undefined || (tone !== 'fix' && tone !== 'review')) continue;
    const mark: Mark = { id: element, label: note.label.trim(), tone };
    if (accepted(mark)) marks.push(mark);
  }
  return marks;
}

/**
 * The findings' marks, then (with a diff) `~` on changed and `+` on added elements. At most
 * `MAX_ITEMS`: the frame refuses a longer list whole, so the findings come first.
 */
export function pageMarks(findings: readonly Mark[], diff: ElementDiff | undefined): Mark[] {
  const marks = [...findings];
  for (const id of diff?.changed ?? []) marks.push({ id, label: CHANGED_LABEL, tone: 'changed' });
  for (const id of diff?.added ?? []) marks.push({ id, label: ADDED_LABEL, tone: 'added' });
  return marks.slice(0, MAX_ITEMS);
}
