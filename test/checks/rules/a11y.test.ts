import assert from 'node:assert/strict';
import { test } from 'node:test';
import { A11Y_REFLOW } from '../../../src/checks/domain/guidelines/a11y.ts';
import {
  type ActionFacts,
  type FieldFacts,
  type FocusStop,
  guidelineFor,
  type NodeStyle,
  type RawFinding,
  VISIT_RULES,
  type VisitInput,
} from '../../../src/checks/index.ts';
import { node, page, visit } from './facts.ts';

function run(id: string, input: VisitInput): RawFinding[] {
  const rule = VISIT_RULES.find((entry) => entry.id === id);
  assert.ok(rule, `rule ${id} is registered`);
  return rule.run(input);
}

/** The parts of a finding a test is about. */
function brief(findings: RawFinding[]) {
  return findings.map((f) => ({
    rule: f.rule,
    severity: f.severity,
    element: f.element,
    message: f.message.key,
    hint: f.hint.key,
  }));
}

function field(part: Partial<FieldFacts> = {}): FieldFacts {
  return {
    control: 'input',
    type: 'text',
    name: '',
    value: '',
    placeholder: '',
    required: false,
    invalid: false,
    autocomplete: '',
    label: 'visible',
    labelText: '',
    labelBox: null,
    described: [],
    group: -1,
    groupName: '',
    form: -1,
    mark: null,
    ...part,
  };
}

function action(part: Partial<ActionFacts> = {}): ActionFacts {
  return {
    kind: 'button',
    name: 'Menu',
    text: '',
    href: null,
    submit: false,
    disabled: false,
    menu: false,
    current: null,
    lines: 1,
    ...part,
  };
}

function stop(part: Partial<FocusStop> = {}): FocusStop {
  return {
    node: 0,
    changed: true,
    ring: null,
    ringGround: null,
    defaultRing: false,
    covered: 'none',
    ...part,
  };
}

const empty = visit(page([]));

test('every a11y rule has a guideline entry and gives nothing on an empty page', () => {
  const ids = [
    'a11y/reflow',
    'a11y/text-spacing',
    'a11y/focus-visible',
    'a11y/focus-hidden',
    'a11y/focus-order',
    'a11y/control-contrast',
    'a11y/icon-contrast',
    'a11y/focus-contrast',
    'a11y/contrast-unsure',
    'a11y/error-text',
    'a11y/autocomplete',
  ];
  for (const id of ids) {
    assert.ok(guidelineFor(id), `${id} has an entry`);
    assert.deepEqual(run(id, empty), [], id);
  }
  assert.equal(guidelineFor('a11y/focus-order')?.basis, 'heuristic');
});

test('reflow reports the elements past the edge at 320', () => {
  const facts = page([node({ ks: 'a', tag: 'div' }), node({ tag: 'span' })], {
    reflow: { scrollWidth: 400, over: [0] },
  });
  assert.deepEqual(brief(run('a11y/reflow', visit(facts))), [
    {
      rule: 'a11y/reflow',
      severity: 'fix',
      element: 'a',
      message: 'checkRule.a11yReflow',
      hint: 'checkHint.a11yReflow',
    },
  ]);
});

test('reflow stays silent when 390 overflows, when 320 fits, and without the pass', () => {
  const overflowing = page([node()], {
    scrollWidth: 500,
    reflow: { scrollWidth: 500, over: [0] },
  });
  assert.deepEqual(run('a11y/reflow', visit(overflowing)), []);
  const fits = page([node()], { reflow: { scrollWidth: 320, over: [0] } });
  assert.deepEqual(run('a11y/reflow', visit(fits)), []);
  assert.deepEqual(run('a11y/reflow', visit(page([node()]))), []);
});

test('reflow skips tables, code and media, and what sits inside them', () => {
  const nodes = [
    node({ tag: 'table' }),
    node({ tag: 'td', parent: 0 }),
    node({ tag: 'pre' }),
    node({ tag: 'img' }),
    node({ tag: 'p' }),
  ];
  const facts = page(nodes, { reflow: { scrollWidth: 600, over: [0, 1, 2, 3, 4] } });
  assert.deepEqual(
    brief(run('a11y/reflow', visit(facts))).map((f) => f.rule),
    ['a11y/reflow'],
  );
});

test('reflow reports at most the cap', () => {
  const nodes = Array.from({ length: A11Y_REFLOW.thresholds.cap + 3 }, () => node());
  const over = nodes.map((_, index) => index);
  const facts = page(nodes, { reflow: { scrollWidth: 600, over } });
  assert.equal(run('a11y/reflow', visit(facts)).length, A11Y_REFLOW.thresholds.cap);
});

test('text-spacing reports clipped and overlapping nodes once each', () => {
  const facts = page([node({ ks: 'a' }), node({ ks: 'b' })], {
    spacing: { clipped: [0], overlapping: [0, 1] },
  });
  assert.deepEqual(brief(run('a11y/text-spacing', visit(facts))), [
    {
      rule: 'a11y/text-spacing',
      severity: 'fix',
      element: 'a',
      message: 'checkRule.a11yTextSpacing',
      hint: 'checkHint.a11yTextSpacing',
    },
    {
      rule: 'a11y/text-spacing',
      severity: 'fix',
      element: 'b',
      message: 'checkRule.a11yTextSpacing',
      hint: 'checkHint.a11yTextSpacing',
    },
  ]);
  const clean = page([node()], { spacing: { clipped: [], overlapping: [] } });
  assert.deepEqual(run('a11y/text-spacing', visit(clean)), []);
  assert.deepEqual(run('a11y/text-spacing', visit(page([node()]))), []);
});

test('focus-visible reports a stop that shows no change', () => {
  const facts = page([node({ ks: 'a' }), node({ ks: 'b' })], {
    focus: [stop({ node: 0, changed: false }), stop({ node: 1 })],
  });
  assert.deepEqual(brief(run('a11y/focus-visible', visit(facts))), [
    {
      rule: 'a11y/focus-visible',
      severity: 'fix',
      element: 'a',
      message: 'checkRule.a11yFocusVisible',
      hint: 'checkHint.a11yFocusVisible',
    },
  ]);
});

test('focus-hidden is fix when fully covered and review when partly', () => {
  const facts = page([node({ ks: 'a' }), node({ ks: 'b' }), node({ ks: 'c' })], {
    focus: [
      stop({ node: 0, covered: 'fully' }),
      stop({ node: 1, covered: 'partly' }),
      stop({ node: 2, covered: 'none' }),
    ],
  });
  assert.deepEqual(
    brief(run('a11y/focus-hidden', visit(facts))).map((f) => [f.element, f.severity]),
    [
      ['a', 'fix'],
      ['b', 'review'],
    ],
  );
});

test('focus-order reports a stop clearly above the previous one in the same column', () => {
  const nodes = [
    node({ ks: 'a', box: [0, 400, 100, 20] }),
    node({ ks: 'b', box: [10, 100, 100, 20] }),
  ];
  const facts = page(nodes, { focus: [stop({ node: 0 }), stop({ node: 1 })] });
  assert.deepEqual(brief(run('a11y/focus-order', visit(facts))), [
    {
      rule: 'a11y/focus-order',
      severity: 'review',
      element: 'b',
      message: 'checkRule.a11yFocusOrder',
      hint: 'checkHint.a11yFocusOrder',
    },
  ]);
});

test('focus-order stays silent for a normal order, another column, a fixed bar', () => {
  const down = page([node({ box: [0, 100, 100, 20] }), node({ box: [0, 200, 100, 20] })], {
    focus: [stop({ node: 0 }), stop({ node: 1 })],
  });
  assert.deepEqual(run('a11y/focus-order', visit(down)), []);
  const other = page([node({ box: [0, 400, 100, 20] }), node({ box: [300, 100, 50, 20] })], {
    focus: [stop({ node: 0 }), stop({ node: 1 })],
  });
  assert.deepEqual(run('a11y/focus-order', visit(other)), []);
  const bar = page(
    [
      node({ box: [0, 400, 100, 20] }),
      node({ box: [0, 0, 100, 20], style: { position: 'fixed' } }),
    ],
    { focus: [stop({ node: 0 }), stop({ node: 1 })] },
  );
  assert.deepEqual(run('a11y/focus-order', visit(bar)), []);
});

const FAINT: Partial<NodeStyle> = {
  background: '#f4f4f4ff',
  borderColor: '#e0e0e0ff',
  border: [1, 1, 1, 1],
};

type NodePart = NonNullable<Parameters<typeof node>[0]>;

function lowContrastField(label: FieldFacts['label'], extra: NodePart = {}) {
  return node({
    ks: 'f',
    tag: 'input',
    field: field({ label }),
    ...extra,
    style: { ...FAINT, ...extra.style },
  });
}

test('control-contrast is fix without a visible label and review with one', () => {
  const unlabeled = page([node(), lowContrastField('none', { parent: 0 })]);
  assert.deepEqual(brief(run('a11y/control-contrast', visit(unlabeled))), [
    {
      rule: 'a11y/control-contrast',
      severity: 'fix',
      element: 'f',
      message: 'checkRule.a11yControlContrast',
      hint: 'checkHint.a11yControlContrast',
    },
  ]);
  const labeled = page([node(), lowContrastField('visible', { parent: 0 })]);
  assert.equal(run('a11y/control-contrast', visit(labeled))[0]?.severity, 'review');
});

test('control-contrast stays silent for a dark border or a strong fill', () => {
  const border = page([
    node(),
    lowContrastField('none', { parent: 0, style: { borderColor: '#767676ff' } }),
  ]);
  assert.deepEqual(run('a11y/control-contrast', visit(border)), []);
  const fill = page([
    node(),
    lowContrastField('none', { parent: 0, style: { background: '#333333ff' } }),
  ]);
  assert.deepEqual(run('a11y/control-contrast', visit(fill)), []);
});

test('control-contrast compares with the parent ground, and treats a role switch as a control', () => {
  const facts = page([
    node({ style: { ground: '#222222ff' } }),
    node({
      ks: 's',
      tag: 'div',
      role: 'switch',
      parent: 0,
      style: { background: '#f4f4f4ff', ground: '#f4f4f4ff' },
    }),
  ]);
  assert.deepEqual(run('a11y/control-contrast', visit(facts)), []);
  const light = page([
    node(),
    node({ tag: 'div', role: 'switch', parent: 0, style: { background: '#f4f4f4ff' } }),
  ]);
  assert.equal(run('a11y/control-contrast', visit(light)).length, 1);
});

test('control-contrast leaves a native checkbox alone', () => {
  const facts = page([
    node(),
    node({ tag: 'input', parent: 0, field: field({ type: 'checkbox' }) }),
  ]);
  assert.deepEqual(run('a11y/control-contrast', visit(facts)), []);
});

test('control-contrast inside a kit component is review with the kitInternal hint', () => {
  const ks = 'sections/Form:Input';
  const facts = page([node(), lowContrastField('none', { parent: 0, ks })]);
  const input = visit(facts, {
    seen: { components: new Map([[ks, 'Input']]) },
    report: { usage: [{ id: ks, component: 'Input', props: {} }] },
  });
  const [finding] = run('a11y/control-contrast', input);
  assert.equal(finding?.severity, 'review');
  assert.deepEqual(finding?.hint, { key: 'checkHint.kitInternal', params: { component: 'Input' } });
});

test('icon-contrast reports an icon-only button whose icon is faint', () => {
  const facts = page([
    node({ ks: 'b', tag: 'button', action: action(), style: { ground: '#ffffffff' } }),
    node({ tag: 'svg', parent: 0, style: { stroke: '#ddddddff' } }),
  ]);
  assert.deepEqual(brief(run('a11y/icon-contrast', visit(facts))), [
    {
      rule: 'a11y/icon-contrast',
      severity: 'review',
      element: 'b',
      message: 'checkRule.a11yIconContrast',
      hint: 'checkHint.a11yIconContrast',
    },
  ]);
});

test('icon-contrast is silent for a dark icon, a button with text, or no svg', () => {
  const dark = page([
    node({ tag: 'button', action: action() }),
    node({ tag: 'svg', parent: 0, style: { fill: '#222222ff' } }),
  ]);
  assert.deepEqual(run('a11y/icon-contrast', visit(dark)), []);
  const withText = page([
    node({ tag: 'button', action: action({ text: 'Menu' }) }),
    node({ tag: 'svg', parent: 0, style: { stroke: '#dddddddd' } }),
  ]);
  assert.deepEqual(run('a11y/icon-contrast', visit(withText)), []);
  const noSvg = page([node({ tag: 'button', action: action() }), node({ tag: 'span', parent: 0 })]);
  assert.deepEqual(run('a11y/icon-contrast', visit(noSvg)), []);
});

test('focus-contrast reports a custom ring under 3:1, not the default ring', () => {
  const facts = page([node({ ks: 'a' }), node({ ks: 'b' }), node({ ks: 'c' })], {
    focus: [
      stop({ node: 0, ring: '#dddddd', ringGround: '#ffffffff' }),
      stop({ node: 1, ring: '#dddddd', ringGround: '#ffffffff', defaultRing: true }),
      stop({ node: 2, ring: '#1d4ed8', ringGround: '#ffffffff' }),
    ],
  });
  assert.deepEqual(brief(run('a11y/focus-contrast', visit(facts))), [
    {
      rule: 'a11y/focus-contrast',
      severity: 'fix',
      element: 'a',
      message: 'checkRule.a11yFocusContrast',
      hint: 'checkHint.a11yFocusContrast',
    },
  ]);
  const none = page([node()], { focus: [stop({ ring: null })] });
  assert.deepEqual(run('a11y/focus-contrast', visit(none)), []);
});

test('contrast-unsure reports each entry, page-level when the node is -1', () => {
  const facts = page([node({ ks: 'a' })]);
  const input = visit(facts, {
    report: {
      contrastUnsure: [
        { node: 0, element: 'a' },
        { node: -1, element: null },
      ],
    },
  });
  const found = run('a11y/contrast-unsure', input);
  assert.deepEqual(
    found.map((f) => [f.element, f.severity, f.rule]),
    [
      ['a', 'review', 'a11y/contrast-unsure'],
      [null, 'review', 'a11y/contrast-unsure'],
    ],
  );
});

test('error-text reports an invalid field with no linked text, in an error state only', () => {
  const bare = node({ ks: 'e', field: field({ invalid: true }) });
  const blank = node({
    field: field({ invalid: true, described: [{ text: ' ', box: null, errorMessage: true }] }),
  });
  const linked = node({
    field: field({
      invalid: true,
      described: [{ text: 'Enter an email.', box: [0, 0, 10, 10], errorMessage: true }],
    }),
  });
  const valid = node({ field: field() });
  const facts = page([bare, blank, linked, valid]);
  const found = run('a11y/error-text', visit(facts, { stateKind: 'error' }));
  assert.equal(found.length, 2);
  assert.deepEqual(brief(found.slice(0, 1)), [
    {
      rule: 'a11y/error-text',
      severity: 'fix',
      element: 'e',
      message: 'checkRule.a11yErrorText',
      hint: 'checkHint.a11yErrorText',
    },
  ]);
  assert.deepEqual(run('a11y/error-text', visit(facts)), []);
});

test('error-text keeps fix inside a kit component, because the draft owns the text', () => {
  const ks = 'sections/Form:Input';
  const facts = page([node({ ks, field: field({ invalid: true }) })]);
  const input = visit(facts, {
    stateKind: 'error',
    seen: { components: new Map([[ks, 'Input']]) },
  });
  assert.equal(run('a11y/error-text', input)[0]?.severity, 'fix');
});

test('autocomplete reports a user field with none, matching type, name and label', () => {
  const facts = page([
    node({ ks: 'a', field: field({ type: 'email' }) }),
    node({ ks: 'b', field: field({ name: 'firstName' }) }),
    node({ ks: 'c', field: field({ labelText: 'Postal code' }) }),
    node({ ks: 'd', field: field({ type: 'tel', autocomplete: 'tel' }) }),
    node({ ks: 'e', field: field({ name: 'hotel' }) }),
    node({ ks: 'f', field: field({ type: 'search', name: 'name' }) }),
    node({ ks: 'g', field: field({ labelText: 'Notes' }) }),
  ]);
  assert.deepEqual(
    brief(run('a11y/autocomplete', visit(facts))),
    ['a', 'b', 'c'].map((ks) => ({
      rule: 'a11y/autocomplete',
      severity: 'review',
      element: ks,
      message: 'checkRule.a11yAutocomplete',
      hint: 'checkHint.a11yAutocomplete',
    })),
  );
});

test('autocomplete skips a field inside a search landmark', () => {
  const facts = page([node({ landmark: 'search', field: field({ name: 'name' }) })]);
  assert.deepEqual(run('a11y/autocomplete', visit(facts)), []);
});
