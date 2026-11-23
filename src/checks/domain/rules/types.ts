// What a rule of the ui, ux and a11y checks gets, and the helpers every rule shares (ADR 0043).
// Rules are pure and import no Node module, so stage 4 can run them inside the frame.

import type { DeepFacts, PageFacts } from '../facts.ts';
import type { CheckName, Message, RawFinding, Severity } from '../finding.ts';
import { elementPlace } from '../ids.ts';
import type { PageReport, Seen } from '../page.ts';
import type { CatalogComponent, UsageRecord } from '../usage.ts';

/** Which state a visit shows: the baseline (`filled` or the default) or a state named by prefix. */
export type StateKind = 'baseline' | 'empty' | 'loading' | 'error' | 'other';

export type VisitInput = {
  facts: PageFacts;
  report: PageReport;
  /** State, width, element ids, and element id → kit component name. */
  seen: Seen;
  catalog: CatalogComponent[];
  /** The layout's `Screen:` kind (one of the drafts module's SCREEN_KINDS); null when not given. */
  screen: string | null;
  stateKind: StateKind;
};

/** One width: the baseline state's visit and the other states' visits at that width. */
export type StatesInput = { width: number; baseline: VisitInput; visits: VisitInput[] };

export type DeepInput = { visit: VisitInput; deep: DeepFacts };

export type VisitRule = { id: string; run(input: VisitInput): RawFinding[] };
export type StatesRule = { id: string; run(input: StatesInput): RawFinding[] };
export type DeepRule = { id: string; run(input: DeepInput): RawFinding[] };

export type At = {
  /** `<check>/<name>`, the rule's own id. */
  rule: string;
  severity: Severity;
  /** Index in facts.nodes; null for a page-level finding. */
  node: number | null;
  message: Message;
  hint: Message;
  /**
   * 'review' (the default): a node inside a kit component makes the finding `review` with the
   * `checkHint.kitInternal` hint, because the kit's own markup decides it. 'keep': the draft owns
   * it (the labels, values and texts it passes to the component).
   */
  kit?: 'review' | 'keep';
};

/** The kit component a node belongs to (its own or nearest element id is a component's), or null. */
export function kitComponentOf(input: VisitInput, node: number): string | null {
  const ks = input.facts.nodes[node]?.ks ?? null;
  return ks === null ? null : (input.seen.components.get(ks) ?? null);
}

/** A finding at a node of one visit, with its element id, place, state and width filled in. */
export function ruleFinding(input: VisitInput, at: At): RawFinding {
  const check = (at.rule.split('/')[0] ?? '') as CheckName;
  const element = at.node === null ? null : (input.facts.nodes[at.node]?.ks ?? null);
  const component = at.node === null ? null : kitComponentOf(input, at.node);
  const internal = component !== null && at.kit !== 'keep';
  return {
    check,
    rule: at.rule,
    severity: internal ? 'review' : at.severity,
    ...elementPlace(input.seen.ids, element),
    element,
    message: at.message,
    hint: internal ? { key: 'checkHint.kitInternal', params: { component } } : at.hint,
    states: [input.seen.state],
    widths: [input.seen.width],
  };
}

/** `sections/Form:Card/form` → `sections/Form`: the section file an element is written in. */
export function sectionKey(ks: string | null): string | null {
  if (ks === null) return null;
  const at = ks.indexOf(':');
  return at === -1 ? null : ks.slice(0, at);
}

/** `empty…`, `loading…` and `error…` by prefix; the baseline id gives 'baseline'; else 'other'. */
export function stateKind(id: string, baseline: string): StateKind {
  if (id === baseline) return 'baseline';
  for (const kind of ['empty', 'loading', 'error'] as const) {
    if (id === kind || id.startsWith(`${kind}-`)) return kind;
  }
  return 'other';
}

/** The props a kit component was rendered with at that element id. */
export function usageAt(input: VisitInput, ks: string): UsageRecord | undefined {
  return input.report.usage.find((record) => record.id === ks);
}

/** Copy left from a template: always wrong. */
export const PLACEHOLDER_FIX = /\blorem ipsum\b|\bTODO\b|\bTBD\b/i;
/** A whole text that is only a generic word: probably left from a template. */
export const PLACEHOLDER_REVIEW =
  /^(title|label|button|heading|subtitle|description|text here|item \d+|feature (one|two|three|\d))$/i;
