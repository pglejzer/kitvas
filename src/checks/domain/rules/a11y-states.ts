// Rule: a11y/state-contrast. The text of a control under the pointer or with focus (the `states` pass).

import { A11Y_STATE_CONTRAST } from '../guidelines/a11y.ts';
import type { StateText } from '../page/facts.ts';
import { contrast } from './colour.ts';
import { ruleFinding, type VisitRule } from './types.ts';

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
          kit: 'keep',
        }),
      ];
    });
  },
};

export const A11Y_STATE_RULES: VisitRule[] = [stateContrast];
