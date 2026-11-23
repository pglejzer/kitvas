import assert from 'node:assert/strict';
import { test } from 'node:test';
import type { FactNode, NodeStyle } from '../../../src/checks/index.ts';
import { VISIT_RULES } from '../../../src/checks/index.ts';
import { node, page, text, visit } from './facts.ts';

type Spec = {
  sample?: string;
  chars?: number;
  lines?: number;
  longest?: number;
  heading?: number;
  ks?: string;
  style?: Partial<NodeStyle>;
};

function block(spec: Spec = {}): FactNode {
  const sample = spec.sample ?? 'x'.repeat(spec.chars ?? 100);
  return node({
    tag: spec.heading ? `h${spec.heading}` : 'p',
    heading: spec.heading ?? 0,
    ks: spec.ks ?? null,
    text: text(sample, spec.lines ?? 1, spec.longest ?? sample.length),
    ...(spec.style ? { style: spec.style } : {}),
  });
}

function run(id: string, nodes: FactNode[], width = 390, bodyFontSize = 16) {
  const rule = VISIT_RULES.find((entry) => entry.id === id);
  assert.ok(rule, `rule ${id} exists`);
  const facts = page(nodes, { viewport: [width, 800], bodyFontSize });
  return rule.run(visit(facts));
}

function brief(findings: ReturnType<typeof run>) {
  return findings.map((f) => ({
    rule: f.rule,
    severity: f.severity,
    element: f.element,
    message: f.message,
    hint: f.hint,
    widths: f.widths,
  }));
}

const IDS = [
  'ui/line-length',
  'ui/line-height',
  'ui/heading-line-height',
  'ui/text-size',
  'ui/type-sizes',
  'ui/type-weights',
  'ui/heading-scale',
  'ui/centered-text',
  'ui/justified-text',
];

test('every rule is registered and an empty page gives nothing', () => {
  for (const id of IDS) assert.deepEqual(run(id, []), [], id);
});

test('hidden text is ignored by every rule', () => {
  const hidden = node({
    hidden: true,
    text: text('x'.repeat(200), 4, 150),
    style: { fontSize: 10, textAlign: 'center', lineHeight: 10 },
  });
  for (const id of IDS) assert.deepEqual(run(id, [hidden]), [], id);
});

test('line-length: a paragraph of 3 lines over 80 characters a line fires', () => {
  const found = run('ui/line-length', [block({ ks: 'a:p/p', lines: 3, longest: 95.4 })], 1280);
  assert.deepEqual(brief(found), [
    {
      rule: 'ui/line-length',
      severity: 'review',
      element: 'a:p/p',
      message: { key: 'checkRule.uiLineLength', params: {} },
      hint: { key: 'checkHint.uiLineLength', params: { longest: 95 } },
      widths: [1280],
    },
  ]);
});

test('line-length: 76 characters, 2 lines, 80 exactly and headings stay silent', () => {
  assert.deepEqual(run('ui/line-length', [block({ lines: 3, longest: 76 })]), []);
  assert.deepEqual(run('ui/line-length', [block({ lines: 3, longest: 80 })]), []);
  assert.deepEqual(run('ui/line-length', [block({ lines: 2, longest: 120 })]), []);
  assert.deepEqual(run('ui/line-length', [block({ heading: 2, lines: 3, longest: 120 })]), []);
});

test('line-height: body text too tight or too loose fires', () => {
  const tight = run('ui/line-height', [
    block({ ks: 'a:p/p', lines: 3, style: { fontSize: 16, lineHeight: 17 } }),
  ]);
  assert.deepEqual(brief(tight), [
    {
      rule: 'ui/line-height',
      severity: 'review',
      element: 'a:p/p',
      message: { key: 'checkRule.uiLineHeight', params: {} },
      hint: { key: 'checkHint.uiLineHeight', params: { ratio: '1.06' } },
      widths: [390],
    },
  ]);
  const loose = run('ui/line-height', [
    block({ lines: 4, style: { fontSize: 16, lineHeight: 32 } }),
  ]);
  assert.equal(loose.length, 1);
});

test('line-height: a 3-line h1 at 1.05 and normal body text stay silent', () => {
  const h1 = block({ heading: 1, lines: 3, style: { fontSize: 46, lineHeight: 48.3 } });
  assert.deepEqual(run('ui/line-height', [h1]), []);
  assert.deepEqual(
    run('ui/line-height', [block({ lines: 3, style: { fontSize: 16, lineHeight: 24 } })]),
    [],
  );
  assert.deepEqual(
    run('ui/line-height', [block({ lines: 2, style: { fontSize: 16, lineHeight: 16 } })]),
    [],
  );
});

test('heading-line-height: a wrapped heading that is too loose or too tight fires', () => {
  const loose = run('ui/heading-line-height', [
    block({ ks: 'a:h2/h2', heading: 2, lines: 2, style: { fontSize: 24, lineHeight: 36 } }),
  ]);
  assert.deepEqual(brief(loose), [
    {
      rule: 'ui/heading-line-height',
      severity: 'review',
      element: 'a:h2/h2',
      message: { key: 'checkRule.uiHeadingLineHeight', params: {} },
      hint: { key: 'checkHint.uiHeadingLineHeight', params: { ratio: '1.50' } },
      widths: [390],
    },
  ]);
  const tight = run('ui/heading-line-height', [
    block({ heading: 2, lines: 2, style: { fontSize: 24, lineHeight: 21.6 } }),
  ]);
  assert.equal(tight.length, 1);
});

test('heading-line-height: the 1.05 h1, one-line headings and big text count as spiked', () => {
  const h1 = block({ heading: 1, lines: 3, style: { fontSize: 46, lineHeight: 48.3 } });
  assert.deepEqual(run('ui/heading-line-height', [h1]), []);
  const oneLine = block({ heading: 2, lines: 1, style: { fontSize: 24, lineHeight: 40 } });
  assert.deepEqual(run('ui/heading-line-height', [oneLine]), []);
  const body = block({ lines: 3, style: { fontSize: 16, lineHeight: 40 } });
  assert.deepEqual(run('ui/heading-line-height', [body]), []);
  // Text 1.5 times the body size counts as a heading without a tag.
  const big = block({ lines: 2, style: { fontSize: 24, lineHeight: 36 } });
  assert.equal(run('ui/heading-line-height', [big]).length, 1);
});

test('text-size: small body text and tiny text fire at 390', () => {
  const small = run('ui/text-size', [
    block({ ks: 'a:p/p', lines: 3, style: { fontSize: 13, lineHeight: 20 } }),
  ]);
  assert.deepEqual(brief(small), [
    {
      rule: 'ui/text-size',
      severity: 'review',
      element: 'a:p/p',
      message: { key: 'checkRule.uiTextSize', params: {} },
      hint: { key: 'checkHint.uiTextSize', params: { size: 13 } },
      widths: [390],
    },
  ]);
  const tiny = run('ui/text-size', [block({ lines: 1, style: { fontSize: 11, lineHeight: 16 } })]);
  assert.equal(tiny.length, 1);
  // One finding per node even when both conditions hold.
  const both = run('ui/text-size', [block({ lines: 3, style: { fontSize: 11, lineHeight: 16 } })]);
  assert.equal(both.length, 1);
});

test('text-size: 15px body at 390, one line at 13px and other widths stay silent', () => {
  assert.deepEqual(
    run('ui/text-size', [block({ lines: 3, style: { fontSize: 15, lineHeight: 22 } })]),
    [],
  );
  assert.deepEqual(
    run('ui/text-size', [block({ lines: 1, style: { fontSize: 13, lineHeight: 20 } })]),
    [],
  );
  assert.deepEqual(
    run('ui/text-size', [block({ lines: 3, style: { fontSize: 11, lineHeight: 16 } })], 1280),
    [],
  );
});

test('type-sizes: more than five sizes fires once for the page', () => {
  const nodes = [12, 13, 14, 15, 16, 17].map((size) => block({ style: { fontSize: size } }));
  const found = run('ui/type-sizes', nodes);
  assert.deepEqual(brief(found), [
    {
      rule: 'ui/type-sizes',
      severity: 'review',
      element: null,
      message: { key: 'checkRule.uiTypeSizes', params: {} },
      hint: { key: 'checkHint.uiTypeSizes', params: { count: 6, sizes: '12, 13, 14, 15, 16, 17' } },
      widths: [390],
    },
  ]);
});

test('type-sizes: five sizes, or a sixth under 2% of the text, stay silent', () => {
  const five = [12, 13, 14, 15, 16].map((size) => block({ style: { fontSize: size } }));
  assert.deepEqual(run('ui/type-sizes', five), []);
  const rare = block({ chars: 5, style: { fontSize: 17 } });
  const common = [12, 13, 14, 15, 16].map((size) =>
    block({ chars: 500, style: { fontSize: size } }),
  );
  assert.deepEqual(run('ui/type-sizes', [...common, rare]), []);
});

test('type-weights: four weights fires, with the count in the hint', () => {
  const nodes = [300, 400, 500, 700].map((weight) => block({ style: { fontWeight: weight } }));
  const found = run('ui/type-weights', nodes);
  assert.deepEqual(brief(found), [
    {
      rule: 'ui/type-weights',
      severity: 'review',
      element: null,
      message: { key: 'checkRule.uiTypeWeights', params: {} },
      hint: { key: 'checkHint.uiTypeWeights', params: { count: 4, weights: '300, 400, 500, 700' } },
      widths: [390],
    },
  ]);
});

test('type-weights: one weight over three text blocks fires', () => {
  const nodes = [block(), block(), block()];
  assert.equal(run('ui/type-weights', nodes).length, 1);
});

test('type-weights: one weight over two blocks, and two or three weights, stay silent', () => {
  assert.deepEqual(run('ui/type-weights', [block(), block()]), []);
  const two = [block(), block(), block({ style: { fontWeight: 700 } })];
  assert.deepEqual(run('ui/type-weights', two), []);
  const three = [400, 500, 700].map((weight) => block({ style: { fontWeight: weight } }));
  assert.deepEqual(run('ui/type-weights', three), []);
});

test('heading-scale: two headings too close in size fire at the smaller one', () => {
  const nodes = [
    block({ heading: 1, ks: 'a:h1/h1', style: { fontSize: 32 } }),
    block({ heading: 2, ks: 'a:h2/h2', style: { fontSize: 30 } }),
  ];
  const found = run('ui/heading-scale', nodes);
  assert.deepEqual(brief(found), [
    {
      rule: 'ui/heading-scale',
      severity: 'review',
      element: 'a:h2/h2',
      message: { key: 'checkRule.uiHeadingScale', params: {} },
      hint: { key: 'checkHint.uiHeadingScale', params: { size: 30, ratio: '1.07', body: 16 } },
      widths: [390],
    },
  ]);
});

test('heading-scale: the top heading under 1.5 times the body fires at that heading', () => {
  const nodes = [block({ heading: 1, ks: 'a:h1/h1', style: { fontSize: 20 } }), block()];
  const found = run('ui/heading-scale', nodes);
  assert.deepEqual(brief(found), [
    {
      rule: 'ui/heading-scale',
      severity: 'review',
      element: 'a:h1/h1',
      message: { key: 'checkRule.uiHeadingScale', params: {} },
      hint: { key: 'checkHint.uiHeadingScale', params: { size: 20, ratio: '1.25', body: 16 } },
      widths: [390],
    },
  ]);
});

test('heading-scale: the body size is the most common size among body text', () => {
  const nodes = [
    block({ heading: 1, style: { fontSize: 24 } }),
    block({ chars: 400, style: { fontSize: 18 } }),
    block({ chars: 50, style: { fontSize: 14 } }),
  ];
  const found = run('ui/heading-scale', nodes);
  assert.equal(found.length, 1);
  assert.deepEqual(found[0]?.hint.params, { size: 24, ratio: '1.33', body: 18 });
});

test('heading-scale: a clear scale, no headings, and equal sizes stay silent', () => {
  const scale = [
    block({ heading: 1, style: { fontSize: 40 } }),
    block({ heading: 2, style: { fontSize: 28 } }),
    block({ heading: 3, style: { fontSize: 20 } }),
    block(),
  ];
  assert.deepEqual(run('ui/heading-scale', scale), []);
  assert.deepEqual(run('ui/heading-scale', [block()]), []);
  const same = [
    block({ heading: 1, style: { fontSize: 32 } }),
    block({ heading: 2, style: { fontSize: 32 } }),
  ];
  assert.deepEqual(run('ui/heading-scale', same), []);
});

test('centered-text: a centred paragraph of 3 lines fires', () => {
  const found = run('ui/centered-text', [
    block({ ks: 'a:p/p', lines: 3, style: { textAlign: 'center' } }),
  ]);
  assert.deepEqual(brief(found), [
    {
      rule: 'ui/centered-text',
      severity: 'review',
      element: 'a:p/p',
      message: { key: 'checkRule.uiCenteredText', params: {} },
      hint: { key: 'checkHint.uiCenteredText', params: {} },
      widths: [390],
    },
  ]);
});

test('centered-text: short, start-aligned and heading text stay silent', () => {
  assert.deepEqual(
    run('ui/centered-text', [block({ lines: 2, style: { textAlign: 'center' } })]),
    [],
  );
  assert.deepEqual(run('ui/centered-text', [block({ lines: 4 })]), []);
  const heading = block({ heading: 1, lines: 3, style: { textAlign: 'center', fontSize: 40 } });
  assert.deepEqual(run('ui/centered-text', [heading]), []);
});

test('justified-text: justified text of 2 lines fires', () => {
  const found = run('ui/justified-text', [
    block({ ks: 'a:p/p', lines: 2, style: { textAlign: 'justify' } }),
  ]);
  assert.deepEqual(brief(found), [
    {
      rule: 'ui/justified-text',
      severity: 'review',
      element: 'a:p/p',
      message: { key: 'checkRule.uiJustifiedText', params: {} },
      hint: { key: 'checkHint.uiJustifiedText', params: {} },
      widths: [390],
    },
  ]);
});

test('justified-text: one line and other alignments stay silent', () => {
  assert.deepEqual(
    run('ui/justified-text', [block({ lines: 1, style: { textAlign: 'justify' } })]),
    [],
  );
  assert.deepEqual(
    run('ui/justified-text', [block({ lines: 3, style: { textAlign: 'start' } })]),
    [],
  );
});
