// The evidence row of a finding of the full check (plan 18f, task 4; spec S4.8): the number against
// its limit, the colour and the token near it, the level that is missing. A full finding carries
// words only (`checks.json` keeps `message` and `hint` as text), so what it measured is read back
// from them: axe's failure summary (`contrast of 3.9 (foreground color: #8e949e, background color:
// #ffffff …). Expected contrast ratio of 4.5:1`), the colour a ds rule quotes, and the heading level
// of the element's own tag. Pure; the card draws it (`evidence-view.ts`). Not the live findings'
// evidence (`../live/evidence.ts`), which reads the values a card measured.

import type { TokenOption } from '../../../../src/edit/index.ts';
import { nearestColourToken, tokenLabel } from './nearest.ts';

/** What a finding of the full check says about itself. */
export type FindingFacts = {
  rule: string;
  message: string;
  hint: string;
  element: string | null;
};

export type Evidence =
  | { kind: 'contrast'; ratio: number; needed: number; fg: string | null; bg: string | null }
  | { kind: 'colour'; value: string; token: string | null; tokenCss: string | null }
  | { kind: 'levels'; levels: string[]; missing: string }
  | { kind: 'value'; text: string | null };

const COLOUR = String.raw`(#[0-9a-fA-F]{3,8}|rgba?\([^)]*\))`;
const AXE_RATIO = /contrast of (\d+(?:\.\d+)?)/i;
const AXE_NEEDED = /expected contrast ratio of (\d+(?:\.\d+)?):1/i;
const AXE_FG = new RegExp(`foreground color:\\s*${COLOUR}`, 'i');
const AXE_BG = new RegExp(`background color:\\s*${COLOUR}`, 'i');
const ON_IMAGE = /contrast is (\d+(?:\.\d+)?):1 where (\d+(?:\.\d+)?):1 is needed/i;
const QUOTED = /"([^"]+)"/;
const HEADING_TAG = /^h([1-6])(?:\.\d+)?$/;
const MEASURE = /-?\d+(?:\.\d+)?(?:px|rem|em|vh|vw|ms|%)/;

const numberOf = (text: string | undefined): number | null => {
  if (text === undefined) return null;
  const read = Number(text);
  return Number.isFinite(read) ? read : null;
};

/** The ratio a contrast finding measured and the one it needs, with the colours when axe gave them. */
function contrastOf(finding: FindingFacts): Evidence | null {
  if (!/contrast/i.test(finding.rule)) return null;
  const image = ON_IMAGE.exec(finding.hint);
  if (image) {
    const ratio = numberOf(image[1]);
    const needed = numberOf(image[2]);
    if (ratio !== null && needed !== null) {
      return { kind: 'contrast', ratio, needed, fg: null, bg: null };
    }
  }
  const ratio = numberOf(AXE_RATIO.exec(finding.hint)?.[1]);
  const needed = numberOf(AXE_NEEDED.exec(finding.hint)?.[1]);
  if (ratio === null || needed === null) return null;
  return {
    kind: 'contrast',
    ratio,
    needed,
    fg: AXE_FG.exec(finding.hint)?.[1] ?? null,
    bg: AXE_BG.exec(finding.hint)?.[1] ?? null,
  };
}

/** The colour a ds rule quotes, and the kit's colour token nearest to it. */
function colourOf(finding: FindingFacts, tokens: readonly TokenOption[]): Evidence | null {
  if (finding.rule !== 'ds/raw-color') return null;
  const value = QUOTED.exec(finding.message)?.[1]?.trim();
  if (value === undefined || value === '') return null;
  const token = nearestColourToken(value, tokens);
  return {
    kind: 'colour',
    value,
    token: token === null ? null : tokenLabel(token),
    tokenCss: token?.css ?? null,
  };
}

/**
 * A heading that skips a level: the element's own tag says which (`h3`), and the level above it is
 * the one missing. A heading drawn by a component whose id does not say its level has none to show.
 */
function levelsOf(finding: FindingFacts): Evidence | null {
  if (finding.rule !== 'a11y/heading-order' || finding.element === null) return null;
  const tag = finding.element.split(':').pop()?.split('/').pop() ?? '';
  const level = numberOf(HEADING_TAG.exec(tag)?.[1]);
  if (level === null || level < 2) return null;
  const missing = `h${level - 1}`;
  return { kind: 'levels', levels: [missing, `h${level}`], missing };
}

/**
 * The evidence of a finding by its rule: a contrast finding shows the ratio against what it needs,
 * an off-kit colour the colour and its nearest token (from `tokens`, the kit's), a heading order
 * the levels, any other rule the first measure its words name (`12px`), or none.
 */
export function evidenceOf(finding: FindingFacts, tokens: readonly TokenOption[] = []): Evidence {
  const found = contrastOf(finding) ?? colourOf(finding, tokens) ?? levelsOf(finding);
  if (found !== null) return found;
  return { kind: 'value', text: MEASURE.exec(finding.message)?.[0] ?? null };
}

/** The short name a card gives a finding when the evidence says the rest: a text key, or `null`. */
export function titleKey(evidence: Evidence): string | null {
  switch (evidence.kind) {
    case 'contrast':
      return 'checks.name.contrast';
    case 'colour':
      return 'checks.name.colour';
    case 'levels':
      return 'checks.name.levels';
    case 'value':
      return null;
  }
}

/** The ratio's share of a bar that ends at one and a half times what is needed, 0 to 1. */
export const barFill = (ratio: number, needed: number): number =>
  needed > 0 ? Math.min(1, Math.max(0, ratio / (needed * 1.5))) : 0;

/** Where the needed ratio sits on that bar: always two thirds. */
export const BAR_MARK = 2 / 3;
