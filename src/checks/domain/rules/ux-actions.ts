// Rules: ux actions and links (primary actions, button and link text).

import type { RawFinding } from '../findings/finding.ts';
import {
  UX_BUTTON_TEXT,
  UX_DANGER_PRIMARY,
  UX_DEAD_CONTROL,
  UX_FLOW_WORDS,
  UX_LINK_TEXT,
  UX_ONE_PRIMARY,
  UX_SAME_TEXT_LINKS,
} from '../guidelines/ux-flow.ts';
import { contrast, parseColour } from './colour.ts';
import { ruleFinding, sectionKey, usageAt, type VisitInput, type VisitRule } from './types.ts';

const list = (values: readonly string[]): readonly string[] => values;

/** The node that roots the nearest landmark of `index`: the highest ancestor with the same landmark. */
export function landmarkRoot(input: VisitInput, index: number): number {
  const { nodes } = input.facts;
  const landmark = nodes[index]?.landmark ?? null;
  let at = index;
  for (;;) {
    const parent = nodes[at]?.parent ?? -1;
    if (parent === -1 || landmark === null || nodes[parent]?.landmark !== landmark) return at;
    at = parent;
  }
}

/** Primary by the kit's catalog: true, false, or null when the catalog cannot say. */
function primaryByCatalog(input: VisitInput, ks: string | null): boolean | null {
  if (ks === null) return null;
  const record = usageAt(input, ks);
  if (!record) return null;
  const entry = input.catalog.find((candidate) => candidate.name === record.component);
  if (!entry) return null;
  for (const name of UX_FLOW_WORDS.variantProps) {
    const prop = entry.props.find((candidate) => candidate.name === name);
    if (!prop) continue;
    const passed = record.props[name];
    const value = passed === undefined || passed === null ? prop.default : passed;
    if (value === undefined) return null;
    const word = String(value).toLowerCase();
    if (list(UX_FLOW_WORDS.primaryValues).includes(word)) return true;
    if (list(UX_FLOW_WORDS.notPrimaryValues).includes(word)) return false;
    return null;
  }
  return null;
}

/** A filled own background that stands out from what is behind it. */
function primaryByStyle(input: VisitInput, index: number): boolean {
  const style = input.facts.nodes[index]?.style;
  if (!style) return false;
  const background = parseColour(style.background);
  if (!background || background.a === 0) return false;
  return contrast(style.background, style.ground) >= UX_ONE_PRIMARY.thresholds.minContrast;
}

function isPrimary(input: VisitInput, index: number): boolean {
  const node = input.facts.nodes[index];
  if (!node?.action) return false;
  return primaryByCatalog(input, node.ks) ?? primaryByStyle(input, index);
}

/** The group an action belongs to: its form, else its landmark, else its section file. */
function groupOf(input: VisitInput, index: number): string {
  const { nodes } = input.facts;
  for (let at = nodes[index]?.parent ?? -1; at !== -1; at = nodes[at]?.parent ?? -1) {
    if (nodes[at]?.tag === 'form') return `form:${at}`;
  }
  if (nodes[index]?.landmark) return `landmark:${landmarkRoot(input, index)}`;
  return `section:${sectionKey(nodes[index]?.ks ?? null) ?? ''}`;
}

/** Per group, the first node of each distinct element id that holds a primary action. */
function primariesByGroup(input: VisitInput): Map<string, number[]> {
  const groups = new Map<string, number[]>();
  const seen = new Set<string>();
  input.facts.nodes.forEach((node, index) => {
    if (!node.action || !isPrimary(input, index)) return;
    const group = groupOf(input, index);
    const key = `${group}|${node.ks ?? `node:${index}`}`;
    if (seen.has(key)) return;
    seen.add(key);
    groups.set(group, [...(groups.get(group) ?? []), index]);
  });
  return groups;
}

const onePrimary: VisitRule = {
  id: UX_ONE_PRIMARY.id,
  run(input) {
    const findings: RawFinding[] = [];
    for (const nodes of primariesByGroup(input).values()) {
      const second = nodes[UX_ONE_PRIMARY.thresholds.maxPrimary];
      if (second === undefined) continue;
      findings.push(
        ruleFinding(input, {
          rule: UX_ONE_PRIMARY.id,
          severity: 'review',
          node: second,
          message: {
            key: 'checkRule.uxOnePrimary',
            params: { name: input.facts.nodes[second]?.action?.name ?? '' },
          },
          hint: { key: 'checkHint.uxOnePrimary', params: {} },
        }),
      );
    }
    return findings;
  },
};

const dangerPattern = new RegExp(`\\b(${UX_FLOW_WORDS.danger.join('|')})\\b`, 'i');

const dangerPrimary: VisitRule = {
  id: UX_DANGER_PRIMARY.id,
  run(input) {
    const findings: RawFinding[] = [];
    for (const nodes of primariesByGroup(input).values()) {
      const [only, ...rest] = nodes;
      const name = only === undefined ? '' : (input.facts.nodes[only]?.action?.name ?? '');
      if (only === undefined || rest.length > 0 || !dangerPattern.test(name)) continue;
      findings.push(
        ruleFinding(input, {
          rule: UX_DANGER_PRIMARY.id,
          severity: 'review',
          node: only,
          message: { key: 'checkRule.uxDangerPrimary', params: { name } },
          hint: { key: 'checkHint.uxDangerPrimary', params: {} },
        }),
      );
    }
    return findings;
  },
};

const buttonText: VisitRule = {
  id: UX_BUTTON_TEXT.id,
  run(input) {
    const findings: RawFinding[] = [];
    const seen = new Set<string>();
    input.facts.nodes.forEach((node, index) => {
      if (node.action?.kind !== 'button') return;
      const name = node.action.name.trim();
      if (!list(UX_FLOW_WORDS.vagueButtons).includes(name.toLowerCase())) return;
      const key = node.ks ?? `node:${index}`;
      if (seen.has(key)) return;
      seen.add(key);
      findings.push(
        ruleFinding(input, {
          rule: UX_BUTTON_TEXT.id,
          severity: 'review',
          node: index,
          message: { key: 'checkRule.uxButtonText', params: { name } },
          hint: { key: 'checkHint.uxButtonText', params: {} },
          kit: 'keep',
        }),
      );
    });
    return findings;
  },
};

const linkText: VisitRule = {
  id: UX_LINK_TEXT.id,
  run(input) {
    const findings: RawFinding[] = [];
    const seen = new Set<string>();
    input.facts.nodes.forEach((node, index) => {
      if (node.action?.kind !== 'link') return;
      const name = node.action.name.trim();
      const lower = name.toLowerCase();
      if (!list(UX_FLOW_WORDS.vagueLinks).includes(lower)) return;
      if (lower !== node.action.text.trim().toLowerCase()) return;
      const key = node.ks ?? `node:${index}`;
      if (seen.has(key)) return;
      seen.add(key);
      findings.push(
        ruleFinding(input, {
          rule: UX_LINK_TEXT.id,
          severity: 'review',
          node: index,
          message: { key: 'checkRule.uxLinkText', params: { name } },
          hint: { key: 'checkHint.uxLinkText', params: {} },
          kit: 'keep',
        }),
      );
    });
    return findings;
  },
};

const sameTextLinks: VisitRule = {
  id: UX_SAME_TEXT_LINKS.id,
  run(input) {
    const byName = new Map<string, { node: number; name: string; hrefs: Set<string> }>();
    input.facts.nodes.forEach((node, index) => {
      if (node.action?.kind !== 'link') return;
      const href = node.action.href?.trim() ?? '';
      const name = node.action.name.trim();
      if (name === '' || href === '' || href === '#') return;
      const entry = byName.get(name.toLowerCase()) ?? { node: index, name, hrefs: new Set() };
      entry.hrefs.add(href);
      byName.set(name.toLowerCase(), entry);
    });
    const findings: RawFinding[] = [];
    for (const entry of byName.values()) {
      if (entry.hrefs.size < 2) continue;
      findings.push(
        ruleFinding(input, {
          rule: UX_SAME_TEXT_LINKS.id,
          severity: 'review',
          node: entry.node,
          message: { key: 'checkRule.uxSameTextLinks', params: { name: entry.name } },
          hint: { key: 'checkHint.uxSameTextLinks', params: {} },
          kit: 'keep',
        }),
      );
    }
    return findings;
  },
};

const DEAD_KEY = {
  button: 'checkRule.uxDeadControl',
  choice: 'checkRule.uxDeadControlChoice',
  select: 'checkRule.uxDeadControlSelect',
  search: 'checkRule.uxDeadControlSearch',
} as const;

const deadControl: VisitRule = {
  id: UX_DEAD_CONTROL.id,
  run(input) {
    const findings: RawFinding[] = [];
    // In an empty, loading or error state what a filter governs is not on the page: only a
    // button is asked to answer there.
    const filled = input.stateKind === 'baseline' || input.stateKind === 'other';
    for (const read of input.facts.press) {
      if (read.kind !== 'button' && !filled) continue;
      const dead = read.kind === 'button' ? read.effect === 'none' : read.effect !== 'page';
      if (!dead || !input.facts.nodes[read.node]) continue;
      findings.push(
        ruleFinding(input, {
          rule: UX_DEAD_CONTROL.id,
          severity: 'review',
          node: read.node,
          message: { key: DEAD_KEY[read.kind], params: { name: read.name } },
          hint: { key: 'checkHint.uxDeadControl', params: {} },
          kit: 'keep',
        }),
      );
    }
    return findings;
  },
};

export const UX_ACTION_RULES: VisitRule[] = [
  onePrimary,
  dangerPrimary,
  buttonText,
  deadControl,
  linkText,
  sameTextLinks,
];
