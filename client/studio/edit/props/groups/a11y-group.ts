// Accessibility as the last group of Properties (plan 18f, task 2; spec S4.6 item 6): the
// selected element's card from the frame (role, name, keyboard, contrast, target, alt text,
// heading), folded at first, with its status chip on the header, so a problem shows while the
// group is folded. A problem the live checks found too links to that finding. The rows are
// `cardRows` of `live/card.ts`; this file draws them as the pane's rows.

import type { A11yCard } from '../../../../channel/live-protocol.ts';
import { cardRows, problemCount } from '../../live/card.ts';
import { text } from '../../texts.ts';
import { el } from '../controls/controls.ts';

/** The live finding of `rule` on the selected element, to move the focus to; `null`: none. */
export type FindingOf = (rule: string) => HTMLElement | null;

/** The header's chip: "No problems", or how many, in the fix tone. */
export function a11yChip(count: number): HTMLElement {
  let said = text('a11y.ok');
  if (count > 0) said = text(count === 1 ? 'a11y.problem' : 'a11y.problems', { count });
  const chip = el('span', 'k-chip props-a11y-chip', said);
  chip.dataset.tone = count > 0 ? 'fix' : 'good';
  return chip;
}

/** The group's parts: its rows (one list of facts) and the chip for its header. */
export function a11yParts(
  card: A11yCard,
  findingOf: FindingOf,
): { rows: HTMLElement[]; chip: HTMLElement } {
  const rows = cardRows(card);
  const list = el('dl', 'props-a11y');
  list.dataset.row = 'a11y';
  for (const row of rows) {
    const line = el('div', 'k-row props-a11y-row');
    if (row.problem) line.dataset.problem = '';
    const value = el('dd', row.problem ? 'k-fix' : undefined, row.value);
    const finding = row.problem && row.rule !== null ? findingOf(row.rule) : null;
    if (finding !== null) {
      const link = el('button', 'k-link props-a11y-link', text('a11y.see'));
      link.type = 'button';
      link.dataset.control = `see-${row.key}`;
      link.addEventListener('click', () => {
        finding.focus();
        finding.scrollIntoView({ block: 'nearest' });
      });
      value.append(' ', link);
    }
    line.append(el('dt', 'k-label', row.label), value);
    list.append(line);
  }
  return { rows: [list], chip: a11yChip(problemCount(rows)) };
}
