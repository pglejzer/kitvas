// The Checks lens's pins (redesign spec, goal 9; plan 19, task 1): one pin per finding of the full
// check (the Checks pane's `li.note` rows) and of the live check at the card's width, in the
// finding's tone, with its short name: the name the Checks pane gives it (`checks.name.*`) where its
// evidence says the rest, else its own words. They take the place of the numbered dots and the live
// tags (plan 19, call 2). Pure but for `readFindings`, which reads the pane.

import { fit, type LensPin, MAX_PIN_TEXT } from '../../../channel/lens-protocol.ts';
import { evidenceOf, titleKey } from '../../edit/checks/evidence.ts';
import { evidenceName } from '../../edit/live/evidence.ts';
import type { LiveGroup, LiveRow } from '../../edit/live/items.ts';
import { text } from '../../edit/texts.ts';

/** A finding of the full check as the Checks pane lists it. */
export type FullFinding = {
  /** Its place among the pane's `li.note` rows, from 0: a click on its pin scrolls back to it. */
  index: number;
  /** `null` for a finding of no element, and for an accepted one (`edit/live/waivers.ts`). */
  element: string | null;
  tone: 'fix' | 'review' | null;
  rule: string;
  message: string;
  hint: string;
};

/** The findings the page lists now, in their order: `li.note` and what the server put on it. */
export function readFindings(root: ParentNode): FullFinding[] {
  return [...root.querySelectorAll<HTMLElement>('li.note')].map((note, index) => {
    const { element, tone, rule, message, hint } = note.dataset;
    return {
      index,
      element: element ?? null,
      tone: tone === 'fix' || tone === 'review' ? tone : null,
      rule: rule ?? '',
      message: message ?? '',
      hint: hint ?? '',
    };
  });
}

/** A full finding's short name: the pane's name for its evidence, else its message, else its rule. */
function fullName(finding: FullFinding): string {
  const key = titleKey(evidenceOf(finding));
  if (key !== null) return text(key);
  return finding.message.trim() === '' ? finding.rule : finding.message;
}

/** A live finding's short name, as the Live section names it (`live/view.ts`). */
function liveName(row: LiveRow): string {
  const key = evidenceName(row.evidence);
  return key === null ? row.message : text(key);
}

/** A live finding is on a card when it was measured at its width, or is a code finding. */
const onCard = (row: LiveRow, width: number): boolean =>
  !row.waived && (row.source === 'code' || row.widths.includes(width));

/**
 * The Checks lens's pins on a card `width` pixels wide: the full findings on an element first, in
 * the pane's order, then the open live findings there (`live`: `liveGroups`, in their order).
 * A key names the row a click opens: `check:f<row>` and `check:l<group>.<row>`.
 */
export function checkPins(
  findings: readonly FullFinding[],
  live: readonly LiveGroup[],
  width: number,
): LensPin[] {
  const pins: LensPin[] = [];
  for (const finding of findings) {
    const { element, tone } = finding;
    if (element === null || tone === null) continue;
    const words = fit(fullName(finding), MAX_PIN_TEXT);
    pins.push({ key: `check:f${finding.index}`, id: element, kind: 'check', tone, text: words });
  }
  live.forEach((group, at) => {
    const { id } = group;
    if (id === null) return;
    group.rows.forEach((row, index) => {
      if (!onCard(row, width)) return;
      pins.push({
        key: `check:l${at}.${index}`,
        id,
        kind: 'check',
        tone: row.severity,
        text: fit(liveName(row), MAX_PIN_TEXT),
      });
    });
  });
  return pins;
}

/** How many findings the Checks pane lists: the full check's rows, and the live ones not accepted. */
export function checkCount(findings: readonly FullFinding[], live: readonly LiveGroup[]): number {
  const open = live.reduce((sum, group) => sum + group.rows.filter((row) => !row.waived).length, 0);
  return findings.length + open;
}
