// Rules: a11y, beyond axe. Each reads the page facts and the report, never the page.

import type { RawFinding } from '../findings/finding.ts';
import {
  A11Y_CONTROL_CONTRAST,
  A11Y_FOCUS_CONTRAST,
  A11Y_FOCUS_ORDER,
  A11Y_ICON_CONTRAST,
  A11Y_REFLOW,
  AUTOCOMPLETE_TYPES,
  AUTOCOMPLETE_WORDS,
} from '../guidelines/a11y.ts';
import type { FactNode, PageFacts } from '../page/facts.ts';
import { contrast, parseColour } from './colour.ts';
import { type At, ruleFinding, type VisitRule } from './types.ts';

/** Elements that may scroll sideways at 320 px: data tables, code, media. */
const REFLOW_EXEMPT = new Set(['table', 'pre', 'video', 'canvas', 'iframe', 'img']);
const OPAQUE_WHITE = '#ffffffff';
const CONTROL_ROLES = new Set(['checkbox', 'radio', 'switch']);

const message = (key: string, params: Record<string, string | number> = {}) => ({
  key: `checkRule.${key}`,
  params,
});
const hint = (key: string, params: Record<string, string | number> = {}) => ({
  key: `checkHint.${key}`,
  params,
});

function at(
  rule: string,
  severity: At['severity'],
  node: number | null,
  key: string,
  params: Record<string, string | number> = {},
  hintParams: Record<string, string | number> = {},
): At {
  return { rule, severity, node, message: message(key, params), hint: hint(key, hintParams) };
}

/** True when the node or one of its ancestors satisfies the test. */
function selfOrAncestor(
  nodes: readonly FactNode[],
  start: number,
  test: (node: FactNode) => boolean,
): boolean {
  let index = start;
  for (let steps = 0; index >= 0 && steps <= nodes.length; steps += 1) {
    const current = nodes[index];
    if (!current) return false;
    if (test(current)) return true;
    index = current.parent;
  }
  return false;
}

/** `ancestor` is `node` or one of its ancestors. */
function isWithin(nodes: readonly FactNode[], node: number, ancestor: number): boolean {
  let index = node;
  for (let steps = 0; index >= 0 && steps <= nodes.length; steps += 1) {
    if (index === ancestor) return true;
    index = nodes[index]?.parent ?? -1;
  }
  return false;
}

function groundOfParent(facts: PageFacts, node: FactNode): string {
  const parent = node.parent >= 0 ? facts.nodes[node.parent] : undefined;
  return parent ? parent.style.ground : OPAQUE_WHITE;
}

const reflow: VisitRule = {
  id: 'a11y/reflow',
  run(input) {
    const { facts } = input;
    const { reflowWidth, tolerance, cap } = A11Y_REFLOW.thresholds;
    if (!facts.reflow) return [];
    // A page that already scrolls sideways at its own width is ui/page-overflow's.
    if (facts.scrollWidth > facts.viewport[0] + tolerance) return [];
    if (facts.reflow.scrollWidth <= reflowWidth + tolerance) return [];
    const found: RawFinding[] = [];
    for (const index of facts.reflow.over) {
      const node = facts.nodes[index];
      if (!node || selfOrAncestor(facts.nodes, index, (n) => REFLOW_EXEMPT.has(n.tag))) continue;
      found.push(
        ruleFinding(
          input,
          at('a11y/reflow', 'fix', index, 'a11yReflow', { tag: node.tag }, { width: reflowWidth }),
        ),
      );
      if (found.length >= cap) break;
    }
    return found;
  },
};

const textSpacing: VisitRule = {
  id: 'a11y/text-spacing',
  run(input) {
    const spacing = input.facts.spacing;
    if (!spacing) return [];
    const found: RawFinding[] = [];
    const seen = new Set<number>();
    for (const index of [...spacing.clipped, ...spacing.overlapping]) {
      if (seen.has(index) || !input.facts.nodes[index]) continue;
      seen.add(index);
      found.push(ruleFinding(input, at('a11y/text-spacing', 'fix', index, 'a11yTextSpacing')));
    }
    return found;
  },
};

const focusVisible: VisitRule = {
  id: 'a11y/focus-visible',
  run(input) {
    return input.facts.focus
      .filter((stop) => !stop.changed && input.facts.nodes[stop.node])
      .map((stop) =>
        ruleFinding(input, at('a11y/focus-visible', 'fix', stop.node, 'a11yFocusVisible')),
      );
  },
};

const focusHidden: VisitRule = {
  id: 'a11y/focus-hidden',
  run(input) {
    const found: RawFinding[] = [];
    for (const stop of input.facts.focus) {
      if (stop.covered === 'none' || !input.facts.nodes[stop.node]) continue;
      found.push(
        ruleFinding(
          input,
          at(
            'a11y/focus-hidden',
            stop.covered === 'fully' ? 'fix' : 'review',
            stop.node,
            'a11yFocusHidden',
          ),
        ),
      );
    }
    return found;
  },
};

const focusOrder: VisitRule = {
  id: 'a11y/focus-order',
  run(input) {
    const { nodes, focus } = input.facts;
    const { backLines } = A11Y_FOCUS_ORDER.thresholds;
    const found: RawFinding[] = [];
    for (let i = 1; i < focus.length; i += 1) {
      const stop = focus[i];
      const before = focus[i - 1];
      const current = stop ? nodes[stop.node] : undefined;
      const previous = before ? nodes[before.node] : undefined;
      if (!stop || !current || !previous) continue;
      // Fixed bars are measured elsewhere on the page, so their place says nothing about order.
      if (current.style.position === 'fixed' || previous.style.position === 'fixed') continue;
      const [x, y, w] = current.box;
      const [px, py, pw] = previous.box;
      const above = py - y > backLines * current.style.lineHeight;
      const sameColumn = x < px + pw && px < x + w;
      if (above && sameColumn) {
        found.push(
          ruleFinding(input, at('a11y/focus-order', 'review', stop.node, 'a11yFocusOrder')),
        );
      }
    }
    return found;
  },
};

const controlContrast: VisitRule = {
  id: 'a11y/control-contrast',
  run(input) {
    const { facts } = input;
    const { ratio } = A11Y_CONTROL_CONTRAST.thresholds;
    const found: RawFinding[] = [];
    facts.nodes.forEach((node, index) => {
      const custom = node.role !== null && CONTROL_ROLES.has(node.role);
      if (!node.field && !custom) return;
      const widest = Math.max(...node.style.border);
      // A native checkbox or radio is drawn by the browser with its own contrast.
      const nativeToggle =
        node.field !== null && ['checkbox', 'radio'].includes(node.field.type) && !custom;
      if (nativeToggle && widest <= 0) return;
      const around = groundOfParent(facts, node);
      const borderLow =
        widest <= 0 ||
        node.style.borderColor === '' ||
        contrast(node.style.borderColor, around) < ratio;
      const fillLow = contrast(node.style.background, around) < ratio;
      if (!borderLow || !fillLow) return;
      const named = node.field?.label === 'visible';
      found.push(
        ruleFinding(
          input,
          at(
            'a11y/control-contrast',
            named ? 'review' : 'fix',
            index,
            'a11yControlContrast',
            { tag: node.tag },
            { min: ratio },
          ),
        ),
      );
    });
    return found;
  },
};

/** The first of fill, stroke and colour that paints something. */
function inkOf(node: FactNode): string | null {
  for (const colour of [node.style.fill, node.style.stroke, node.style.color]) {
    const parsed = parseColour(colour);
    if (parsed && parsed.a > 0) return colour;
  }
  return null;
}

const iconContrast: VisitRule = {
  id: 'a11y/icon-contrast',
  run(input) {
    const { nodes } = input.facts;
    const { ratio } = A11Y_ICON_CONTRAST.thresholds;
    const found: RawFinding[] = [];
    nodes.forEach((node, index) => {
      if (node.action?.text.trim() !== '') return;
      const low = nodes.some((svg, svgIndex) => {
        if (svg.tag !== 'svg' || !isWithin(nodes, svgIndex, index)) return false;
        const ink = inkOf(svg);
        return ink !== null && contrast(ink, node.style.ground) < ratio;
      });
      if (!low) return;
      found.push(
        ruleFinding(
          input,
          at('a11y/icon-contrast', 'review', index, 'a11yIconContrast', {}, { min: ratio }),
        ),
      );
    });
    return found;
  },
};

const focusContrast: VisitRule = {
  id: 'a11y/focus-contrast',
  run(input) {
    const { ratio } = A11Y_FOCUS_CONTRAST.thresholds;
    const found: RawFinding[] = [];
    for (const stop of input.facts.focus) {
      if (stop.ring === null || stop.defaultRing || stop.ringGround === null) continue;
      if (!input.facts.nodes[stop.node]) continue;
      if (contrast(stop.ring, stop.ringGround) >= ratio) continue;
      found.push(
        ruleFinding(
          input,
          at('a11y/focus-contrast', 'fix', stop.node, 'a11yFocusContrast', {}, { min: ratio }),
        ),
      );
    }
    return found;
  },
};

const contrastUnsure: VisitRule = {
  id: 'a11y/contrast-unsure',
  run(input) {
    return input.report.contrastUnsure.map((entry) =>
      ruleFinding(
        input,
        at(
          'a11y/contrast-unsure',
          'review',
          entry.node >= 0 && input.facts.nodes[entry.node] ? entry.node : null,
          'a11yContrastUnsure',
        ),
      ),
    );
  },
};

const errorText: VisitRule = {
  id: 'a11y/error-text',
  run(input) {
    if (input.stateKind !== 'error') return [];
    const found: RawFinding[] = [];
    input.facts.nodes.forEach((node, index) => {
      const field = node.field;
      if (!field?.invalid) return;
      if (field.described.some((target) => target.text.trim() !== '')) return;
      found.push(
        ruleFinding(input, {
          ...at('a11y/error-text', 'fix', index, 'a11yErrorText'),
          kit: 'keep',
        }),
      );
    });
    return found;
  },
};

/** Lower-case words of a name or label, split at camelCase, digits, dashes and spaces. */
function wordsOf(text: string): string[] {
  return text
    .replace(/([a-z])([A-Z])/g, '$1 $2')
    .toLowerCase()
    .split(/[^a-z]+/)
    .filter((word) => word !== '');
}

const autocomplete: VisitRule = {
  id: 'a11y/autocomplete',
  run(input) {
    const found: RawFinding[] = [];
    input.facts.nodes.forEach((node, index) => {
      const field = node.field;
      if (field?.autocomplete.trim() !== '') return;
      if (field.type === 'search' || node.landmark === 'search') return;
      const aboutUser =
        AUTOCOMPLETE_TYPES.includes(field.type) ||
        [...wordsOf(field.name), ...wordsOf(field.labelText)].some((word) =>
          AUTOCOMPLETE_WORDS.includes(word),
        );
      if (!aboutUser) return;
      found.push(
        ruleFinding(input, {
          ...at('a11y/autocomplete', 'review', index, 'a11yAutocomplete'),
          kit: 'keep',
        }),
      );
    });
    return found;
  },
};

export const A11Y_RULES: VisitRule[] = [
  reflow,
  textSpacing,
  focusVisible,
  focusHidden,
  focusOrder,
  controlContrast,
  iconContrast,
  focusContrast,
  contrastUnsure,
  errorText,
  autocomplete,
];
