// The rules of waivers, with no page in them (spec 4c, goal 6): the reason a waiver needs, which
// waiver belongs to which finding, the quick reasons of "Dismiss", and the request a reason makes.
// A waiver is what the person reads as a dismissed finding; the names here are the data's.

import type { Waiver } from '../../../../src/studio/api/waivers/waiver-schemas.ts';

/** Copy of `MAX_REASON` in `src/studio/api/waivers/waiver-schemas.ts`. */
export const MAX_REASON = 300;

/** What a waiver is about: the rule that fired and the element it fired on. */
export type WaiverKey = { rule: string; element: string | null };

export type ReasonProblem = 'empty' | 'long';

/** Why a reason is not taken; the server trims it too, so spaces alone are empty. */
export function reasonProblem(reason: string): ReasonProblem | null {
  const trimmed = reason.trim();
  if (trimmed === '') return 'empty';
  return trimmed.length > MAX_REASON ? 'long' : null;
}

/** The waiver of this rule on this element, if there is one. */
export function waiverOf(waivers: readonly Waiver[], key: WaiverKey): Waiver | undefined {
  return waivers.find((waiver) => waiver.rule === key.rule && waiver.element === key.element);
}

/**
 * The rule and element of a row of the Checks list. The rule is the row's `<code>` (the server
 * writes it inside the details); the element is `data-element`, or `data-waived-element` once the
 * row is dismissed. `null` for a row with no rule.
 */
export function noteKey(row: {
  rule: string | null;
  element: string | undefined;
  waivedElement: string | undefined;
}): WaiverKey | null {
  const rule = row.rule?.trim() ?? '';
  if (rule === '') return null;
  return { rule, element: row.element ?? row.waivedElement ?? null };
}

/** The texts of the quick reasons, in the order the row shows them; each is saved as the reason. */
export const QUICK_REASON_KEYS = [
  'waiver.reason.fine',
  'waiver.reason.kit',
  'waiver.reason.false',
] as const;

/** What a dismissal sends: the finding's key and a reason the server will take, or the problem. */
export type ReasonRequest =
  | { ok: true; body: { rule: string; element: string | null; reason: string } }
  | { ok: false; problem: ReasonProblem };

/** The request for this finding with this reason, trimmed as the server trims it. */
export function reasonRequest(finding: WaiverKey, reason: string): ReasonRequest {
  const problem = reasonProblem(reason);
  if (problem !== null) return { ok: false, problem };
  return {
    ok: true,
    body: { rule: finding.rule, element: finding.element, reason: reason.trim() },
  };
}
