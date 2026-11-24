// The rework rules: protected items kept in every version, the original's problems gone (C5).
// Pure: they read the facts of baseline visits and the findings of the original.

import type { RawFinding } from '../findings/finding.ts';
import type { FactNode } from '../page/facts.ts';
import { ruleFinding, type VisitInput } from '../rules/types.ts';
import type { Problems, ProtectedItem } from './before.ts';
import { normalise, priceValue } from './inventory.ts';

export const PROTECTED_RULE = 'ux/protected';
export const BEFORE_PROBLEMS_RULE = 'ux/before-problems';
export const NO_VIEWPORT_RULE = 'ui/no-viewport';

/** The ids of the rework rules, for the book guard. `ui/no-viewport` is reported only at capture. */
export const REWORK_RULE_IDS: readonly string[] = [
  PROTECTED_RULE,
  BEFORE_PROBLEMS_RULE,
  NO_VIEWPORT_RULE,
];

const NUMBER_IN_TEXT = /\d[\d.,]*/g;

/** The numbers written in a text, as the values `priceValue` reads. */
function numbersIn(text: string): number[] {
  const values: number[] = [];
  for (const token of text.match(NUMBER_IN_TEXT) ?? []) {
    const value = priceValue(token);
    if (value !== null) values.push(value);
  }
  return values;
}

type Haystack = { nodes: FactNode[]; texts: string[] };

function haystack(visit: VisitInput): Haystack {
  const nodes = visit.facts.nodes.filter((node) => !node.hidden);
  const texts = nodes.flatMap((node) => (node.text ? [normalise(node.text.sample)] : []));
  return { nodes, texts };
}

const contains = (haystackText: string, needle: string): boolean =>
  needle !== '' && haystackText.includes(needle);

/** Every word of `needle` appears in `haystackText`, in order: "start free trial" is within "start your free trial". */
function wordsWithin(haystackText: string, needle: string): boolean {
  const words = needle.split(' ').filter((word) => word !== '');
  if (words.length === 0) return false;
  let at = 0;
  for (const word of haystackText.split(' ')) {
    if (word === words[at]) at += 1;
    if (at === words.length) return true;
  }
  return false;
}

function matches(item: ProtectedItem, hay: Haystack): boolean {
  const find = normalise(item.find);
  if (find === '') return true;
  const { nodes, texts } = hay;
  const actionNames = nodes.flatMap((node) => (node.action ? [normalise(node.action.name)] : []));
  switch (item.kind) {
    case 'text':
    case 'heading':
    case 'link':
      return (
        texts.some((text) => contains(text, find)) ||
        actionNames.some((name) => contains(name, find))
      );
    case 'action':
      return actionNames.some(
        (name) => name !== '' && (wordsWithin(name, find) || wordsWithin(find, name)),
      );
    case 'field':
      return nodes.some(
        (node) =>
          node.field !== null &&
          (normalise(node.field.labelText) === find ||
            contains(normalise(node.field.labelText), find) ||
            normalise(node.field.name) === find),
      );
    case 'price': {
      const wanted = priceValue(item.find);
      if (wanted === null) return texts.some((text) => contains(text, find));
      return nodes.some((node) => (node.text ? numbersIn(node.text.sample) : []).includes(wanted));
    }
    case 'brand':
      return (
        texts.some((text) => contains(text, find)) ||
        nodes.some((node) => {
          if (node.image !== null && contains(normalise(node.image.alt ?? ''), find)) return true;
          if (node.tag !== 'svg' && node.tag !== 'img') return false;
          const name = node.action ? normalise(node.action.name) : '';
          return contains(name, find);
        })
      );
    case 'image':
      return nodes.some(
        (node) => node.image !== null && contains(normalise(node.image.alt ?? ''), find),
      );
  }
}

/** `ux/protected`: one page-level finding per protected item missing from a baseline visit. */
export function protectedFindings(items: ProtectedItem[], visits: VisitInput[]): RawFinding[] {
  const merged = new Map<string, RawFinding>();
  for (const visit of visits) {
    if (visit.stateKind !== 'baseline') continue;
    const hay = haystack(visit);
    for (const item of items) {
      if (matches(item, hay)) continue;
      const finding = ruleFinding(visit, {
        rule: PROTECTED_RULE,
        severity: 'fix',
        node: null,
        message: { key: 'checkRule.uxProtected', params: { id: item.id, find: item.find } },
        hint: { key: 'checkHint.uxProtected', params: {} },
        kit: 'keep',
      });
      const seen = merged.get(item.id);
      if (!seen) {
        merged.set(item.id, finding);
        continue;
      }
      for (const state of finding.states) if (!seen.states.includes(state)) seen.states.push(state);
      for (const width of finding.widths) if (!seen.widths.includes(width)) seen.widths.push(width);
    }
  }
  return [...merged.values()];
}

function countByRule(findings: RawFinding[]): Map<string, number> {
  const counts = new Map<string, number>();
  for (const finding of findings) counts.set(finding.rule, (counts.get(finding.rule) ?? 0) + 1);
  return counts;
}

/** `ux/before-problems`: one finding per rule that fires as often or more than on the original. */
export function beforeProblemFindings(before: Problems, after: RawFinding[]): RawFinding[] {
  const counts = countByRule(after);
  const found: RawFinding[] = [];
  for (const rule of Object.keys(before.counts).sort()) {
    const was = before.counts[rule] ?? 0;
    const now = counts.get(rule) ?? 0;
    if (was === 0 || now < was) continue;
    found.push({
      check: 'ux',
      rule: BEFORE_PROBLEMS_RULE,
      severity: 'review',
      file: null,
      line: 0,
      column: 0,
      element: null,
      message: { key: 'checkRule.uxBeforeProblems', params: { rule } },
      hint: { key: 'checkHint.uxBeforeProblems', params: { before: was, after: now } },
      states: [],
      widths: [],
    });
  }
  return found;
}

/** How many of the original's problems are gone and how many are left. */
export function reworkScore(
  before: Problems,
  after: RawFinding[],
): { fixed: number; left: number } {
  const counts = countByRule(after);
  let fixed = 0;
  let left = 0;
  for (const [rule, was] of Object.entries(before.counts)) {
    const now = counts.get(rule) ?? 0;
    fixed += Math.max(0, was - now);
    left += Math.min(was, now);
  }
  return { fixed, left };
}
