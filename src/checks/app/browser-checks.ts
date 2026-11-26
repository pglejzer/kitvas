// The checks that need a browser: every state at every viewport, with a screenshot each, and the
// ui, ux and a11y rules over what each visit measured (ADR 0044).

import { join } from 'node:path';
import type { DraftOption } from '../../shared/index.ts';
import type { IdEntry } from '../domain/code/ids.ts';
import type { RawFinding, Shot } from '../domain/findings/finding.ts';
import { MAX_FINDINGS_PER_RULE } from '../domain/guidelines/index.ts';
import { DEEP_VIEWPORTS, TABLET_VIEWPORT } from '../domain/page/facts.ts';
import {
  a11yFindings,
  componentsOf,
  type PageReport,
  runtimeFindings,
  type Seen,
  VIEWPORTS,
} from '../domain/page/page.ts';
import { type CatalogComponent, usageFindings } from '../domain/page/usage.ts';
import {
  CRAFT_RULES,
  type CraftRule,
  DEEP_RULES,
  DEEP_WIDTH_RULE_IDS,
  type DeepRule,
  STATE_RULES,
  type StatesRule,
  stateKind,
  VISIT_RULES,
  type VisitInput,
  type VisitRule,
} from '../domain/rules/index.ts';
import type { Browser, Pass } from '../ports/browser.ts';

export type BrowserInput = {
  /** Absolute folder of the draft version. */
  versionDir: string;
  states: string[];
  ids: IdEntry[];
  catalog: CatalogComponent[];
  /** `kitvas check --deep`: the stress passes and the deep widths. */
  deep: boolean;
  /** The layout's `Screen:` kind; null when it has none. */
  screen: string | null;
  /** The state the others are compared with: `filled` when the draft has it, else its default. */
  baseline: string;
  /** The draft's kind; `'screen'` when not given. A craft board is visited with the `craft` pass. */
  kind?: 'screen' | 'rework' | 'craft';
  /** The version's options (plan 25); each value other than its default is visited once more. */
  options?: readonly DraftOption[];
};

export type BrowserResult = {
  findings: RawFinding[];
  shots: Shot[];
  /** The shots of the other option values, each with the default combination's shot beside it. */
  optionShots: OptionShot[];
  browser: string;
  /** Some visit measured only the first FACTS_NODE_CAP elements. */
  truncated: boolean;
  /** Every visit that measured facts; the rework rules of `runChecks` read them. */
  visits: VisitInput[];
};

/** The rules the browser checks run; tests pass their own. */
export type BrowserRules = {
  visit: readonly VisitRule[];
  states: readonly StatesRule[];
  deep: readonly DeepRule[];
  /** Ids of the visit rules that also run at the deep widths. */
  deepWidth: readonly string[];
  /** The rules of a craft board, on the visits whose report has craft facts; none when left out. */
  craft?: readonly CraftRule[];
};

export const BROWSER_RULES: BrowserRules = {
  visit: VISIT_RULES,
  states: STATE_RULES,
  deep: DEEP_RULES,
  deepWidth: DEEP_WIDTH_RULE_IDS,
  craft: CRAFT_RULES,
};

/** One visit of a state: its size, its passes, and whether it gets a screenshot. */
export type VisitPlan = { width: number; height: number; passes: Pass[]; shot: boolean };

/**
 * A phone and a laptop with their passes (both `states`, only the laptop `press`), a tablet
 * measured only (ADR 0074), and with `deep` the deep widths, measured only. A craft
 * board gets the phone and the laptop with the `craft` pass alone, `deep` or not: it is a board of
 * sketches, not a screen to stress.
 */
export function visitPlan(deep: boolean, kind: BrowserInput['kind'] = 'screen'): VisitPlan[] {
  const extra: Pass[] = deep ? ['deep'] : [];
  const [phone, laptop] = VIEWPORTS;
  if (kind === 'craft') {
    return [
      { ...phone, passes: ['craft'], shot: true },
      { ...laptop, passes: ['craft'], shot: true },
    ];
  }
  const plan: VisitPlan[] = [
    { ...phone, passes: ['reflow', 'focus', 'states', 'spacing', ...extra], shot: true },
    { ...laptop, passes: ['focus', 'states', 'spacing', 'press', ...extra], shot: true },
    { ...TABLET_VIEWPORT, passes: [], shot: false },
  ];
  if (!deep) return plan;
  return [...plan, ...DEEP_VIEWPORTS.map((size) => ({ ...size, passes: [], shot: false }))];
}

const isMainWidth = (width: number): boolean =>
  VIEWPORTS.some((viewport) => viewport.width === width);

/** At most MAX_FINDINGS_PER_RULE findings of one rule from one run of it. */
const capped = (found: RawFinding[]): RawFinding[] => found.slice(0, MAX_FINDINGS_PER_RULE);

/**
 * The rules over the visits that have facts. At the phone and laptop widths every visit rule
 * runs, the deep rules where the visit has deep facts and the craft rules where it has craft
 * facts; at the deep widths only the rules named in `deepWidth`. The state rules run once per main
 * width: the baseline state's visit against the other states' visits, and not at all when the
 * baseline has no facts there.
 */
export function runRules(visits: readonly VisitInput[], rules: BrowserRules): RawFinding[] {
  const findings: RawFinding[] = [];
  const atDeepWidth = rules.visit.filter((rule) => rules.deepWidth.includes(rule.id));
  for (const visit of visits) {
    const main = isMainWidth(visit.seen.width);
    for (const rule of main ? rules.visit : atDeepWidth) findings.push(...capped(rule.run(visit)));
    if (!main) continue;
    const { deep, craft } = visit.report;
    if (deep !== null) {
      for (const rule of rules.deep) findings.push(...capped(rule.run({ visit, deep })));
    }
    if (craft !== null) {
      for (const rule of rules.craft ?? []) findings.push(...capped(rule.run({ visit, craft })));
    }
  }
  for (const { width } of VIEWPORTS) {
    const here = visits.filter((visit) => visit.seen.width === width);
    const baseline = here.find((visit) => visit.stateKind === 'baseline');
    if (baseline === undefined) continue;
    const others = here.filter((visit) => visit !== baseline);
    for (const rule of rules.states) {
      findings.push(...capped(rule.run({ width, baseline, visits: others })));
    }
  }
  return findings;
}

/** One browser for the whole run, closed at the end whatever happens. */
export async function browserChecks(
  browser: Browser,
  input: BrowserInput,
  rules: BrowserRules = BROWSER_RULES,
): Promise<BrowserResult> {
  const session = await browser.open();
  const findings: RawFinding[] = [];
  const shots: Shot[] = [];
  const visits: VisitInput[] = [];
  let truncated = false;
  const page = join(input.versionDir, 'build', 'html', 'index.html');
  const optionShots: OptionShot[] = [];
  /** The visits of each other value, kept apart: their rules run with the value as their option. */
  const byValue = new Map<string, { value: OtherValue; visits: VisitInput[] }>();
  try {
    for (const state of input.states) {
      for (const { width, height, passes, shot } of visitPlan(input.deep, input.kind)) {
        const file = `build/shots/${state}-${width}.png`;
        const screenshot = shot ? join(input.versionDir, ...file.split('/')) : null;
        const report = await session.visit({
          page,
          state,
          width,
          height,
          screenshot,
          passes,
          options: {},
        });
        const seen = {
          state,
          width,
          ids: input.ids,
          components: componentsOf(report.usage),
        };
        // The deep widths add the layout rules only; errors, axe and usage are the same page's.
        if (isMainWidth(width)) findings.push(...pageFindings(report, seen, input));
        if (screenshot !== null && report.shot) shots.push({ state, width, file });
        // A page that did not load measured nothing: the runtime findings say why.
        if (report.facts === null) continue;
        if (report.facts.truncated) truncated = true;
        visits.push({
          facts: report.facts,
          report,
          seen,
          catalog: input.catalog,
          screen: input.screen,
          stateKind: stateKind(state, input.baseline),
        });
      }
    }
    // Each option's other values, one at a time, in the baseline state at the two main widths:
    // never the product of the options (plan 25, C7). A craft board has no options.
    const others = input.kind === 'craft' ? [] : otherValues(input.options ?? []);
    for (const other of others) {
      for (const { width, height, passes: planned, shot } of visitPlan(input.deep, input.kind)) {
        if (!shot) continue;
        // The controls are used once per state; another value of an option keeps `states` only.
        const passes = planned.filter((pass) => pass !== 'press');
        const stem = `build/shots/${input.baseline}-${width}`;
        const file = `${stem}.${other.id}-${other.value}.png`;
        const screenshot = join(input.versionDir, ...file.split('/'));
        const report = await session.visit({
          page,
          state: input.baseline,
          width,
          height,
          screenshot,
          passes,
          options: { [other.id]: other.value },
        });
        const seen = {
          state: input.baseline,
          width,
          ids: input.ids,
          components: componentsOf(report.usage),
        };
        findings.push(...tagged(pageFindings(report, seen, input), other));
        if (report.shot) optionShots.push({ ...other, width, file, base: `${stem}.png` });
        if (report.facts === null) continue;
        if (report.facts.truncated) truncated = true;
        const group = byValue.get(`${other.id}=${other.value}`) ?? { value: other, visits: [] };
        group.visits.push({
          facts: report.facts,
          report,
          seen,
          catalog: input.catalog,
          screen: input.screen,
          stateKind: 'baseline',
        });
        byValue.set(`${other.id}=${other.value}`, group);
      }
    }
  } finally {
    await session.close();
  }
  // A craft board is laid out by kitvas: only the craft rules judge it, never the screen rules.
  const used = input.kind === 'craft' ? { ...rules, visit: [], states: [], deep: [] } : rules;
  findings.push(...runRules(visits, used));
  // A value's visits are no states: the rules that compare states never see them.
  for (const group of byValue.values()) {
    findings.push(...tagged(runRules(group.visits, { ...used, states: [] }), group.value));
  }
  return { findings, shots, optionShots, browser: session.name, truncated, visits };
}

/** One value of an option other than its default. */
export type OtherValue = { id: string; value: string };

/** The shot of an option's value, with the default combination's shot it is held against. */
export type OptionShot = OtherValue & {
  width: number;
  /** Relative to the draft version, like the shots of `checks.json`. */
  file: string;
  base: string;
};

/** Every value that is not its option's default, in the options' order. */
export function otherValues(options: readonly DraftOption[]): OtherValue[] {
  return options.flatMap((option) =>
    option.values
      .filter((value) => value.id !== option.default)
      .map((value) => ({ id: option.id, value: value.id })),
  );
}

const tagged = (found: RawFinding[], other: OtherValue): RawFinding[] =>
  found.map((finding) => ({ ...finding, options: [{ id: other.id, value: other.value }] }));

/** What one visit's report says on its own: errors, axe and the kit's components in use. */
function pageFindings(report: PageReport, seen: Seen, input: BrowserInput): RawFinding[] {
  return [
    ...runtimeFindings(report, seen),
    ...a11yFindings(report.violations, seen),
    ...usageFindings({
      usage: report.usage,
      catalog: input.catalog,
      ids: input.ids,
      state: seen.state,
      width: seen.width,
    }),
  ];
}
