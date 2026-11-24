// The chips of `chips.ts` drawn (plan 18, task D): `size md → lg` as a `.k-chip`, the old value
// struck through, the arrow an icon with "to" for assistive technology. The text and a utility
// class have no name of their own, so their names come from the page's texts.

import { icon } from '../../ui/icon.ts';
import { el } from '../props/controls.ts';
import { text } from '../texts.ts';
import type { ChangeChip } from './chips.ts';

/** What a chip calls the thing it changed. */
export function chipName(chip: ChangeChip): string {
  if (chip.kind === 'text') return text('changes.chip.text');
  if (chip.kind === 'utility') return text('changes.chip.class');
  return chip.name;
}

export function chipNode(chip: ChangeChip): HTMLElement {
  const node = el('span', 'k-chip changes-chip');
  node.append(el('span', 'changes-chip-name', chipName(chip)));
  // A value that was not there before shows only what it is now: `gap lg`.
  if (chip.before !== null) {
    node.append(
      el('s', 'changes-chip-before', chip.before),
      icon('arrow-right'),
      el('span', 'k-sr', text('changes.chip.to')),
    );
  }
  node.append(el('span', 'changes-chip-after', chip.after ?? text('changes.chip.none')));
  return node;
}

/** A row of chips; `null` when there are none. */
export function chipRow(chips: readonly ChangeChip[]): HTMLElement | null {
  if (chips.length === 0) return null;
  const row = el('div', 'changes-chips');
  for (const chip of chips) row.append(chipNode(chip));
  return row;
}
