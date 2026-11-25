// Rules: ui-narrow. Content a layout squeezed: a button label on several lines, a text in a very
// narrow column (ADR 0074). Both run at every width visit.

import type { RawFinding } from '../findings/finding.ts';
import { UI_NARROW_COLUMN, UI_WRAPPED_ACTION } from '../guidelines/ui-narrow.ts';
import { UI_HEADING_SCALE } from '../guidelines/ui-type.ts';
import type { FactNode, PageFacts } from '../page/facts.ts';
import type { VisitRule } from './types.ts';
import { ruleFinding } from './types.ts';

/** The node itself or an ancestor passes the test. */
function within(facts: PageFacts, start: number, test: (node: FactNode) => boolean): boolean {
  const seen = new Set<number>();
  let at = start;
  while (at >= 0 && !seen.has(at)) {
    seen.add(at);
    const node = facts.nodes[at];
    if (node === undefined) return false;
    if (test(node)) return true;
    at = node.parent;
  }
  return false;
}

/**
 * A button, or a link that looks like one: an inline-block, inline-flex or inline-grid box (not
 * running text, which is `inline`, and not a card link, which is a block), filled or bordered.
 */
function buttonLike(node: FactNode): boolean {
  if (node.action === null) return false;
  if (node.action.kind === 'button') return true;
  if (!node.style.display.startsWith('inline-')) return false;
  const filled = !node.style.background.endsWith('00') || node.style.backgroundImage;
  return filled || node.style.border.some((side) => side > 0);
}

const wrappedAction: VisitRule = {
  id: UI_WRAPPED_ACTION.id,
  run(input) {
    const found: RawFinding[] = [];
    input.facts.nodes.forEach((node, index) => {
      if (node.hidden || node.action === null || !buttonLike(node)) return;
      if (node.action.lines <= UI_WRAPPED_ACTION.thresholds.maxLines) return;
      found.push(
        ruleFinding(input, {
          rule: UI_WRAPPED_ACTION.id,
          severity: 'review',
          node: index,
          message: { key: `checkRule.${UI_WRAPPED_ACTION.key}`, params: {} },
          hint: {
            key: `checkHint.${UI_WRAPPED_ACTION.key}`,
            params: { lines: node.action.lines },
          },
          // The column the draft gives the button breaks its label, not the kit's Button.
          kit: 'keep',
        }),
      );
    });
    return found;
  },
};

const narrowColumn: VisitRule = {
  id: UI_NARROW_COLUMN.id,
  run(input) {
    const { minLines, minChars } = UI_NARROW_COLUMN.thresholds;
    const { facts } = input;
    const found: RawFinding[] = [];
    facts.nodes.forEach((node, index) => {
      const text = node.text;
      if (node.hidden || text === null) return;
      if (text.lines < minLines || text.longest >= minChars) return;
      const heading =
        node.heading > 0 ||
        node.style.fontSize >= UI_HEADING_SCALE.thresholds.headingFactor * facts.bodyFontSize;
      if (heading) return;
      // Columns of a table are compared, not read as prose; an action's label is the other rule's.
      if (node.action !== null || within(facts, index, (one) => one.tag === 'table')) return;
      found.push(
        ruleFinding(input, {
          rule: UI_NARROW_COLUMN.id,
          severity: 'review',
          node: index,
          message: { key: `checkRule.${UI_NARROW_COLUMN.key}`, params: {} },
          hint: {
            key: `checkHint.${UI_NARROW_COLUMN.key}`,
            params: { lines: text.lines, longest: Math.round(text.longest) },
          },
          // The draft's layout makes the column narrow, also around a kit component's text.
          kit: 'keep',
        }),
      );
    });
    return found;
  },
};

export const UI_NARROW_RULES: VisitRule[] = [wrappedAction, narrowColumn];
