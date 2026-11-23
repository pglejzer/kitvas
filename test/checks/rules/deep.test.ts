import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  DEEP_RULES,
  type DeepFacts,
  type DeepRule,
  type FactNode,
  guidelinesWhere,
  LONG_NUMBER,
  type Message,
  type RawFinding,
} from '../../../src/checks/index.ts';
import { node, page, text, visit } from './facts.ts';

const QUIET: DeepFacts = {
  longText: { clipped: [], over: [] },
  longNumber: { clipped: [], over: [] },
  motion: null,
  orientation: null,
  contrast: [],
};

/** Deep facts that would make every rule speak about nodes 0 and 1. */
const LOUD: DeepFacts = {
  longText: { clipped: [0], over: [1] },
  longNumber: { clipped: [0], over: [1] },
  motion: { running: [0], autoplay: [1], pause: false },
  orientation: { landscape: 10, portrait: 900, rotated: true },
  contrast: [{ node: 0, ratio: 1.5, large: false }],
};

const CHIP = 'sections/Tags:div/span';
const LINE = 'sections/Tags:div/p';
const IDS = [{ id: CHIP, file: 'src/tsx/sections/Tags.tsx', line: 6, column: 9, tag: 'span' }];

type VisitPart = NonNullable<Parameters<typeof visit>[1]>;

function rule(id: string): DeepRule {
  const found = DEEP_RULES.find((entry) => entry.id === id);
  assert.ok(found, id);
  return found;
}

function run(
  id: string,
  nodes: FactNode[],
  deep: Partial<DeepFacts>,
  part: VisitPart = {},
  width = 390,
): RawFinding[] {
  const facts = page(nodes, { viewport: [width, width === 390 ? 844 : 900], scrollWidth: width });
  return rule(id).run({ visit: visit(facts, part), deep: { ...QUIET, ...deep } });
}

/** A finding of the baseline state at one width, with no place unless the element is CHIP. */
function expected(
  ruleId: string,
  severity: RawFinding['severity'],
  element: string | null,
  message: Message,
  hint: Message,
  width = 390,
): RawFinding {
  const place =
    element === CHIP
      ? { file: 'src/tsx/sections/Tags.tsx', line: 6, column: 9 }
      : { file: null, line: 0, column: 0 };
  return {
    check: ruleId.startsWith('ui/') ? 'ui' : 'a11y',
    rule: ruleId,
    severity,
    ...place,
    element,
    message,
    hint,
    states: ['filled'],
    widths: [width],
  };
}

const say = (key: string, params: Message['params'] = {}): Message => ({ key, params });

test('every deep entry of the book has its rule, and every deep rule its entry', () => {
  const book = guidelinesWhere({ mode: 'deep' });
  assert.deepEqual(
    book.map((entry) => entry.id).sort(),
    DEEP_RULES.map((entry) => entry.id).sort(),
  );
  for (const entry of book) assert.equal(entry.id.split('/')[0], entry.check, entry.id);
});

test('ui/long-text reports each element that clips or runs past the edge once', () => {
  const nodes = [
    node({ ks: CHIP, text: text('Beta') }),
    node({ ks: LINE, text: text('Free returns on every order') }),
    // The same element id as the chip: one finding for both.
    node({ ks: CHIP, parent: 0 }),
  ];
  const findings = run(
    'ui/long-text',
    nodes,
    { longText: { clipped: [0], over: [1, 2] } },
    { seen: { ids: IDS } },
  );
  assert.deepEqual(findings, [
    expected(
      'ui/long-text',
      'review',
      CHIP,
      say('checkRule.uiLongText', { factor: 3 }),
      say('checkHint.uiLongText'),
    ),
    expected(
      'ui/long-text',
      'review',
      LINE,
      say('checkRule.uiLongText', { factor: 3 }),
      say('checkHint.uiLongText'),
    ),
  ]);
});

test('ui/long-text skips visually hidden text, indexes outside the facts and an empty page', () => {
  // A visually hidden label is clipped on purpose (spike 11a.3).
  const hidden = node({ ks: 'sections/Form:label', box: [0, 0, 1, 1], hidden: true });
  assert.deepEqual(run('ui/long-text', [hidden], { longText: { clipped: [0], over: [7] } }), []);
  assert.deepEqual(run('ui/long-text', [node({ ks: CHIP })], {}), []);
  assert.deepEqual(run('ui/long-text', [], { longText: { clipped: [0], over: [1] } }), []);
});

test('ui/long-text inside a kit component goes to the kit owners', () => {
  const ks = 'sections/Tags:Badge';
  const findings = run(
    'ui/long-text',
    [node({ ks })],
    { longText: { clipped: [0], over: [] } },
    { seen: { components: new Map([[ks, 'Badge']]) } },
  );
  assert.deepEqual(findings, [
    expected(
      'ui/long-text',
      'review',
      ks,
      say('checkRule.uiLongText', { factor: 3 }),
      say('checkHint.kitInternal', { component: 'Badge' }),
    ),
  ]);
});

test('ui/long-number reports the cells a long number breaks, at the visit width', () => {
  const nodes = [node({ ks: CHIP, text: text('$12.00') }), node({ ks: LINE, text: text('24') })];
  const findings = run(
    'ui/long-number',
    nodes,
    { longNumber: { clipped: [0], over: [1] } },
    { seen: { ids: IDS } },
    1280,
  );
  const message = say('checkRule.uiLongNumber', { number: LONG_NUMBER });
  assert.deepEqual(findings, [
    expected('ui/long-number', 'review', CHIP, message, say('checkHint.uiLongNumber'), 1280),
    expected('ui/long-number', 'review', LINE, message, say('checkHint.uiLongNumber'), 1280),
  ]);
  // Long text does not speak for long numbers, nor the other way round.
  assert.deepEqual(run('ui/long-number', nodes, { longText: { clipped: [0], over: [1] } }), []);
  assert.deepEqual(run('ui/long-number', [], { longNumber: { clipped: [0], over: [] } }), []);
});

test('a11y/orientation: a rotated page or lost text is one page-level fix', () => {
  const nodes = [node({ text: text('Order summary') })];
  const rotated = run('a11y/orientation', nodes, {
    orientation: { landscape: 500, portrait: 500, rotated: true },
  });
  assert.deepEqual(rotated, [
    expected(
      'a11y/orientation',
      'fix',
      null,
      say('checkRule.a11yOrientation'),
      say('checkHint.a11yOrientation', { landscape: 500, portrait: 500 }),
    ),
  ]);
  const lost = run('a11y/orientation', nodes, {
    orientation: { landscape: 24, portrait: 800, rotated: false },
  });
  assert.deepEqual(lost, [
    expected(
      'a11y/orientation',
      'fix',
      null,
      say('checkRule.a11yOrientation'),
      say('checkHint.a11yOrientation', { landscape: 24, portrait: 800 }),
    ),
  ]);
});

test('a11y/orientation stays silent when landscape keeps half the text or more', () => {
  const nodes = [node({ text: text('Order summary') })];
  const at = (landscape: number, portrait: number) =>
    run('a11y/orientation', nodes, { orientation: { landscape, portrait, rotated: false } });
  assert.deepEqual(at(400, 800), []);
  assert.deepEqual(at(900, 800), []);
  assert.deepEqual(at(0, 0), []);
  // Not measured: the 1280 visit, or the pass failed.
  assert.deepEqual(run('a11y/orientation', nodes, { orientation: null }), []);
  assert.deepEqual(
    run('a11y/orientation', [], { orientation: { landscape: 0, portrait: 800, rotated: true } }),
    [],
  );
});

test('a11y/motion reports each moving element that nothing pauses', () => {
  const spinner = 'sections/Hero:div';
  const video = 'sections/Hero:video';
  const nodes = [node({ ks: spinner }), node({ ks: video, tag: 'video' })];
  const findings = run('a11y/motion', nodes, {
    motion: { running: [0], autoplay: [1], pause: false },
  });
  assert.deepEqual(findings, [
    expected(
      'a11y/motion',
      'review',
      spinner,
      say('checkRule.a11yMotion'),
      say('checkHint.a11yMotion'),
    ),
    expected(
      'a11y/motion',
      'review',
      video,
      say('checkRule.a11yMotion'),
      say('checkHint.a11yMotion'),
    ),
  ]);
});

test('a11y/motion is silent with a pause control, without the pass and on an empty page', () => {
  const nodes = [node({ ks: 'sections/Hero:div' })];
  assert.deepEqual(
    run('a11y/motion', nodes, { motion: { running: [0], autoplay: [], pause: true } }),
    [],
  );
  assert.deepEqual(
    run('a11y/motion', nodes, { motion: { running: [], autoplay: [], pause: false } }),
    [],
  );
  assert.deepEqual(run('a11y/motion', nodes, { motion: null }), []);
  assert.deepEqual(
    run('a11y/motion', [], { motion: { running: [0], autoplay: [], pause: false } }),
    [],
  );
});

test('a11y/motion inside a kit component goes to the kit owners', () => {
  const ks = 'sections/Hero:Spinner';
  const findings = run(
    'a11y/motion',
    [node({ ks })],
    { motion: { running: [0], autoplay: [], pause: false } },
    { seen: { components: new Map([[ks, 'Spinner']]) } },
  );
  assert.deepEqual(findings, [
    expected(
      'a11y/motion',
      'review',
      ks,
      say('checkRule.a11yMotion'),
      say('checkHint.kitInternal', { component: 'Spinner' }),
    ),
  ]);
});

test('a11y/contrast-on-image: under 4.5, or under 3 for large text, is a fix', () => {
  const ks = (at: number) => `sections/Hero:p${at}`;
  const nodes = [0, 1, 2, 3, 4].map((at) => node({ ks: ks(at), text: text('Fresh bread daily') }));
  const findings = run('a11y/contrast-on-image', nodes, {
    contrast: [
      { node: 0, ratio: 2.13, large: false },
      { node: 1, ratio: 3.5, large: true },
      { node: 2, ratio: 4.49, large: false },
      { node: 3, ratio: 4.5, large: false },
      { node: 4, ratio: 2.99, large: true },
      // Outside the facts.
      { node: 9, ratio: 1.2, large: false },
    ],
  });
  const message = say('checkRule.a11yContrastOnImage');
  const hint = (ratio: number, min: number) => say('checkHint.a11yContrastOnImage', { ratio, min });
  assert.deepEqual(findings, [
    expected('a11y/contrast-on-image', 'fix', ks(0), message, hint(2.13, 4.5)),
    expected('a11y/contrast-on-image', 'fix', ks(2), message, hint(4.49, 4.5)),
    expected('a11y/contrast-on-image', 'fix', ks(4), message, hint(2.99, 3)),
  ]);
});

test('a11y/contrast-on-image is silent with no samples, hidden text and on an empty page', () => {
  const hidden = node({ ks: 'sections/Hero:span', box: [0, 0, 1, 1], hidden: true });
  const low = { node: 0, ratio: 1.4, large: false };
  assert.deepEqual(run('a11y/contrast-on-image', [node()], {}), []);
  assert.deepEqual(run('a11y/contrast-on-image', [hidden], { contrast: [low] }), []);
  assert.deepEqual(run('a11y/contrast-on-image', [], { contrast: [low] }), []);
});

test('every deep rule returns nothing for an empty page, whatever the passes say', () => {
  for (const entry of DEEP_RULES) {
    assert.deepEqual(entry.run({ visit: visit(page([])), deep: LOUD }), [], entry.id);
  }
});
