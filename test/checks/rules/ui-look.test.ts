import assert from 'node:assert/strict';
import { test } from 'node:test';
import type { FactNode, PageFacts, RawFinding } from '../../../src/checks/index.ts';
import { VISIT_RULES } from '../../../src/checks/index.ts';
import { node, page, STYLE, text, visit } from './facts.ts';

function run(
  id: string,
  nodes: FactNode[],
  part: Partial<PageFacts> = {},
  components: Map<string, string> = new Map(),
): RawFinding[] {
  const rule = VISIT_RULES.find((entry) => entry.id === id);
  assert.ok(rule, id);
  return rule.run(visit(page(nodes, part), { seen: { components } }));
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

const big = (ks: string, top: number, fontSize = 32): FactNode =>
  node({ ks, box: [20, top, 300, 40], text: text('Big words'), style: { fontSize } });

test('many-large fires at the third large text of a section in the first screen', () => {
  const nodes = [
    big('sections/Hero:h1/0', 100),
    big('sections/Hero:p/1', 200),
    big('sections/Hero:p/2', 300),
    big('sections/Hero:p/3', 400),
  ];
  assert.deepEqual(run('ui/many-large', nodes).map(brief), [
    {
      rule: 'ui/many-large',
      severity: 'review',
      element: 'sections/Hero:p/2',
      message: { key: 'checkRule.uiManyLarge', params: {} },
      hint: { key: 'checkHint.uiManyLarge', params: {} },
      states: ['filled'],
      widths: [390],
    },
  ]);
});

test('many-large is silent for 2, for text below the fold, for small text and across sections', () => {
  const two = [big('sections/Hero:h1/0', 100), big('sections/Hero:p/1', 200)];
  assert.deepEqual(run('ui/many-large', two), []);
  const below = [...two, big('sections/Hero:p/2', 900)];
  assert.deepEqual(run('ui/many-large', below), []);
  const small = [...two, big('sections/Hero:p/2', 300, 27)];
  assert.deepEqual(run('ui/many-large', small), []);
  const split = [...two, big('sections/Pricing:h2/0', 300)];
  assert.deepEqual(run('ui/many-large', split), []);
  assert.deepEqual(run('ui/many-large', []), []);
});

const para = (chars: number, fontSize = 16, fontWeight = 400): FactNode =>
  node({ text: text('x'.repeat(chars)), style: { fontSize, fontWeight } });

test('flat-hierarchy fires when one size and weight holds most of the text', () => {
  const found = run('ui/flat-hierarchy', [para(50), para(40), para(30)]);
  assert.deepEqual(found.map(brief), [
    {
      rule: 'ui/flat-hierarchy',
      severity: 'review',
      element: null,
      message: { key: 'checkRule.uiFlatHierarchy', params: {} },
      hint: { key: 'checkHint.uiFlatHierarchy', params: {} },
      states: ['filled'],
      widths: [390],
    },
  ]);
});

test('flat-hierarchy is silent with a varied page, with 2 blocks, and when empty', () => {
  assert.deepEqual(run('ui/flat-hierarchy', [para(50), para(30, 24, 700), para(20, 14)]), []);
  assert.deepEqual(run('ui/flat-hierarchy', [para(50), para(40)]), []);
  assert.deepEqual(run('ui/flat-hierarchy', []), []);
});

const HUES = ['#ff0000ff', '#ff8000ff', '#00ff00ff', '#0000ffff', '#ff00ffff'];
const inked = (colour: string, ks: string | null = null): FactNode =>
  node({ ks, text: text('Word'), style: { color: colour } });

test('hue-count fires on 5 hues across text and fills', () => {
  const nodes = [
    ...HUES.slice(0, 4).map((colour) => inked(colour)),
    node({ style: { background: HUES[4] ?? '', ground: HUES[4] ?? '' } }),
  ];
  assert.deepEqual(run('ui/hue-count', nodes).map(brief), [
    {
      rule: 'ui/hue-count',
      severity: 'review',
      element: null,
      message: { key: 'checkRule.uiHueCount', params: {} },
      hint: { key: 'checkHint.uiHueCount', params: { count: 5 } },
      states: ['filled'],
      widths: [390],
    },
  ]);
});

test('hue-count is silent for 4 hues, for neutrals, inside a kit component, and when empty', () => {
  const four = HUES.slice(0, 4).map((colour) => inked(colour));
  assert.deepEqual(run('ui/hue-count', four), []);
  const greys = [...four, inked('#808080ff'), inked('#1a1a1aff')];
  assert.deepEqual(run('ui/hue-count', greys), []);
  const inside = [...four, inked(HUES[4] ?? '', 'a:Badge/0')];
  assert.deepEqual(run('ui/hue-count', inside, {}, new Map([['a:Badge/0', 'Badge']])), []);
  assert.deepEqual(run('ui/hue-count', []), []);
});

const picture = (width: number, height: number, fit = 'fill'): FactNode =>
  node({
    tag: 'img',
    ks: 'a:img/0',
    box: [0, 0, width, height],
    image: { natural: [400, 300], sized: true, alt: 'Photo' },
    style: { objectFit: fit },
  });

test('image-distorted fires when the ratio is far off and object-fit is fill', () => {
  assert.deepEqual(run('ui/image-distorted', [picture(300, 300)]).map(brief), [
    {
      rule: 'ui/image-distorted',
      severity: 'review',
      element: 'a:img/0',
      message: { key: 'checkRule.uiImageDistorted', params: {} },
      hint: { key: 'checkHint.uiImageDistorted', params: { percent: 25 } },
      states: ['filled'],
      widths: [390],
    },
  ]);
});

test('image-distorted is silent for the natural ratio, a 4% drift, object-fit and no image', () => {
  assert.deepEqual(run('ui/image-distorted', [picture(400, 300)]), []);
  assert.deepEqual(run('ui/image-distorted', [picture(416, 300)]), []);
  assert.deepEqual(run('ui/image-distorted', [picture(300, 300, 'cover')]), []);
  assert.deepEqual(run('ui/image-distorted', [node({ box: [0, 0, 300, 300] })]), []);
  assert.deepEqual(run('ui/image-distorted', []), []);
});

const GREY = { background: '#e5e7ebff', ground: '#e5e7ebff' };
const slab = (ks: string | null = null, extra: Partial<FactNode> = {}): FactNode =>
  node({ ks, box: [10, 10, 150, 100], style: GREY, ...extra });

test('placeholder-media fires on each of 2 or more empty neutral boxes', () => {
  const nodes = [slab('a:div/0'), slab('a:div/1')];
  assert.deepEqual(run('ui/placeholder-media', nodes).map(brief), [
    {
      rule: 'ui/placeholder-media',
      severity: 'review',
      element: 'a:div/0',
      message: { key: 'checkRule.uiPlaceholderMedia', params: {} },
      hint: { key: 'checkHint.uiPlaceholderMedia', params: {} },
      states: ['filled'],
      widths: [390],
    },
    {
      rule: 'ui/placeholder-media',
      severity: 'review',
      element: 'a:div/1',
      message: { key: 'checkRule.uiPlaceholderMedia', params: {} },
      hint: { key: 'checkHint.uiPlaceholderMedia', params: {} },
      states: ['filled'],
      widths: [390],
    },
  ]);
});

test('placeholder-media is silent for one box, text, an image, a small box, a odd ratio or a colour', () => {
  assert.deepEqual(run('ui/placeholder-media', [slab()]), []);
  const withText = [slab(), node({ parent: 0, text: text('Caption') }), slab()];
  assert.deepEqual(run('ui/placeholder-media', withText), []);
  const withImage = [slab(), node({ parent: 0, tag: 'img', box: [10, 10, 50, 50] }), slab()];
  assert.deepEqual(run('ui/placeholder-media', withImage), []);
  const small = [slab(), slab(null, { box: [10, 10, 70, 50] })];
  assert.deepEqual(run('ui/placeholder-media', small), []);
  const wide = [slab(), slab(null, { box: [10, 10, 300, 100] })];
  assert.deepEqual(run('ui/placeholder-media', wide), []);
  const red = [
    slab(),
    slab(null, { style: { ...STYLE, background: '#ff0000ff', ground: '#ff0000ff' } }),
  ];
  assert.deepEqual(run('ui/placeholder-media', red), []);
  assert.deepEqual(run('ui/placeholder-media', [slab(), node({ box: [10, 10, 150, 100] })]), []);
  assert.deepEqual(run('ui/placeholder-media', []), []);
});

const copy = (sample: string, fontSize: number): FactNode =>
  node({ text: text(sample), style: { fontSize, fontWeight: 400 } });

test('wireframe lists the signals when 3 or more fire', () => {
  const nodes = [
    slab(),
    slab(),
    copy('Lorem ipsum dolor sit amet', 16),
    copy('A longer line of real words about the product', 24),
    copy('Another line, a little shorter', 14),
  ];
  assert.deepEqual(run('ui/wireframe', nodes).map(brief), [
    {
      rule: 'ui/wireframe',
      severity: 'review',
      element: null,
      message: {
        key: 'checkRule.uiWireframe',
        params: { signals: 'media,copy,weight' },
      },
      hint: { key: 'checkHint.uiWireframe', params: {} },
      states: ['filled'],
      widths: [390],
    },
  ]);
});

test('wireframe counts a whole-text placeholder word and a flat page as signals', () => {
  const nodes = [
    copy('Title', 16),
    copy('Description', 16),
    copy('Some words here', 16),
    slab(),
    slab(),
  ];
  const found = run('ui/wireframe', nodes);
  assert.equal(found[0]?.message.params.signals, 'media,copy,hierarchy,weight');
});

test('wireframe is silent with 2 signals, on a neutral page, and when empty', () => {
  const two = [
    slab(),
    slab(),
    copy('A real sentence about orders', 24),
    copy('Another real one', 14),
  ];
  assert.deepEqual(run('ui/wireframe', two), []);
  const neutral = [copy('Heading text', 32), copy('Body text of the page', 16)];
  assert.deepEqual(run('ui/wireframe', neutral), []);
  assert.deepEqual(run('ui/wireframe', []), []);
});
