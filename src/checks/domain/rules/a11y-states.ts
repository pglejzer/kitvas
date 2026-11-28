// Rule: a11y/state-contrast. The text of a control under the pointer or with focus (the `states` pass).

import { A11Y_STATE_CONTRAST } from '../guidelines/a11y.ts';
import type { StateText } from '../page/facts.ts';
import { contrast } from './colour.ts';
import { ruleFinding, type VisitInput, type VisitRule } from './types.ts';

/**
 * The draft passed a class or a style to the kit component that holds the node, or to one around
 * it (ADR 0096). Without one, the state's look is the kit's own.
 */
function draftStyled(input: VisitInput, node: number): boolean {
  const styled = new Set(
    input.report.usage
      .filter(({ props }) => 'className' in props || 'style' in props)
      .map(({ id }) => id),
  );
  for (let at = node; at !== -1; at = input.facts.nodes[at]?.parent ?? -1) {
    const ks = input.facts.nodes[at]?.ks ?? null;
    if (ks !== null && styled.has(ks)) return true;
  }
  return false;
}

/** The lowest contrast among the texts that fall under their minimum; null when none does. */
function lowestUnder(texts: readonly StateText[]): number | null {
  const { ratio, large } = A11Y_STATE_CONTRAST.thresholds;
  let lowest: number | null = null;
  for (const text of texts) {
    if (text.unsure) continue;
    const value = contrast(text.ink, text.ground);
    if (value >= (text.large ? large : ratio)) continue;
    if (lowest === null || value < lowest) lowest = value;
  }
  return lowest;
}

const stateContrast: VisitRule = {
  id: A11Y_STATE_CONTRAST.id,
  run(input) {
    const { ratio } = A11Y_STATE_CONTRAST.thresholds;
    return input.facts.states.flatMap((read) => {
      if (!input.facts.nodes[read.node]) return [];
      const lowest = lowestUnder(read.texts);
      if (lowest === null) return [];
      const key =
        read.state === 'hover' ? 'checkRule.a11yStateContrast' : 'checkRule.a11yStateContrastFocus';
      return [
        ruleFinding(input, {
          rule: A11Y_STATE_CONTRAST.id,
          severity: 'fix',
          node: read.node,
          message: { key, params: { name: read.name, ratio: lowest.toFixed(1) } },
          hint: { key: 'checkHint.a11yStateContrast', params: { min: ratio } },
          kit: draftStyled(input, read.node) ? 'keep' : 'review',
        }),
      ];
    });
  },
};

export const A11Y_STATE_RULES: VisitRule[] = [stateContrast];
