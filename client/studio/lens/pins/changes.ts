// The Changes lens's pins (redesign spec, goal 9; plan 19, task 1): one pin per element changed in
// this session (`state.changes`), with a dashed outline around it: who changed it and what, "You ·
// Set padding: md → lg", or how many changes, "Claude · 3 changes". A change by Claude to a whole
// file names no element and has no pin. Pure.

import { fit, type LensPin, MAX_PIN_TEXT } from '../../../channel/lens-protocol.ts';
import type { ChangeEntry } from '../../edit/store.ts';
import { text } from '../../edit/texts.ts';

/** Who made the changes of one element: you, Claude, or both. */
function whoOf(changes: readonly ChangeEntry[]): string {
  const you = changes.some((one) => one.by === 'person');
  const claude = changes.some((one) => one.by === 'claude');
  if (you && claude) return text('lens.change.both');
  return text(claude ? 'changes.claude' : 'changes.you');
}

/** What one change did: its label, and the value before and after when it changed one. */
function whatOf(change: ChangeEntry): string {
  const { label, before, after } = change;
  if (before === undefined || after === undefined) return label;
  return text('lens.change.value', { label, before, after });
}

/**
 * The pins of the Changes lens, one per changed element in the order it was first changed. The key
 * is `change:<n>`; a click selects the element and opens the Changes tab at its newest step.
 */
export function changePins(changes: readonly ChangeEntry[]): LensPin[] {
  const byElement = new Map<string, ChangeEntry[]>();
  for (const change of changes) {
    if (change.id === null) continue;
    const list = byElement.get(change.id);
    if (list) list.push(change);
    else byElement.set(change.id, [change]);
  }
  return [...byElement.entries()].map(([id, list], index): LensPin => {
    const who = whoOf(list);
    const [only] = list;
    const words =
      list.length === 1 && only
        ? text('lens.change.one', { who, what: whatOf(only) })
        : text('lens.change.many', { who, count: list.length });
    return {
      key: `change:${index}`,
      id,
      kind: 'change',
      tone: 'plain',
      text: fit(words, MAX_PIN_TEXT),
      outline: true,
    };
  });
}
