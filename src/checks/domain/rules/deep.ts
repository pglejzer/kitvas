// Rules of `kitvas check --deep`: what the stress passes of one visit found (spec section 7). The
// numbers come from the guideline entries; the passes are `adapters/playwright-deep.ts`.

import type { Message, RawFinding, Severity } from '../findings/finding.ts';
import {
  A11Y_CONTRAST_ON_IMAGE,
  A11Y_MOTION,
  A11Y_ORIENTATION,
  UI_LONG_NUMBER,
  UI_LONG_TEXT,
} from '../guidelines/deep.ts';
import { LONG_NUMBER } from '../page/facts.ts';
import { type DeepInput, type DeepRule, ruleFinding } from './types.ts';

type NodesAt = { rule: string; severity: Severity; message: Message; hint: Message };

/**
 * One finding per element id among these nodes. An index outside the facts and a visually hidden
 * node (a box of 1 px, clipped on purpose) are skipped.
 */
function atNodes(input: DeepInput, nodes: readonly number[], at: NodesAt): RawFinding[] {
  const findings: RawFinding[] = [];
  const elements = new Set<string | null>();
  for (const node of nodes) {
    const fact = input.visit.facts.nodes[node];
    if (fact === undefined || fact.hidden) continue;
    const finding = ruleFinding(input.visit, { ...at, node });
    if (elements.has(finding.element)) continue;
    elements.add(finding.element);
    findings.push(finding);
  }
  return findings;
}

const longText: DeepRule = {
  id: UI_LONG_TEXT.id,
  run: (input) =>
    atNodes(input, [...input.deep.longText.clipped, ...input.deep.longText.over], {
      rule: UI_LONG_TEXT.id,
      severity: UI_LONG_TEXT.severity,
      message: { key: 'checkRule.uiLongText', params: { factor: UI_LONG_TEXT.thresholds.factor } },
      hint: { key: 'checkHint.uiLongText', params: {} },
    }),
};

const longNumber: DeepRule = {
  id: UI_LONG_NUMBER.id,
  run: (input) =>
    atNodes(input, [...input.deep.longNumber.clipped, ...input.deep.longNumber.over], {
      rule: UI_LONG_NUMBER.id,
      severity: UI_LONG_NUMBER.severity,
      message: { key: 'checkRule.uiLongNumber', params: { number: LONG_NUMBER } },
      hint: { key: 'checkHint.uiLongNumber', params: {} },
    }),
};

/** One page-level finding: html or body is rotated, or held sideways much of the text is gone. */
const orientation: DeepRule = {
  id: A11Y_ORIENTATION.id,
  run({ visit, deep }) {
    const found = deep.orientation;
    if (found === null || visit.facts.nodes.length === 0) return [];
    const lost = found.landscape < found.portrait * A11Y_ORIENTATION.thresholds.minShare;
    if (!found.rotated && !lost) return [];
    return [
      ruleFinding(visit, {
        rule: A11Y_ORIENTATION.id,
        severity: A11Y_ORIENTATION.severity,
        node: null,
        message: { key: 'checkRule.a11yOrientation', params: {} },
        hint: {
          key: 'checkHint.a11yOrientation',
          params: { landscape: found.landscape, portrait: found.portrait },
        },
      }),
    ];
  },
};

/** Each animation or video still moving with reduced motion on, unless a pause control is near. */
const motion: DeepRule = {
  id: A11Y_MOTION.id,
  run(input) {
    const found = input.deep.motion;
    if (found === null || found.pause) return [];
    return atNodes(input, [...found.running, ...found.autoplay], {
      rule: A11Y_MOTION.id,
      severity: A11Y_MOTION.severity,
      message: { key: 'checkRule.a11yMotion', params: {} },
      hint: { key: 'checkHint.a11yMotion', params: {} },
    });
  },
};

/** Text whose sampled pixels fall under the ratio for its size. The ratio goes in the hint. */
const contrastOnImage: DeepRule = {
  id: A11Y_CONTRAST_ON_IMAGE.id,
  run(input) {
    const { normal, large } = A11Y_CONTRAST_ON_IMAGE.thresholds;
    return input.deep.contrast.flatMap((sample) => {
      const min = sample.large ? large : normal;
      if (sample.ratio >= min) return [];
      return atNodes(input, [sample.node], {
        rule: A11Y_CONTRAST_ON_IMAGE.id,
        severity: A11Y_CONTRAST_ON_IMAGE.severity,
        message: { key: 'checkRule.a11yContrastOnImage', params: {} },
        hint: { key: 'checkHint.a11yContrastOnImage', params: { ratio: sample.ratio, min } },
      });
    });
  },
};

export const DEEP_RULES: DeepRule[] = [longText, longNumber, orientation, motion, contrastOnImage];
