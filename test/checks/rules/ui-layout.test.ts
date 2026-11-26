import assert from 'node:assert/strict';
import { test } from 'node:test';
import type { Box, FactNode, PageFacts, RawFinding } from '../../../src/checks/index.ts';
import { VISIT_RULES } from '../../../src/checks/index.ts';
import { node, page, text, visit } from './facts.ts';

function run(id: string, nodes: FactNode[], part: Partial<PageFacts> = {}): RawFinding[] {
  const rule = VISIT_RULES.find((entry) => entry.id === id);
  assert.ok(rule, id);
  return rule.run(visit(page(nodes, part)));
}

const brief = (finding: RawFinding) => ({
  rule: finding.rule,
  severity: finding.severity,
  element: finding.element,
  message: finding.message,
  hint: finding.hint,
  states: finding.states,
  widths: finding.widths,
});

const root = (): FactNode => node({ box: [0, 0, 390, 900] });
const bordered = { border: [1, 1, 1, 1] as [number, number, number, number] };

/** A card: a bordered block under the node at index 0. */
function card(
  box: Box,
  ks: string | null = null,
  style: Partial<FactNode['style']> = {},
): FactNode {
  return node({ parent: 0, box, ks, style: { ...bordered, ...style } });
}

test('page-overflow names the card that is wider than the screen', () => {
  const nodes = [
    root(),
    card([0, 100, 500, 300], 'sections/Signup:div/card'),
    node({ parent: 1, box: [10, 110, 200, 20], text: text('Sign up') }),
  ];
  const found = run('ui/page-overflow', nodes, { scrollWidth: 500 });
  assert.deepEqual(found.map(brief), [
    {
      rule: 'ui/page-overflow',
      severity: 'fix',
      element: 'sections/Signup:div/card',
      message: { key: 'checkRule.uiPageOverflow', params: { tag: 'div' } },
      hint: { key: 'checkHint.uiPageOverflow', params: { over: 110 } },
      states: ['filled'],
      widths: [390],
    },
  ]);
});

test('page-overflow names where the overflow starts, not the children pushed out with it', () => {
  const nodes = [
    root(),
    card([0, 100, 440, 300], 'sections/Signup:div/card'),
    node({ parent: 1, ks: 'sections/Signup:div/card/Input', box: [20, 120, 400, 40] }),
    node({ parent: 2, box: [24, 124, 392, 32], text: text('Email') }),
  ];
  const found = run('ui/page-overflow', nodes, { scrollWidth: 440 });
  assert.deepEqual(
    found.map((finding) => finding.element),
    ['sections/Signup:div/card'],
  );
});

test('page-overflow is silent when the page fits, and on an empty page', () => {
  assert.deepEqual(run('ui/page-overflow', [root(), card([0, 0, 500, 300])]), []);
  assert.deepEqual(run('ui/page-overflow', []), []);
});

test('page-overflow skips nodes in a sideways scroller and fixed nodes, and falls back to the page', () => {
  const scroller = node({ box: [0, 0, 390, 100], style: { overflowX: 'auto' } });
  const table = node({ parent: 0, box: [0, 0, 600, 100] });
  const found = run('ui/page-overflow', [scroller, table], { scrollWidth: 600 });
  assert.equal(found.length, 1);
  assert.equal(found[0]?.element, null);
  assert.deepEqual(found[0]?.message, { key: 'checkRule.uiPageOverflow', params: { tag: 'html' } });
  const fixed = node({ box: [0, 0, 600, 40], style: { position: 'fixed' } });
  assert.equal(run('ui/page-overflow', [fixed], { scrollWidth: 600 })[0]?.element, null);
});

test('clipped-text is a fix without an ellipsis and a review with one', () => {
  const clipped = (style: Partial<FactNode['style']>) =>
    node({
      ks: 'a:p/0',
      text: text('A long title'),
      scroll: [200, 100, 20, 20],
      style: { overflowX: 'hidden', ...style },
    });
  const fix = run('ui/clipped-text', [clipped({})]);
  assert.deepEqual(fix.map(brief), [
    {
      rule: 'ui/clipped-text',
      severity: 'fix',
      element: 'a:p/0',
      message: { key: 'checkRule.uiClippedText', params: { tag: 'div' } },
      hint: { key: 'checkHint.uiClippedText', params: {} },
      states: ['filled'],
      widths: [390],
    },
  ]);
  assert.equal(
    run('ui/clipped-text', [clipped({ textOverflow: 'ellipsis' })])[0]?.severity,
    'review',
  );
  assert.equal(run('ui/clipped-text', [clipped({ lineClamp: 2 })])[0]?.severity, 'review');
});

test('clipped-text counts text in a descendant', () => {
  const nodes = [
    node({ scroll: [100, 100, 80, 40], style: { overflowY: 'hidden' } }),
    node({ parent: 0, text: text('Hello') }),
  ];
  assert.equal(run('ui/clipped-text', nodes).length, 1);
});

test('clipped-text is silent inside the tolerance, with no text, and for a visually hidden label', () => {
  const near = node({ text: text('Hi'), scroll: [101, 100, 20, 20] });
  assert.deepEqual(run('ui/clipped-text', [near]), []);
  assert.deepEqual(run('ui/clipped-text', [node({ scroll: [200, 100, 20, 20] })]), []);
  const label = node({
    hidden: true,
    box: [0, 0, 1, 1],
    text: text('Email'),
    scroll: [50, 1, 1, 1],
  });
  assert.deepEqual(run('ui/clipped-text', [label]), []);
  assert.deepEqual(run('ui/clipped-text', []), []);
});

function headingStack(contentTop: number, badge = false): FactNode[] {
  const nodes = [
    root(),
    node({ parent: 0, box: [0, 0, 390, 200] }),
    node({ parent: 0, box: [0, 300, 390, 300] }),
  ];
  if (badge) nodes.push(node({ parent: 2, box: [20, 300, 60, 20] }));
  nodes.push(
    node({ parent: 2, box: [20, badge ? 330 : 300, 300, 30], heading: 2, ks: 'a:h2/0' }),
    node({ parent: 2, box: [20, contentTop, 300, 60] }),
  );
  return nodes;
}

test('heading-gap fires when the heading is no closer to its content than its group to the one above', () => {
  const found = run('ui/heading-gap', headingStack(460));
  assert.deepEqual(found.map(brief), [
    {
      rule: 'ui/heading-gap',
      severity: 'review',
      element: 'a:h2/0',
      message: { key: 'checkRule.uiHeadingGap', params: {} },
      hint: { key: 'checkHint.uiHeadingGap', params: { above: 100, below: 130 } },
      states: ['filled'],
      widths: [390],
    },
  ]);
});

test('heading-gap rounds its gaps and is silent for a group beside the one before it', () => {
  const nodes = headingStack(460.4);
  const fractional = nodes.map((one, index) =>
    index === 2 ? { ...one, box: [0, 300.3, 390, 300] as [number, number, number, number] } : one,
  );
  assert.deepEqual(run('ui/heading-gap', fractional).map(brief)[0]?.hint.params, {
    above: 100,
    below: 130,
  });
  const beside = nodes.map((one, index) =>
    index === 2 ? { ...one, box: [400, 0, 390, 600] as [number, number, number, number] } : one,
  );
  assert.deepEqual(run('ui/heading-gap', beside), []);
});

test('heading-gap is silent for a close heading, for a heading after a badge, and on an empty page', () => {
  assert.deepEqual(run('ui/heading-gap', headingStack(340)), []);
  assert.deepEqual(run('ui/heading-gap', headingStack(520, true)), []);
  assert.deepEqual(run('ui/heading-gap', []), []);
});

test('edge-gap fires on text close to either edge at 390', () => {
  const left = node({ ks: 'a:p/0', box: [8, 100, 200, 20], text: text('Left') });
  const right = node({ ks: 'a:p/1', box: [200, 140, 180, 20], text: text('Right') });
  const found = run('ui/edge-gap', [left, right]);
  assert.deepEqual(found.map(brief), [
    {
      rule: 'ui/edge-gap',
      severity: 'review',
      element: 'a:p/0',
      message: { key: 'checkRule.uiEdgeGap', params: {} },
      hint: { key: 'checkHint.uiEdgeGap', params: { gap: 8 } },
      states: ['filled'],
      widths: [390],
    },
    {
      rule: 'ui/edge-gap',
      severity: 'review',
      element: 'a:p/1',
      message: { key: 'checkRule.uiEdgeGap', params: {} },
      hint: { key: 'checkHint.uiEdgeGap', params: { gap: 10 } },
      states: ['filled'],
      widths: [390],
    },
  ]);
});

test('edge-gap is silent at 16 px, for blocks without text, at other widths, and when empty', () => {
  assert.deepEqual(run('ui/edge-gap', [node({ box: [16, 0, 200, 20], text: text('ok') })]), []);
  assert.deepEqual(run('ui/edge-gap', [node({ box: [2, 0, 200, 20] })]), []);
  const wide = run('ui/edge-gap', [node({ box: [2, 0, 200, 20], text: text('x') })], {
    viewport: [1280, 800],
    scrollWidth: 1280,
  });
  assert.deepEqual(wide, []);
  assert.deepEqual(run('ui/edge-gap', []), []);
});

function column(x: number, count: number): FactNode[] {
  return Array.from({ length: count }, (_, row) =>
    node({ box: [x, 100 + row * 40, 200, 20], text: text('Line') }),
  );
}

test('stray-edge fires on a block 3 px off a shared column', () => {
  const stray = node({ ks: 'a:p/9', box: [23, 400, 200, 20], text: text('Off') });
  const found = run('ui/stray-edge', [...column(20, 3), stray]);
  assert.deepEqual(found.map(brief), [
    {
      rule: 'ui/stray-edge',
      severity: 'review',
      element: 'a:p/9',
      message: { key: 'checkRule.uiStrayEdge', params: {} },
      hint: { key: 'checkHint.uiStrayEdge', params: { off: 3, column: 20 } },
      states: ['filled'],
      widths: [390],
    },
  ]);
});

test('stray-edge is silent for 1 px, 5 px, a hidden node, a small column, and when empty', () => {
  const at = (x: number, hidden = false) =>
    node({ box: [x, 400, 200, 20], text: text('Off'), hidden });
  assert.deepEqual(run('ui/stray-edge', [...column(20, 3), at(21)]), []);
  assert.deepEqual(run('ui/stray-edge', [...column(20, 3), at(25)]), []);
  assert.deepEqual(run('ui/stray-edge', [...column(20, 3), at(23, true)]), []);
  assert.deepEqual(run('ui/stray-edge', [...column(20, 2), at(23)]), []);
  assert.deepEqual(run('ui/stray-edge', []), []);
});

test('card-sizes fires once per row, at its first card', () => {
  const nodes = [
    root(),
    card([10, 100, 170, 200], 'a:div/0'),
    card([200, 100, 170, 230], 'a:div/1'),
  ];
  assert.deepEqual(run('ui/card-sizes', nodes).map(brief), [
    {
      rule: 'ui/card-sizes',
      severity: 'review',
      element: 'a:div/0',
      message: { key: 'checkRule.uiCardSizes', params: {} },
      hint: { key: 'checkHint.uiCardSizes', params: { diff: 30 } },
      states: ['filled'],
      widths: [390],
    },
  ]);
});

test('card-sizes is silent for a difference of 8 px, for stacked cards, and when empty', () => {
  const equalish = [root(), card([10, 100, 170, 200]), card([200, 100, 170, 208])];
  assert.deepEqual(run('ui/card-sizes', equalish), []);
  const stacked = [root(), card([10, 100, 350, 200]), card([10, 320, 350, 300])];
  assert.deepEqual(run('ui/card-sizes', stacked), []);
  assert.deepEqual(run('ui/card-sizes', []), []);
});

function grid(rows: number[]): FactNode[] {
  const nodes = [root()];
  rows.forEach((count, row) => {
    for (let at = 0; at < count; at += 1) {
      nodes.push(card([10 + at * 120, 100 + row * 220, 110, 200], `a:div/${nodes.length}`));
    }
  });
  return nodes;
}

test('orphan-card fires at a lone card after a row of 3', () => {
  assert.deepEqual(run('ui/orphan-card', grid([3, 1])).map(brief), [
    {
      rule: 'ui/orphan-card',
      severity: 'review',
      element: 'a:div/4',
      message: { key: 'checkRule.uiOrphanCard', params: {} },
      hint: { key: 'checkHint.uiOrphanCard', params: { perRow: 3 } },
      states: ['filled'],
      widths: [390],
    },
  ]);
});

test('orphan-card is silent for a full last row, a short grid, and when empty', () => {
  assert.deepEqual(run('ui/orphan-card', grid([3, 3])), []);
  assert.deepEqual(run('ui/orphan-card', grid([2, 1])), []);
  assert.deepEqual(run('ui/orphan-card', grid([1])), []);
  assert.deepEqual(run('ui/orphan-card', []), []);
});

test('nested-frame fires on a card inside a card, to any depth', () => {
  const nodes = [
    root(),
    card([10, 10, 350, 400], 'a:div/outer'),
    node({ parent: 1, box: [10, 10, 350, 300] }),
    node({ parent: 2, box: [20, 20, 100, 100], ks: 'a:div/inner', style: bordered }),
    node({ parent: 3, box: [24, 24, 80, 20], text: text('Inner') }),
  ];
  assert.deepEqual(run('ui/nested-frame', nodes).map(brief), [
    {
      rule: 'ui/nested-frame',
      severity: 'review',
      element: 'a:div/inner',
      message: { key: 'checkRule.uiNestedFrame', params: {} },
      hint: { key: 'checkHint.uiNestedFrame', params: {} },
      states: ['filled'],
      widths: [390],
    },
  ]);
});

test('nested-frame counts a fill as a frame cue', () => {
  const nodes = [
    root(),
    card([10, 10, 350, 400], 'a:div/outer'),
    node({
      parent: 1,
      box: [20, 20, 100, 100],
      ks: 'a:div/inner',
      style: { background: '#e0f2feff', ground: '#e0f2feff' },
    }),
    node({ parent: 2, box: [24, 24, 80, 20], text: text('Inner') }),
  ];
  assert.deepEqual(
    run('ui/nested-frame', nodes).map((finding) => finding.element),
    ['a:div/inner'],
  );
});

test('nested-frame ignores filled marks with nothing in them (chart bars, skeleton lines)', () => {
  const fill = { background: '#e0f2feff', ground: '#e0f2feff' };
  const marks = [
    node({ parent: 1, box: [20, 20, 90, 200], style: fill }),
    node({ parent: 1, box: [120, 20, 120, 32], style: fill }),
  ];
  assert.deepEqual(run('ui/nested-frame', [root(), card([10, 10, 350, 400]), ...marks]), []);
  // The same mark holding a control or a picture is a frame again.
  const holder = node({ parent: 1, box: [20, 20, 90, 200], style: fill });
  const picture = node({ parent: 2, tag: 'img', box: [24, 24, 40, 40] });
  assert.equal(
    run('ui/nested-frame', [root(), card([10, 10, 350, 400]), holder, picture]).length,
    1,
  );
});

test('nested-frame ignores a mark whose label sits outside its box (a bar with a callout)', () => {
  const fill = { background: '#e0f2feff', ground: '#e0f2feff' };
  const bar = node({ parent: 1, box: [20, 120, 90, 200], style: fill });
  // The callout is the bar's child, drawn above it.
  const callout = node({ parent: 2, box: [20, 90, 90, 20], text: text('Nov $84.2k') });
  assert.deepEqual(run('ui/nested-frame', [root(), card([10, 10, 350, 400]), bar, callout]), []);
  // The same text inside the box makes it a frame.
  const inside = node({ parent: 2, box: [24, 130, 80, 20], text: text('Nov $84.2k') });
  assert.equal(run('ui/nested-frame', [root(), card([10, 10, 350, 400]), bar, inside]).length, 1);
});

test('edge-gap skips text a sideways scroller cuts off, and still fires on a plain page', () => {
  const scroller = node({
    box: [16, 100, 358, 300],
    style: { overflowX: 'auto' },
  });
  const cell = (x: number): FactNode =>
    node({ parent: 0, ks: `a:td/${x}`, box: [x, 120, 80, 20], text: text('Cell') });
  // Both cells reach past the scroller's right edge, as columns of a wide table do at 390.
  const cut = [scroller, cell(300), cell(372 + 10)];
  assert.deepEqual(
    run('ui/edge-gap', cut).map((finding) => finding.element),
    [],
  );
  const plain = [node({ box: [16, 100, 358, 300] }), cell(300), cell(372 + 10)];
  assert.deepEqual(
    run('ui/edge-gap', plain).map((finding) => finding.element),
    ['a:td/300', 'a:td/382'],
  );
});

test('nested-frame ignores one-sided dividers and edge-to-edge bars (spike 3b: python.org)', () => {
  const divider = { border: [0, 1, 0, 0] as [number, number, number, number] };
  const bar = node({
    box: [0, 0, 390, 60],
    ks: 'a:header',
    style: { ...bordered, shadow: '0 1px 2px #0003' },
  });
  const nodes = [
    bar,
    node({ parent: 0, box: [10, 5, 120, 50], ks: 'a:header/li', style: divider }),
    card([20, 8, 200, 44], 'a:header/card'),
  ];
  nodes[2] = { ...nodes[2], parent: 0 } as FactNode;
  assert.deepEqual(run('ui/nested-frame', nodes), []);
});

test('nested-frame ignores a full-width tinted band, small boxes and controls', () => {
  const tint = { background: '#f3f4f6ff', ground: '#f3f4f6ff' };
  const band = node({ box: [0, 0, 390, 500], style: tint });
  const onBand = node({ parent: 0, box: [10, 10, 170, 200], style: { ...bordered, ...tint } });
  assert.deepEqual(run('ui/nested-frame', [band, onBand]), []);
  const small = [root(), card([10, 10, 350, 400]), card([20, 20, 30, 20])];
  assert.deepEqual(run('ui/nested-frame', small), []);
  const button = node({ parent: 1, tag: 'button', box: [20, 20, 100, 40], style: bordered });
  assert.deepEqual(run('ui/nested-frame', [root(), card([10, 10, 350, 400]), button]), []);
  assert.deepEqual(run('ui/nested-frame', []), []);
});

test('triple-frame fires on a border, a shadow and a fill at once', () => {
  const triple = node({
    box: [10, 10, 300, 200],
    ks: 'a:div/0',
    style: {
      ...bordered,
      shadow: '0 1px 2px #0003',
      background: '#f0f9ffff',
      ground: '#f0f9ffff',
    },
  });
  assert.deepEqual(run('ui/triple-frame', [triple]).map(brief), [
    {
      rule: 'ui/triple-frame',
      severity: 'review',
      element: 'a:div/0',
      message: { key: 'checkRule.uiTripleFrame', params: {} },
      hint: { key: 'checkHint.uiTripleFrame', params: {} },
      states: ['filled'],
      widths: [390],
    },
  ]);
});

test('triple-frame is silent with two cues, on a control, and when empty', () => {
  const two = node({
    box: [10, 10, 300, 200],
    style: { ...bordered, shadow: '0 1px 2px #0003' },
  });
  assert.deepEqual(run('ui/triple-frame', [two]), []);
  const input = node({
    tag: 'input',
    box: [10, 10, 300, 40],
    style: { ...bordered, shadow: 'x', background: '#f0f9ffff', ground: '#f0f9ffff' },
  });
  assert.deepEqual(run('ui/triple-frame', [input]), []);
  assert.deepEqual(run('ui/triple-frame', []), []);
});

test('shadow-count fires on 5 distinct shadows, once for the page', () => {
  const nodes = ['1', '2', '3', '4', '5'].map((blur) =>
    node({ style: { shadow: `0 ${blur}px 4px #0002` } }),
  );
  assert.deepEqual(run('ui/shadow-count', nodes).map(brief), [
    {
      rule: 'ui/shadow-count',
      severity: 'review',
      element: null,
      message: { key: 'checkRule.uiShadowCount', params: {} },
      hint: { key: 'checkHint.uiShadowCount', params: { count: 5 } },
      states: ['filled'],
      widths: [390],
    },
  ]);
});

test('shadow-count is silent for 4 distinct shadows, repeats, and an empty page', () => {
  const four = ['1', '2', '3', '4'].map((blur) => node({ style: { shadow: `0 ${blur}px #0002` } }));
  const repeats = Array.from({ length: 8 }, () => node({ style: { shadow: '0 1px #0002' } }));
  assert.deepEqual(run('ui/shadow-count', [...four, ...repeats]), []);
  assert.deepEqual(run('ui/shadow-count', []), []);
});

test('sticky-chrome fires when top and bottom bars take over a fifth of the height', () => {
  const nodes = [node({ ks: 'a:header/0' }), node({ ks: 'a:nav/0' })];
  const fixed = [
    { node: 0, edge: 'top' as const, height: 100 },
    { node: 1, edge: 'bottom' as const, height: 100 },
  ];
  assert.deepEqual(run('ui/sticky-chrome', nodes, { fixed }).map(brief), [
    {
      rule: 'ui/sticky-chrome',
      severity: 'review',
      element: 'a:header/0',
      message: { key: 'checkRule.uiStickyChrome', params: {} },
      hint: { key: 'checkHint.uiStickyChrome', params: { percent: 24 } },
      states: ['filled'],
      widths: [390],
    },
  ]);
});

test('sticky-chrome is silent for a small share, for other edges, and when empty', () => {
  const nodes = [node(), node()];
  const small = [{ node: 0, edge: 'top' as const, height: 100 }];
  assert.deepEqual(run('ui/sticky-chrome', nodes, { fixed: small }), []);
  const other = [
    { node: 0, edge: 'other' as const, height: 400 },
    { node: 1, edge: 'top' as const, height: 50 },
  ];
  assert.deepEqual(run('ui/sticky-chrome', nodes, { fixed: other }), []);
  assert.deepEqual(run('ui/sticky-chrome', []), []);
});
