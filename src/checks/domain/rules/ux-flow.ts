// Rules: ux states, navigation and copy. The action and link rules are in ux-actions.ts.

import type { RawFinding } from '../findings/finding.ts';
import {
  UX_CURRENT_PAGE,
  UX_EMPTY_NEXT_STEP,
  UX_EMPTY_REGION,
  UX_ERROR_RECOVERY,
  UX_FLOW_WORDS,
  UX_HIDDEN_NAV,
  UX_LOADING_INDICATOR,
  UX_LOADING_SAYS_EMPTY,
  UX_PLACEHOLDER_TEXT,
  UX_STATE_SHIFT,
} from '../guidelines/ux-flow.ts';
import type { FactNode } from '../page/facts.ts';
import {
  PLACEHOLDER_FIX,
  PLACEHOLDER_REVIEW,
  ruleFinding,
  type StatesRule,
  type VisitInput,
  type VisitRule,
} from './types.ts';
import { landmarkRoot, UX_ACTION_RULES } from './ux-actions.ts';

/** Indexes of the nodes in `main`, or of every node when none is a main. */
function mainNodes(input: VisitInput): number[] {
  const { nodes } = input.facts;
  const all = nodes.map((_, index) => index);
  const inMain = all.filter((index) => nodes[index]?.landmark === 'main');
  return inMain.length > 0 ? inMain : all;
}

const wordCount = (sample: string): number => sample.split(/\s+/).filter(Boolean).length;

const emptyNextStep: VisitRule = {
  id: UX_EMPTY_NEXT_STEP.id,
  run(input) {
    if (input.stateKind !== 'empty') return [];
    const nodes = mainNodes(input).map((index) => input.facts.nodes[index]);
    if (nodes.length === 0) return [];
    const hasText = nodes.some(
      (node) =>
        (node?.text ? wordCount(node.text.sample) : 0) >= UX_EMPTY_NEXT_STEP.thresholds.minWords,
    );
    const hasAction = nodes.some((node) => node?.action);
    if (hasText && hasAction) return [];
    const missing = hasText ? 'action' : hasAction ? 'text' : 'text and action';
    return [
      ruleFinding(input, {
        rule: UX_EMPTY_NEXT_STEP.id,
        severity: 'review',
        node: null,
        message: { key: 'checkRule.uxEmptyNextStep', params: { missing } },
        hint: { key: 'checkHint.uxEmptyNextStep', params: {} },
      }),
    ];
  },
};

const noResultsPattern = new RegExp(`\\b(${UX_FLOW_WORDS.noResults.join('|')})\\b`, 'i');
const loadingPattern = new RegExp(`\\b(${UX_FLOW_WORDS.loading.join('|')})\\b`, 'i');

const loadingSaysEmpty: VisitRule = {
  id: UX_LOADING_SAYS_EMPTY.id,
  run(input) {
    if (input.stateKind !== 'loading') return [];
    const findings: RawFinding[] = [];
    input.facts.nodes.forEach((node, index) => {
      const match = node.text ? noResultsPattern.exec(node.text.sample) : null;
      if (!match) return;
      findings.push(
        ruleFinding(input, {
          rule: UX_LOADING_SAYS_EMPTY.id,
          severity: 'fix',
          node: index,
          message: { key: 'checkRule.uxLoadingSaysEmpty', params: { text: match[0] } },
          hint: { key: 'checkHint.uxLoadingSaysEmpty', params: {} },
        }),
      );
    });
    return findings;
  },
};

const SIGNAL_ROLES = ['status', 'progressbar'];

const loadingIndicator: VisitRule = {
  id: UX_LOADING_INDICATOR.id,
  run(input) {
    if (input.stateKind !== 'loading' || input.facts.nodes.length === 0) return [];
    const signalled = input.facts.nodes.some(
      (node) =>
        node.busy ||
        (node.live !== null && SIGNAL_ROLES.includes(node.live)) ||
        (node.role !== null && SIGNAL_ROLES.includes(node.role)) ||
        (!node.hidden && node.text !== null && loadingPattern.test(node.text.sample)),
    );
    const feedback = input.report.usage.some(
      (record) =>
        input.catalog.find((entry) => entry.name === record.component)?.category === 'feedback',
    );
    if (signalled || feedback) return [];
    return [
      ruleFinding(input, {
        rule: UX_LOADING_INDICATOR.id,
        severity: 'fix',
        node: null,
        message: { key: 'checkRule.uxLoadingIndicator', params: {} },
        hint: { key: 'checkHint.uxLoadingIndicator', params: {} },
      }),
    ];
  },
};

const errorRecovery: VisitRule = {
  id: UX_ERROR_RECOVERY.id,
  run(input) {
    if (input.stateKind !== 'error' || input.facts.nodes.length === 0) return [];
    const hasAction = mainNodes(input).some((index) => input.facts.nodes[index]?.action);
    if (hasAction) return [];
    return [
      ruleFinding(input, {
        rule: UX_ERROR_RECOVERY.id,
        severity: 'fix',
        node: null,
        message: { key: 'checkRule.uxErrorRecovery', params: {} },
        hint: { key: 'checkHint.uxErrorRecovery', params: {} },
      }),
    ];
  },
};

const hiddenNav: VisitRule = {
  id: UX_HIDDEN_NAV.id,
  run(input) {
    if (input.seen.width !== UX_HIDDEN_NAV.thresholds.width) return [];
    const inNav = input.facts.nodes
      .map((node, index) => ({ node, index }))
      .filter(({ node }) => node.landmark === 'navigation');
    const visibleLink = inNav.some(({ node }) => node.action?.kind === 'link' && !node.hidden);
    if (visibleLink) return [];
    const menu = inNav.find(({ node }) => node.action?.kind === 'button' && node.action.menu);
    if (!menu) return [];
    return [
      ruleFinding(input, {
        rule: UX_HIDDEN_NAV.id,
        severity: 'review',
        node: menu.index,
        message: { key: 'checkRule.uxHiddenNav', params: {} },
        hint: { key: 'checkHint.uxHiddenNav', params: {} },
      }),
    ];
  },
};

const isCurrent = (node: FactNode): boolean => {
  const current = node.action?.current ?? null;
  return current !== null && current !== 'false';
};

const currentPage: VisitRule = {
  id: UX_CURRENT_PAGE.id,
  run(input) {
    const navs = new Map<number, { links: number; current: boolean }>();
    input.facts.nodes.forEach((node, index) => {
      if (node.landmark !== 'navigation' || node.action?.kind !== 'link') return;
      const root = landmarkRoot(input, index);
      const entry = navs.get(root) ?? { links: 0, current: false };
      entry.links += 1;
      entry.current = entry.current || isCurrent(node);
      navs.set(root, entry);
    });
    const findings: RawFinding[] = [];
    for (const [root, { links, current }] of navs) {
      if (links < UX_CURRENT_PAGE.thresholds.minLinks || current) continue;
      findings.push(
        ruleFinding(input, {
          rule: UX_CURRENT_PAGE.id,
          severity: 'review',
          node: root,
          message: { key: 'checkRule.uxCurrentPage', params: {} },
          hint: { key: 'checkHint.uxCurrentPage', params: { links } },
          kit: 'keep',
        }),
      );
    }
    return findings;
  },
};

const placeholderText: VisitRule = {
  id: UX_PLACEHOLDER_TEXT.id,
  run(input) {
    const findings: RawFinding[] = [];
    input.facts.nodes.forEach((node, index) => {
      if (!node.text) return;
      const sample = node.text.sample.trim();
      const fix = PLACEHOLDER_FIX.test(sample);
      if (!fix && !PLACEHOLDER_REVIEW.test(sample)) return;
      findings.push(
        ruleFinding(input, {
          rule: UX_PLACEHOLDER_TEXT.id,
          severity: fix ? 'fix' : 'review',
          node: index,
          message: { key: 'checkRule.uxPlaceholderText', params: { text: sample } },
          hint: { key: 'checkHint.uxPlaceholderText', params: {} },
        }),
      );
    });
    return findings;
  },
};

export const UX_FLOW_RULES: VisitRule[] = [
  emptyNextStep,
  loadingSaysEmpty,
  loadingIndicator,
  errorRecovery,
  ...UX_ACTION_RULES,
  hiddenNav,
  currentPage,
  placeholderText,
];

/** Whether `index` has `ancestor` above it (not itself). */
function below(input: VisitInput, index: number, ancestor: number): boolean {
  const { nodes } = input.facts;
  for (let at = nodes[index]?.parent ?? -1; at !== -1; at = nodes[at]?.parent ?? -1) {
    if (at === ancestor) return true;
  }
  return false;
}

const CHROME = ['banner', 'navigation', 'contentinfo'];

/** The first node with this own element id. */
function byOwnKs(input: VisitInput, ks: string): number {
  return input.facts.nodes.findIndex((node) => node.ownKs && node.ks === ks);
}

/** The n-th node (from 0) with this own element id; -1 when there are fewer. */
function nthOwnKs(input: VisitInput, ks: string, n: number): number {
  let seen = 0;
  const { nodes } = input.facts;
  for (let index = 0; index < nodes.length; index += 1) {
    const node = nodes[index];
    if (!node?.ownKs || node.ks !== ks) continue;
    if (seen === n) return index;
    seen += 1;
  }
  return -1;
}

const emptyRegion: StatesRule = {
  id: UX_EMPTY_REGION.id,
  run({ baseline, visits }) {
    const findings: RawFinding[] = [];
    const { nodes } = baseline.facts;
    for (const visit of visits) {
      if (visit.stateKind !== 'empty') continue;
      nodes.forEach((node, index) => {
        if (!node.ownKs || node.ks === null) return;
        if (node.landmark !== null && CHROME.includes(node.landmark)) return;
        const hadText = nodes.some(
          (other, at) => other.text !== null && below(baseline, at, index),
        );
        if (!hadText) return;
        const match = byOwnKs(visit, node.ks);
        if (match === -1) return;
        const there = visit.facts.nodes;
        const holds = there.some(
          (other, at) => other.parent === match || (at === match && other.text !== null),
        );
        if (holds) return;
        findings.push(
          ruleFinding(visit, {
            rule: UX_EMPTY_REGION.id,
            severity: 'fix',
            node: match,
            message: { key: 'checkRule.uxEmptyRegion', params: {} },
            hint: { key: 'checkHint.uxEmptyRegion', params: {} },
          }),
        );
      });
    }
    return findings;
  },
};

const stateShift: StatesRule = {
  id: UX_STATE_SHIFT.id,
  run({ baseline, visits }) {
    const findings: RawFinding[] = [];
    for (const visit of visits) {
      if (visit.stateKind === 'baseline') continue;
      const reported = new Set<string>();
      const seenKs = new Map<string, number>();
      baseline.facts.nodes.forEach((node) => {
        const landmark = node.landmark;
        if (!node.ownKs || node.ks === null) return;
        // A mapped list has one element id on every item: the n-th item is compared with the n-th.
        const occurrence = seenKs.get(node.ks) ?? 0;
        seenKs.set(node.ks, occurrence + 1);
        if (landmark === null || !CHROME.includes(landmark)) return;
        if (reported.has(landmark)) return;
        const match = nthOwnKs(visit, node.ks, occurrence);
        const moved = visit.facts.nodes[match];
        if (!moved) return;
        const dx = Math.round(moved.box[0] - node.box[0]);
        const dy = Math.round(moved.box[1] - node.box[1]);
        const tolerance = UX_STATE_SHIFT.thresholds.tolerance;
        if (Math.abs(dx) <= tolerance && Math.abs(dy) <= tolerance) return;
        reported.add(landmark);
        findings.push(
          ruleFinding(visit, {
            rule: UX_STATE_SHIFT.id,
            severity: 'review',
            node: match,
            message: { key: 'checkRule.uxStateShift', params: { landmark } },
            hint: { key: 'checkHint.uxStateShift', params: { landmark, dx, dy } },
            // The draft's states move it, even when the block is a kit component.
            kit: 'keep',
          }),
        );
      });
    }
    return findings;
  },
};

export const UX_FLOW_STATE_RULES: StatesRule[] = [emptyRegion, stateShift];
