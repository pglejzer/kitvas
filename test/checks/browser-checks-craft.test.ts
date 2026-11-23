// The browser checks of a craft board: the visits it gets and the craft rules over what they found.

import assert from 'node:assert/strict';
import { join } from 'node:path';
import { test } from 'node:test';
import {
  BROWSER_RULES,
  type BrowserInput,
  type BrowserRules,
  browserChecks,
  CRAFT_RULES,
  type CraftFacts,
  type CraftRule,
  MAX_FINDINGS_PER_RULE,
  ruleFinding,
  type Visit,
  visitPlan,
} from '../../src/checks/index.ts';
import { fakeBrowser } from '../helpers/checks.ts';
import { page } from './rules/facts.ts';

const DIR = join('drafts', 'mark', 'v1');

const input = (over: Partial<BrowserInput> = {}): BrowserInput => ({
  versionDir: DIR,
  states: ['filled'],
  ids: [],
  catalog: [],
  deep: false,
  screen: null,
  baseline: 'filled',
  ...over,
});

const NO_RULES: BrowserRules = { visit: [], states: [], deep: [], deepWidth: [] };

/** An icon board whose sketch A paints a fixed red. */
const RED: CraftFacts = {
  subject: 'icon',
  sketches: [
    {
      sketch: 'A',
      node: null,
      viewBox: '0 0 20 20',
      stroke: 1.75,
      filled: false,
      caps: 'round',
      fixedColours: ['#ff0000ff'],
      thinnestPx16: 1.4,
      thinnestPx32: null,
    },
  ],
  kit: [],
  logoContrast: [],
  mono: [],
};

const factsOf = (shown: Visit) =>
  page([], { viewport: [shown.width, shown.height], scrollWidth: shown.width });

/** A craft rule that keeps what it was given and reports `count` page-level findings. */
function spy(count = 1) {
  const seen: [string, number, CraftFacts][] = [];
  const rule: CraftRule = {
    id: 'ui/icon-colour',
    run({ visit, craft }) {
      seen.push([visit.seen.state, visit.seen.width, craft]);
      const message = { key: 'checkRule.uiIconColour', params: { sketch: 'A' } };
      return Array.from({ length: count }, () =>
        ruleFinding(visit, {
          rule: 'ui/icon-colour',
          severity: 'fix',
          node: null,
          message,
          hint: message,
        }),
      );
    },
  };
  return { rule, seen };
}

test('a craft board is visited at 390 and 1280 with the craft pass only, deep or not', async () => {
  const craftPlan = [
    [390, 844, ['craft'], true],
    [1280, 900, ['craft'], true],
  ];
  const plan = (deep: boolean, kind?: BrowserInput['kind']) =>
    visitPlan(deep, kind).map((one) => [one.width, one.height, one.passes, one.shot]);
  assert.deepEqual(plan(false, 'craft'), craftPlan);
  assert.deepEqual(plan(true, 'craft'), craftPlan);
  const fake = fakeBrowser();
  const result = await browserChecks(fake.browser, input({ kind: 'craft', deep: true }), NO_RULES);
  assert.deepEqual(
    fake.visits.map((one) => [one.state, one.width, one.passes]),
    [
      ['filled', 390, ['craft']],
      ['filled', 1280, ['craft']],
    ],
  );
  assert.deepEqual(
    result.shots.map((shot) => shot.file),
    ['build/shots/filled-390.png', 'build/shots/filled-1280.png'],
  );
});

test('a draft with no kind, a screen and a rework draft keep the screen plan', () => {
  const screen = visitPlan(false).map((one) => one.passes);
  assert.deepEqual(screen, [
    ['reflow', 'focus', 'spacing'],
    ['focus', 'spacing'],
  ]);
  assert.deepEqual(
    visitPlan(false, 'screen').map((one) => one.passes),
    screen,
  );
  assert.deepEqual(
    visitPlan(false, 'rework').map((one) => one.passes),
    screen,
  );
  assert.equal(visitPlan(true, 'rework').length, 5);
});

test('craft rules run on each main visit that brings craft facts', async () => {
  const { rule, seen } = spy();
  const fake = fakeBrowser((shown) => ({
    facts: factsOf(shown),
    craft: shown.passes.includes('craft') ? RED : null,
  }));
  const result = await browserChecks(fake.browser, input({ kind: 'craft' }), {
    ...NO_RULES,
    craft: [rule],
  });
  assert.deepEqual(seen, [
    ['filled', 390, RED],
    ['filled', 1280, RED],
  ]);
  assert.deepEqual(
    result.findings.map((finding) => [finding.rule, finding.widths]),
    [
      ['ui/icon-colour', [390]],
      ['ui/icon-colour', [1280]],
    ],
  );
  // A screen draft's visits bring no craft facts: the rule never runs.
  seen.length = 0;
  await browserChecks(fake.browser, input(), { ...NO_RULES, craft: [rule] });
  assert.deepEqual(seen, []);
});

test('craft rules are capped like the others, and left out when the rules have none', async () => {
  const { rule, seen } = spy(12);
  const fake = fakeBrowser((shown) => ({ facts: factsOf(shown), craft: RED }));
  const capped = await browserChecks(fake.browser, input({ kind: 'craft' }), {
    ...NO_RULES,
    craft: [rule],
  });
  assert.equal(capped.findings.length, 2 * MAX_FINDINGS_PER_RULE);
  seen.length = 0;
  const none = await browserChecks(fake.browser, input({ kind: 'craft' }), NO_RULES);
  assert.deepEqual(none.findings, []);
  assert.deepEqual(seen, []);
});

test('the book craft rules run by default: a fixed colour is reported at both widths', async () => {
  assert.equal(BROWSER_RULES.craft, CRAFT_RULES);
  const fake = fakeBrowser((shown) => ({ facts: factsOf(shown), craft: RED }));
  const result = await browserChecks(fake.browser, input({ kind: 'craft' }));
  const colour = result.findings.filter((finding) => finding.rule === 'ui/icon-colour');
  assert.deepEqual(
    colour.map((finding) => [finding.severity, finding.widths, finding.hint]),
    [
      ['fix', [390], { key: 'checkHint.uiIconColour', params: { colours: '#ff0000ff' } }],
      ['fix', [1280], { key: 'checkHint.uiIconColour', params: { colours: '#ff0000ff' } }],
    ],
  );
});

test('a board that did not load measured nothing: no craft rule runs on it', async () => {
  const { rule, seen } = spy();
  const fake = fakeBrowser(() => ({ rendered: false, facts: null, craft: RED }));
  const result = await browserChecks(fake.browser, input({ kind: 'craft' }), {
    ...NO_RULES,
    craft: [rule],
  });
  assert.deepEqual(seen, []);
  assert.deepEqual(
    result.findings.map((finding) => finding.rule),
    ['runtime/blank', 'runtime/blank'],
  );
});
