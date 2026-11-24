// Waived findings (spec 4c, goal 6; ADR 0055): a finding the person accepted on purpose, with a
// reason. A waiver names a rule and an element; the same rule firing on that element is waived.
// Pure: the waivers come from `src/drafts/` and are handed in.

import type { Finding, WaivedFinding } from './finding.ts';

/** What `run-checks` needs of a waiver; `src/drafts/` has the full record. */
export type WaiverNote = { rule: string; element: string | null; reason: string };

/**
 * The findings that stay, and those a waiver accepts. A finding with no element is waived by a
 * waiver with none; a finding on an element only by a waiver on that element. The first waiver
 * that matches gives the reason.
 */
export function splitWaived(
  findings: readonly Finding[],
  waivers: readonly WaiverNote[],
): { kept: Finding[]; waived: WaivedFinding[] } {
  const kept: Finding[] = [];
  const waived: WaivedFinding[] = [];
  for (const finding of findings) {
    const match = waivers.find(
      (waiver) => waiver.rule === finding.rule && waiver.element === finding.element,
    );
    if (match) waived.push({ ...finding, reason: match.reason });
    else kept.push(finding);
  }
  return { kept, waived };
}
