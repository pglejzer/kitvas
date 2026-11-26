// The kit token that fixes a finding of the full check (plan 18f, task 4; spec S4.8): an off-kit
// colour gets the kit colour nearest to it, a contrast finding the kit colour nearest to the text's
// own that reaches the ratio against the measured background, or none. The choice of a contrast
// token is the live fix's (`../live/fix.ts`, `contrastToken`), so a finding of the full check and
// the same one found live are fixed the same way. Pure; the card applies it (`actions.ts`).

import type { TokenOption } from '../../../../src/edit/index.ts';
import { parseColour } from '../../../../src/shared/values/colour.ts';
import { contrastToken, type FixChange, type FixPlan } from '../live/fix.ts';
import { evidenceOf, type FindingFacts } from './evidence.ts';
import { nearestColourToken, tokenLabel } from './nearest.ts';

/** `token` is the CSS variable the edit writes (`--kit-color-ink`), `label` the name a button shows. */
export type TokenFix = { token: string; label: string };

const fixOf = (token: TokenOption): TokenFix => ({ token: token.var, label: tokenLabel(token) });

/**
 * The token that fixes the finding: the nearest kit colour for an off-kit colour, the nearest one
 * that passes for a contrast finding. `null` for any other rule, and when no token does it.
 */
export function fixToken(finding: FindingFacts, tokens: readonly TokenOption[]): TokenFix | null {
  const evidence = evidenceOf(finding, tokens);
  if (evidence.kind === 'colour') {
    const token = nearestColourToken(evidence.value, tokens);
    return token === null ? null : fixOf(token);
  }
  if (evidence.kind !== 'contrast' || evidence.fg === null || evidence.bg === null) return null;
  const token = contrastToken(
    { color: evidence.fg, background: evidence.bg, needed: evidence.needed },
    tokens,
  );
  return token === null || token === undefined ? null : fixOf(token);
}

/** The part of the element's source view `colourProperty` reads. */
export type DeclaredStyles = {
  scss?: { declarations: readonly { property: string; value: string; offKit: boolean }[] } | null;
};

const same = (a: string, b: string): boolean => {
  if (a.trim().toLowerCase() === b.trim().toLowerCase()) return true;
  const one = parseColour(a);
  const two = parseColour(b);
  return (
    one !== null &&
    two !== null &&
    one.r === two.r &&
    one.g === two.g &&
    one.b === two.b &&
    one.a === two.a
  );
};

/**
 * The property of the element's own class rule that holds an off-kit colour: where "Use <token>"
 * writes. `null` when no declaration of the rule holds it (the colour is written elsewhere).
 */
export function colourProperty(inspected: DeclaredStyles, value: string): string | null {
  const own = inspected.scss?.declarations ?? [];
  return own.find((one) => one.offKit && same(one.value, value))?.property ?? null;
}

/** The plan of "Use <token>": the property set to the token, as the live fix words it. */
export function planOf(property: string, token: TokenOption): FixPlan {
  const change: FixChange = {
    property,
    value: { token: token.var },
    words: { token: token.path, css: token.css },
  };
  // `kind` only names the live fix's gesture label; the card has its own.
  return { kind: 'contrast', changes: [change] };
}

/** The kit's token of a fix, by the variable the fix names. */
export const tokenOf = (fix: TokenFix, tokens: readonly TokenOption[]): TokenOption | undefined =>
  tokens.find((token) => token.var === fix.token);
