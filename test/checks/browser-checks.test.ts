import assert from 'node:assert/strict';
import { join } from 'node:path';
import { test } from 'node:test';
import {
  BROWSER_RULES,
  type BrowserInput,
  type BrowserRules,
  browserChecks,
  type CatalogComponent,
  type DeepFacts,
  type DeepRule,
  MAX_FINDINGS_PER_RULE,
  type RawFinding,
  ruleFinding,
  runRules,
  type StatesInput,
  type StatesRule,
  type Visit,
  type VisitInput,
  type VisitRule,
  visitPlan,
} from '../../src/checks/index.ts';
import { fakeBrowser } from '../helpers/draft/checks.ts';
import { node, page, text, visit } from './rules/facts.ts';

const DIR = join('drafts', 'shop', 'v1');
const BUTTON: CatalogComponent = { name: 'Button', category: 'action', props: [], styling: [] };

const input = (over: Partial<BrowserInput> = {}): BrowserInput => ({
  versionDir: DIR,
  states: ['filled'],
  ids: [],
  catalog: [BUTTON],
  deep: false,
  screen: null,
  baseline: 'filled',
  ...over,
});

const NO_RULES: BrowserRules = { visit: [], states: [], deep: [], deepWidth: [] };

const DEEP: DeepFacts = {
  longText: { clipped: [], over: [] },
  longNumber: { clipped: [], over: [] },
  motion: null,
  orientation: null,
  contrast: [],
};

/** Facts of an empty page at the visit's size. */
const factsOf = (shown: Visit) =>
  page([], { viewport: [shown.width, shown.height], scrollWidth: shown.width });

const message = { key: 'checkRule.x', params: {} };

/** A visit rule that keeps what it was given and reports one page-level finding. */
function spy(id: string) {
  const inputs: VisitInput[] = [];
  const rule: VisitRule = {
    id,
    run(given) {
      inputs.push(given);
      return [
        ruleFinding(given, { rule: id, severity: 'review', node: null, message, hint: message }),
      ];
    },
  };
  return { rule, inputs };
}

const where = (inputs: VisitInput[]) => inputs.map((one) => [one.seen.state, one.seen.width]);
const placesOf = (findings: RawFinding[], rule: string) =>
  findings
    .filter((finding) => finding.rule === rule)
    .map((finding) => [finding.states[0], finding.widths[0]]);

test('every state is visited at 390 with reflow and at 1280 with a screenshot, and at 768 measured only', async () => {
  const fake = fakeBrowser();
  const result = await browserChecks(
    fake.browser,
    input({ states: ['filled', 'empty'] }),
    NO_RULES,
  );
  assert.deepEqual(
    fake.visits.map((one) => [one.state, one.width, one.height, one.passes]),
    [
      ['filled', 390, 844, ['reflow', 'focus', 'states', 'spacing']],
      ['filled', 1280, 900, ['focus', 'states', 'spacing', 'press']],
      ['filled', 768, 1024, []],
      ['empty', 390, 844, ['reflow', 'focus', 'states', 'spacing']],
      ['empty', 1280, 900, ['focus', 'states', 'spacing', 'press']],
      ['empty', 768, 1024, []],
    ],
  );
  assert.equal(fake.visits[0]?.page, join(DIR, 'build', 'html', 'index.html'));
  assert.equal(fake.visits[1]?.screenshot, join(DIR, 'build', 'shots', 'filled-1280.png'));
  assert.deepEqual(
    result.shots.map((shot) => shot.file),
    [
      'build/shots/filled-390.png',
      'build/shots/filled-1280.png',
      'build/shots/empty-390.png',
      'build/shots/empty-1280.png',
    ],
  );
  assert.equal(result.browser, 'fake');
  assert.equal(result.truncated, false);
});

test('deep adds its pass at 390 and 1280, and the deep widths with no pass and no screenshot', async () => {
  assert.deepEqual(
    visitPlan(true).map((plan) => [plan.width, plan.height, plan.passes, plan.shot]),
    [
      [390, 844, ['reflow', 'focus', 'states', 'spacing', 'deep'], true],
      [1280, 900, ['focus', 'states', 'spacing', 'press', 'deep'], true],
      [768, 1024, [], false],
      [1024, 768, [], false],
      [1440, 900, [], false],
      [1920, 1080, [], false],
      [2560, 1440, [], false],
    ],
  );
  const fake = fakeBrowser();
  const result = await browserChecks(fake.browser, input({ deep: true }), NO_RULES);
  assert.deepEqual(
    fake.visits.map((one) => [one.width, one.screenshot === null]),
    [
      [390, false],
      [1280, false],
      [768, true],
      [1024, true],
      [1440, true],
      [1920, true],
      [2560, true],
    ],
  );
  assert.deepEqual(
    result.shots.map((shot) => shot.width),
    [390, 1280],
  );
});

test('each visit with facts gets the rules with its screen, state kind, catalog and components', async () => {
  const fake = fakeBrowser((shown) => ({
    facts: factsOf(shown),
    usage: [{ id: 'sections/Hero:section/Button', component: 'Button', props: {} }],
  }));
  const all = spy('ui/any');
  const wide = spy('ui/page-overflow');
  const result = await browserChecks(
    fake.browser,
    input({ states: ['filled', 'empty-orders'], screen: 'form', deep: true }),
    { visit: [all.rule, wide.rule], states: [], deep: [], deepWidth: ['ui/page-overflow'] },
  );
  // Every visit rule at the main widths; at the deep widths only those named for them.
  assert.deepEqual(where(all.inputs), [
    ['filled', 390],
    ['filled', 1280],
    ['empty-orders', 390],
    ['empty-orders', 1280],
  ]);
  assert.deepEqual(where(wide.inputs), [
    ['filled', 390],
    ['filled', 1280],
    ['filled', 768],
    ['filled', 1024],
    ['filled', 1440],
    ['filled', 1920],
    ['filled', 2560],
    ['empty-orders', 390],
    ['empty-orders', 1280],
    ['empty-orders', 768],
    ['empty-orders', 1024],
    ['empty-orders', 1440],
    ['empty-orders', 1920],
    ['empty-orders', 2560],
  ]);
  assert.deepEqual(
    all.inputs.map((one) => [one.stateKind, one.screen, one.catalog, one.facts.viewport[0]]),
    [
      ['baseline', 'form', [BUTTON], 390],
      ['baseline', 'form', [BUTTON], 1280],
      ['empty', 'form', [BUTTON], 390],
      ['empty', 'form', [BUTTON], 1280],
    ],
  );
  const first = all.inputs[0];
  assert.equal(first?.report.facts, first?.facts);
  assert.equal(first?.seen.components.get('sections/Hero:section/Button'), 'Button');
  // Their findings come back with the visit's state and width.
  assert.deepEqual(placesOf(result.findings, 'ui/page-overflow'), where(wide.inputs));
  assert.equal(placesOf(result.findings, 'ui/any').length, 4);
});

test('state rules run once per main width: the baseline against the other states', async () => {
  const calls: StatesInput[] = [];
  const statesRule: StatesRule = {
    id: 'ux/states',
    run(given) {
      calls.push(given);
      return [];
    },
  };
  const rules = { ...NO_RULES, states: [statesRule] };
  const states = ['empty', 'filled', 'loading'];
  const fake = fakeBrowser((shown) => ({ facts: factsOf(shown) }));
  await browserChecks(fake.browser, input({ states, deep: true }), rules);
  assert.deepEqual(
    calls.map((call) => [
      call.width,
      call.baseline.seen.state,
      call.baseline.seen.width,
      call.visits.map((one) => [one.seen.state, one.seen.width, one.stateKind]),
    ]),
    [
      [
        390,
        'filled',
        390,
        [
          ['empty', 390, 'empty'],
          ['loading', 390, 'loading'],
        ],
      ],
      [
        1280,
        'filled',
        1280,
        [
          ['empty', 1280, 'empty'],
          ['loading', 1280, 'loading'],
        ],
      ],
    ],
  );

  // Where the baseline measured nothing, the state rules have nothing to compare with.
  calls.length = 0;
  const blank = fakeBrowser((shown) => ({
    facts: shown.state === 'filled' && shown.width === 390 ? null : factsOf(shown),
  }));
  await browserChecks(blank.browser, input({ states }), rules);
  assert.deepEqual(
    calls.map((call) => call.width),
    [1280],
  );
});

test('deep rules run on the visits that bring deep facts', async () => {
  const seen: [string, number, DeepFacts][] = [];
  const deepRule: DeepRule = {
    id: 'ui/long-text',
    run({ visit: given, deep }) {
      seen.push([given.seen.state, given.seen.width, deep]);
      return [];
    },
  };
  const rules = { ...NO_RULES, deep: [deepRule] };
  const answer = (shown: Visit) => ({
    facts: factsOf(shown),
    deep: shown.passes.includes('deep') ? DEEP : null,
  });
  await browserChecks(fakeBrowser(answer).browser, input({ deep: true }), rules);
  assert.deepEqual(seen, [
    ['filled', 390, DEEP],
    ['filled', 1280, DEEP],
  ]);
  seen.length = 0;
  await browserChecks(fakeBrowser(answer).browser, input(), rules);
  assert.deepEqual(seen, []);
});

test('a page that did not load gives its runtime findings and no rule runs', async () => {
  const all = spy('ui/any');
  const fake = fakeBrowser(() => ({ rendered: false }));
  const result = await browserChecks(fake.browser, input({ deep: true }), {
    ...NO_RULES,
    visit: [all.rule],
    deepWidth: ['ui/any'],
  });
  assert.deepEqual(all.inputs, []);
  // The deep widths add no runtime findings of their own.
  assert.deepEqual(
    result.findings.map((finding) => [finding.rule, finding.widths]),
    [
      ['runtime/blank', [390]],
      ['runtime/blank', [1280]],
    ],
  );
});

test('a blank page with empty facts: every rule of the book is silent, only runtime/blank stays', async () => {
  const fake = fakeBrowser((shown) => ({
    rendered: false,
    facts: factsOf(shown),
    deep: shown.passes.includes('deep') ? DEEP : null,
  }));
  const states = ['filled', 'empty', 'loading', 'error'];
  const result = await browserChecks(fake.browser, input({ states, deep: true }), BROWSER_RULES);
  assert.deepEqual([...new Set(result.findings.map((finding) => finding.rule))], ['runtime/blank']);
});

test('facts cut at the node cap are reported, and the rules still run on them', async () => {
  const all = spy('ui/any');
  const fake = fakeBrowser((shown) => ({
    facts: page([], { viewport: [shown.width, shown.height], truncated: shown.width === 1440 }),
  }));
  const rules = { ...NO_RULES, visit: [all.rule], deepWidth: ['ui/any'] };
  const cut = await browserChecks(fake.browser, input({ deep: true }), rules);
  assert.equal(cut.truncated, true);
  assert.equal(all.inputs.length, 7);
  const whole = await browserChecks(fake.browser, input(), rules);
  assert.equal(whole.truncated, false);
});

test('runRules keeps at most MAX_FINDINGS_PER_RULE findings of one rule on one visit', () => {
  const many: VisitRule = {
    id: 'ui/any',
    run(input) {
      return Array.from({ length: 12 }, () =>
        ruleFinding(input, {
          rule: 'ui/any',
          severity: 'review',
          node: 0,
          message: { key: 'checkRule.x', params: {} },
          hint: { key: 'checkHint.x', params: {} },
        }),
      );
    },
  };
  const rules: BrowserRules = { visit: [many], states: [], deep: [], deepWidth: [] };
  const found = runRules([visit(page([node({ text: text('Hello') })]))], rules);
  assert.equal(found.length, MAX_FINDINGS_PER_RULE);
  assert.equal(MAX_FINDINGS_PER_RULE, 5);
});

test('runRules: deep widths take only their rules and no deep rule; states group by width', () => {
  const all = spy('ui/any');
  const wide = spy('ui/clipped-text');
  let deepRuns = 0;
  const deepRule: DeepRule = {
    id: 'ui/long-number',
    run() {
      deepRuns += 1;
      return [];
    },
  };
  const widths: number[] = [];
  const statesRule: StatesRule = {
    id: 'ux/state-shift',
    run(given) {
      widths.push(given.width, given.visits.length);
      return [];
    },
  };
  const at = (width: number, state: string, kind: VisitInput['stateKind']) =>
    visit(page([node({ text: text('Hello') })], { viewport: [width, 900] }), {
      seen: { state, width },
      stateKind: kind,
      report: { deep: DEEP },
    });
  const rules: BrowserRules = {
    visit: [all.rule, wide.rule],
    states: [statesRule],
    deep: [deepRule],
    deepWidth: ['ui/clipped-text'],
  };
  const visits = [
    at(390, 'filled', 'baseline'),
    at(1440, 'filled', 'baseline'),
    at(390, 'error', 'error'),
  ];
  const findings = runRules(visits, rules);
  assert.deepEqual(where(all.inputs), [
    ['filled', 390],
    ['error', 390],
  ]);
  assert.deepEqual(where(wide.inputs), [
    ['filled', 390],
    ['filled', 1440],
    ['error', 390],
  ]);
  assert.equal(deepRuns, 2);
  // 390 has a baseline and one other state; 1280 has no visit at all.
  assert.deepEqual(widths, [390, 1]);
  assert.equal(findings.length, 5);
});
