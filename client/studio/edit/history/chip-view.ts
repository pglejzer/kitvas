// A change drawn as the studio's `.k-change` (plan 18f): `size  md -> lg`, the old value struck,
// the new one in a chip, the arrow drawn by the style. The text and a utility class have no name
// of their own, so their names come from the page's texts. The Changes pane and the Claude tab's
// variant cards both draw their chips here.

import { el } from '../props/controls/controls.ts';
import { text } from '../texts.ts';
import { type EntryChip, entryChips } from './change-chips.ts';
import type { ChangeChip } from './chips.ts';

/** What a chip calls the thing it changed. */
export function chipName(chip: ChangeChip): string {
  if (chip.kind === 'text') return text('changes.chip.text');
  if (chip.kind === 'utility') return text('changes.chip.class');
  return chip.name;
}

/** One change: its name, the old value struck (when there was one) and the new value. */
export function changeNode(chip: EntryChip): HTMLElement {
  const node = el('span', 'k-change');
  node.append(el('span', 'k-change-prop', chip.label));
  // A value that was not there before shows only what it is now: `gap lg`.
  if (chip.before !== null) {
    node.append(el('del', undefined, chip.before), el('span', 'k-sr', text('changes.chip.to')));
  }
  node.append(el('ins', undefined, chip.after === '' ? text('changes.chip.none') : chip.after));
  return node;
}

/** A row of changes; `null` when there are none. */
export function changeRow(chips: readonly EntryChip[]): HTMLElement | null {
  if (chips.length === 0) return null;
  const row = el('div', 'changes-chips');
  for (const chip of chips) row.append(changeNode(chip));
  return row;
}

/** The chips of `chips.ts` as a row (the variant cards use it); `null` when there are none. */
export const chipRow = (chips: readonly ChangeChip[]): HTMLElement | null =>
  changeRow(entryChips(chips, chipName));
