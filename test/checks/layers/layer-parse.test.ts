// The pure half of the layer walk: computed CSS values, as the page hands them over, read into the
// layer types of `src/checks/domain/page/layers.ts`.

import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  layerFacts,
  mergeRuns,
  type RawLayer,
  type RawLayers,
  readColour,
  readFlow,
  readPaints,
  readShadows,
} from '../../../src/checks/domain/page/layer-parse.ts';
import type { LayerPaint, LayerRun } from '../../../src/checks/domain/page/layers.ts';

const HERO = 'file:///C:/work/.kitvas/drafts/shop/v1/build/img/hero.png';
const WHITE = '#ffffffff';

const solid = (colour: string): LayerPaint => ({ kind: 'solid', colour });

const BACKGROUNDS: { name: string; input: [string, string, string]; paints: LayerPaint[] }[] = [
  { name: 'nothing painted', input: ['#00000000', 'none', 'auto'], paints: [] },
  { name: 'no colour at all', input: ['', '', ''], paints: [] },
  { name: 'a painted colour', input: [WHITE, 'none', 'auto'], paints: [solid(WHITE)] },
  {
    name: 'rgb as the browser computes it',
    input: ['rgb(37, 99, 235)', 'none', 'auto'],
    paints: [solid('#2563ebff')],
  },
  { name: 'rgba', input: ['rgba(0, 0, 0, 0.5)', 'none', 'auto'], paints: [solid('#00000080')] },
  {
    name: 'rgb with a slash and a percentage',
    input: ['rgb(255 0 0 / 25%)', 'none', 'auto'],
    paints: [solid('#ff000040')],
  },
  { name: 'a short hex with alpha', input: ['#0f08', 'none', ''], paints: [solid('#00ff0088')] },
  {
    name: 'an image that covers',
    input: ['#00000000', `url("${HERO}")`, 'cover'],
    paints: [{ kind: 'image', src: HERO, fit: 'cover' }],
  },
  {
    name: 'a colour under a contained image',
    input: ['#f5f5f5ff', `url("${HERO}")`, 'contain'],
    paints: [solid('#f5f5f5ff'), { kind: 'image', src: HERO, fit: 'contain' }],
  },
  {
    name: 'a linear gradient at an angle',
    input: ['#00000000', 'linear-gradient(90deg, #ff0000ff 0%, #0000ffff 100%)', 'auto'],
    paints: [
      {
        kind: 'linear',
        angle: 90,
        stops: [
          { at: 0, colour: '#ff0000ff' },
          { at: 1, colour: '#0000ffff' },
        ],
      },
    ],
  },
  {
    name: 'a linear gradient to a corner, over a colour, with stops placed as CSS places them',
    input: [
      WHITE,
      'linear-gradient(to bottom right, rgb(255, 255, 255), rgba(0, 0, 0, 0.25) 40%, #000000ff, #111111ff)',
      'auto',
    ],
    paints: [
      solid(WHITE),
      {
        kind: 'linear',
        angle: 135,
        stops: [
          { at: 0, colour: WHITE },
          { at: 0.4, colour: '#00000040' },
          { at: 0.7, colour: '#000000ff' },
          { at: 1, colour: '#111111ff' },
        ],
      },
    ],
  },
  {
    name: 'a radial gradient becomes its first colour',
    input: ['', 'radial-gradient(circle at 50% 50%, #ff0000ff, #0000ffff 80%)', 'auto'],
    paints: [solid('#ff0000ff')],
  },
  {
    name: 'two layers: CSS lists the top one first, the paints end with it',
    input: ['', `url("${HERO}"), linear-gradient(180deg, #000000ff, ${WHITE})`, 'cover, auto'],
    paints: [
      {
        kind: 'linear',
        angle: 180,
        stops: [
          { at: 0, colour: '#000000ff' },
          { at: 1, colour: WHITE },
        ],
      },
      { kind: 'image', src: HERO, fit: 'cover' },
    ],
  },
];

for (const { name, input, paints } of BACKGROUNDS) {
  test(`paints: ${name}`, () => {
    assert.deepEqual(readPaints(...input), paints);
  });
}

test('paints: how an image fits', () => {
  const fit = (value: string): string => {
    const [paint] = readPaints('', 'url("a.png")', value);
    return paint?.kind === 'image' ? paint.fit : 'no image';
  };
  assert.deepEqual(
    ['cover', 'contain', 'scale-down', 'fill', '100% 100%', 'auto', '40px 20px', ''].map(fit),
    ['cover', 'contain', 'contain', 'fill', 'fill', 'none', 'none', 'none'],
  );
  assert.deepEqual(readPaints('', "url('it\\'s.png')", 'cover'), [
    { kind: 'image', src: "it's.png", fit: 'cover' },
  ]);
});

test('paints: a gradient with no colour paints nothing, one colour paints it plainly', () => {
  assert.deepEqual(readPaints('', 'linear-gradient(90deg, oklch(0.7 0.1 200), 50%)', ''), []);
  assert.deepEqual(readPaints('', 'linear-gradient(in oklab, #123456ff 30%)', ''), [
    solid('#123456ff'),
  ]);
});

test('colours the readers take, and those they leave', () => {
  assert.equal(readColour('transparent'), '#00000000');
  assert.equal(readColour('#ABC'), '#aabbccff');
  assert.equal(readColour('rgba(255, 255, 255, 1)'), WHITE);
  assert.equal(readColour('oklch(0.7 0.1 200)'), null);
  assert.equal(readColour('#12345'), null);
  assert.equal(readColour('rgb(none 0 0)'), null);
});

test('shadows: none, one, two, an inset ring, the colour last, a transparent one', () => {
  assert.deepEqual(readShadows('none'), []);
  assert.deepEqual(readShadows('rgba(0, 0, 0, 0.1) 0px 1px 2px 0px'), [
    { x: 0, y: 1, blur: 2, spread: 0, colour: '#0000001a', inset: false },
  ]);
  assert.deepEqual(readShadows('#0000001a 0px 1px 3px 0px, rgba(0, 0, 0, 0.06) 0px 1px 2px -1px'), [
    { x: 0, y: 1, blur: 3, spread: 0, colour: '#0000001a', inset: false },
    { x: 0, y: 1, blur: 2, spread: -1, colour: '#0000000f', inset: false },
  ]);
  assert.deepEqual(readShadows('#2563ebff 0px 0px 0px 2px inset'), [
    { x: 0, y: 0, blur: 0, spread: 2, colour: '#2563ebff', inset: true },
  ]);
  assert.deepEqual(readShadows('inset 4px 8px 12.5px #00000033'), [
    { x: 4, y: 8, blur: 12.5, spread: 0, colour: '#00000033', inset: true },
  ]);
  assert.deepEqual(readShadows('rgba(0, 0, 0, 0) 0px 4px 8px 0px'), []);
});

const FLEX = {
  display: 'flex',
  'flex-direction': 'row',
  'flex-wrap': 'nowrap',
  'row-gap': '4px',
  'column-gap': '12px',
  'padding-top': '8px',
  'padding-right': '16px',
  'padding-bottom': '8px',
  'padding-left': '16px',
  'justify-content': 'space-between',
  'align-items': 'center',
};

test('flow: a flex row, its gaps along and across, its padding, justify and align', () => {
  assert.deepEqual(readFlow(FLEX), {
    direction: 'row',
    wrap: false,
    gap: 12,
    crossGap: 4,
    padding: [8, 16, 8, 16],
    justify: 'between',
    align: 'center',
  });
});

test('flow: a column takes the row gap along it', () => {
  const flow = readFlow({
    ...FLEX,
    display: 'inline-flex',
    'flex-direction': 'column',
    'justify-content': 'flex-end',
    'align-items': 'normal',
  });
  assert.deepEqual([flow.direction, flow.gap, flow.crossGap], ['column', 4, 12]);
  assert.deepEqual([flow.justify, flow.align], ['end', 'stretch']);
});

test('flow: a row that wraps', () => {
  const flow = readFlow({ ...FLEX, 'flex-wrap': 'wrap', 'justify-content': 'safe center' });
  assert.deepEqual([flow.direction, flow.wrap, flow.justify], ['row', true, 'center']);
});

test('flow: a grid, block flow and a reversed row are placed by their boxes', () => {
  for (const style of [
    { ...FLEX, display: 'grid' },
    { display: 'block', 'padding-top': '24px' },
    { ...FLEX, 'flex-direction': 'row-reverse' },
  ]) {
    const flow = readFlow(style);
    assert.deepEqual([flow.direction, flow.wrap, flow.gap, flow.crossGap], ['none', false, 0, 0]);
  }
  assert.deepEqual(readFlow({ display: 'block', 'padding-top': '24px' }).padding, [24, 0, 0, 0]);
});

const run = (start: number, end: number, look: Partial<LayerRun> = {}): LayerRun => ({
  start,
  end,
  weight: 700,
  italic: false,
  underline: false,
  colour: '#1a1a1aff',
  ...look,
});

test('runs that touch with the same look are merged; others stay apart', () => {
  const runs = [run(10, 14), run(0, 4), run(4, 8), run(8, 10, { underline: true }), run(20, 20)];
  const before = structuredClone(runs);
  assert.deepEqual(mergeRuns(runs), [run(0, 8), run(8, 10, { underline: true }), run(10, 14)]);
  assert.deepEqual(runs, before, 'the input is left as it was');
  assert.deepEqual(mergeRuns([run(0, 6), run(3, 9)]), [run(0, 9)]);
  assert.deepEqual(mergeRuns([run(0, 4), run(4, 8, { colour: '#2563ebff' })]).length, 2);
  assert.deepEqual(mergeRuns([]), []);
});

const raw = (node: Partial<RawLayer>): RawLayer => ({
  parent: -1,
  ks: 'sections/Hero:section',
  ownKs: true,
  tag: 'div',
  box: [0, 0, 100, 50],
  kind: 'frame',
  position: 'static',
  fill: [false, false],
  flow: { display: 'block' },
  background: '',
  image: 'none',
  fit: 'auto',
  border: null,
  radius: [0, 0, 0, 0],
  shadow: 'none',
  opacity: 1,
  clips: false,
  text: null,
  svg: null,
  ...node,
});

const page = (nodes: RawLayer[]): RawLayers => ({
  viewport: [390, 844],
  page: [390, 1200],
  background: WHITE,
  nodes,
  truncated: false,
});

test('facts: a frame whose only paint is an image and that holds nothing is an image', () => {
  const facts = layerFacts(
    page([
      raw({ image: `url("${HERO}")`, fit: 'cover', radius: [8, 8, 8, 8] }),
      raw({ image: `url("${HERO}")` }),
      raw({ parent: 1, tag: 'h1', background: WHITE }),
      raw({ image: `url("${HERO}")`, shadow: '#0000001a 0px 1px 2px 0px' }),
    ]),
  );
  assert.deepEqual(
    facts.nodes.map((node) => node.kind),
    ['image', 'frame', 'frame', 'frame'],
  );
  assert.equal(facts.nodes[0]?.flow, null, 'an image has no flow');
  assert.deepEqual(facts.nodes[1]?.flow?.direction, 'none');
  assert.deepEqual(facts.nodes[3]?.shadows.length, 1);
  assert.deepEqual(
    [facts.viewport, facts.page, facts.background, facts.truncated],
    [[390, 844], [390, 1200], WHITE, false],
  );
});

test('facts: absolute, fixed and sticky are placed apart; a text keeps its merged runs', () => {
  const text = {
    characters: 'Plans start at nine euros.',
    truncated: false,
    family: 'Inter',
    weight: 400,
    italic: false,
    size: 16,
    lineHeight: 24,
    letterSpacing: 0,
    align: 'left' as const,
    transform: 'none' as const,
    colour: '#1a1a1aff',
    runs: [run(15, 20), run(20, 25)],
  };
  const facts = layerFacts(
    page([
      raw({ position: 'absolute' }),
      raw({ position: 'fixed' }),
      raw({ position: 'sticky' }),
      raw({ position: 'relative', kind: 'text', flow: null, text }),
    ]),
  );
  assert.deepEqual(
    facts.nodes.map((node) => node.placed),
    ['absolute', 'absolute', 'absolute', 'flow'],
  );
  const read = facts.nodes[3];
  assert.equal(read?.flow, null);
  assert.deepEqual(read?.text?.runs, [run(15, 25)]);
  assert.equal(text.runs.length, 2, 'the raw text is left as it was');
});
