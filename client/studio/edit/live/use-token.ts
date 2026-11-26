// "Use <token>" on a live finding (ADR 0061): a colour written by hand in the code gets the kit
// colour nearest to it, the fix the Checks cards make (`checks/token-fix.ts`, `checks/actions.ts`),
// so the row above Properties and the card of the full check offer the same step.

import type { TokenOption } from '../../../../src/edit/index.ts';
import { applyToken, canUse } from '../checks/actions.ts';
import { evidenceOf, type FindingFacts } from '../checks/evidence.ts';
import { fixToken, type TokenFix } from '../checks/token-fix.ts';
import type { EditorContext } from '../context.ts';
import { el } from '../props/controls/controls.ts';
import { text } from '../texts.ts';
import type { LiveRow } from './items.ts';

/** The part of a live row the fix reads. */
export type TokenRow = Pick<LiveRow, 'rule' | 'source' | 'waived' | 'message' | 'raw'>;

/**
 * The token that fixes a live row, with the finding as the Checks cards read it. `null` for a
 * finding seen in the page (its own fix is Apply), a dismissed one, one of no element, and a value
 * the kit has no colour for.
 */
export function tokenFixOf(
  row: TokenRow,
  element: string | null,
  tokens: readonly TokenOption[],
): { facts: FindingFacts; fix: TokenFix } | null {
  if (row.source !== 'code' || row.waived || element === null) return null;
  const facts = { rule: row.rule, message: row.raw ?? row.message, hint: '', element };
  if (evidenceOf(facts, tokens).kind !== 'colour') return null;
  const fix = fixToken(facts, tokens);
  return fix === null ? null : { facts, fix };
}

/** The "Use <token>" button of a row, or `null` when the row has no such fix or Edit is off. */
export function tokenButton(
  ctx: EditorContext,
  element: string | null,
  row: LiveRow,
): HTMLButtonElement | null {
  const state = ctx.store.get();
  const tokens = state.edit?.tokens ?? [];
  const found = canUse(state) ? tokenFixOf(row, element, tokens) : null;
  if (found === null) return null;
  const words = text('checks.use', { token: found.fix.label });
  const button = el('button', 'k-btn k-btn-sm k-btn-soft');
  button.type = 'button';
  button.title = words;
  button.disabled = state.busy;
  button.append(el('span', 'k-clip', words));
  button.addEventListener('click', () => {
    button.disabled = true;
    // The write runs the live checks again: the finding leaves the list with its row.
    void applyToken(ctx, found.facts, found.fix, evidenceOf(found.facts, tokens)).finally(() => {
      button.disabled = false;
    });
  });
  return button;
}
