import assert from 'node:assert/strict';
import { test } from 'node:test';
import type { LayerFacts, LayerNode, LayerText } from '../../../src/checks/index.ts';
import { shapeTree } from '../../../src/handoff/domain/figma/shape.ts';
import { tokenUses } from '../../../src/handoff/domain/figma/token-uses.ts';
import type { FlatToken } from '../../../src/kit/index.ts';
import type { IdsFile } from '../../../src/render/index.ts';

function node(over: Partial<LayerNode> = {}): LayerNode {
  return {
    parent: -1,
    ks: null,
    ownKs: false,
    tag: 'div',
    box: [0, 0, 100, 50],
    kind: 'frame',
    placed: 'flow',
    fill: [false, false],
    flow: null,
    paints: [],
    border: null,
    radius: [0, 0, 0, 0],
    shadows: [],
    opacity: 1,
    clips: false,
    text: null,
    svg: null,
    ...over,
  };
}

function text(characters: string, over: Partial<LayerText> = {}): LayerText {
  return {
    characters,
    truncated: false,
    family: 'Inter',
    weight: 400,
    italic: false,
    size: 16,
    lineHeight: 24,
    letterSpacing: 0,
    align: 'left',
    transform: 'none',
    colour: '#000000ff',
    runs: [],
    ...over,
  };
}

const facts = (nodes: LayerNode[]): LayerFacts => ({
  viewport: [1280, 900],
  page: [1280, 1600],
  background: '#ffffffff',
  nodes,
  truncated: false,
});

const entry = (file: string, tag: string) => ({ file, line: 1, column: 1, tag });
const hero = 'src/tsx/sections/Hero.tsx';
const pricing = 'src/tsx/sections/Pricing.tsx';
const ids: IdsFile = {
  schemaVersion: 1,
  ids: {
    'index:div': entry('src/tsx/index.tsx', 'div'),
    'sections/Hero:section': entry(hero, 'section'),
    'sections/Hero:section/Button': entry(hero, 'Button'),
    'sections/Pricing:section': entry(pricing, 'section'),
    'sections/Pricing:section/Card': entry(pricing, 'Card'),
  },
};

const ink: FlatToken = {
  path: ['color', 'ink'],
  type: 'color',
  value: { colorSpace: 'srgb', components: [0, 0, 0] },
};
const uses = tokenUses('.a { color: var(--kit-color-ink) }');

const NODES: LayerNode[] = [
  // 0: the page's own wrapper, from index.tsx
  node({
    ks: 'index:div',
    ownKs: true,
    box: [0, 0, 1280, 1600],
    paints: [{ kind: 'solid', colour: '#ffffffff' }],
  }),
  // 1 to 4: the hero, a heading, a Button and what the Button draws inside itself
  node({
    parent: 0,
    ks: 'sections/Hero:section',
    ownKs: true,
    tag: 'section',
    box: [0, 0, 1280, 600],
  }),
  node({
    parent: 1,
    ks: 'sections/Hero:section',
    tag: 'h1',
    kind: 'text',
    box: [40, 40, 600, 60],
    text: text('Ship the screen you drew', {
      weight: 700,
      runs: [
        { start: 0, end: 4, weight: 600, italic: true, underline: false, colour: '#000000ff' },
      ],
    }),
  }),
  node({
    parent: 1,
    ks: 'sections/Hero:section/Button',
    ownKs: true,
    tag: 'button',
    box: [40, 120, 160, 48],
  }),
  node({
    parent: 3,
    ks: 'sections/Hero:section/Button',
    tag: 'span',
    kind: 'text',
    box: [60, 130, 80, 24],
    text: text('Buy now'),
  }),
  // 5 to 6, 8: the pricing section, a Card and a picture whose address is a path
  node({
    parent: 0,
    ks: 'sections/Pricing:section',
    ownKs: true,
    tag: 'section',
    box: [0, 600, 1280, 800],
  }),
  node({
    parent: 5,
    ks: 'sections/Pricing:section/Card',
    ownKs: true,
    tag: 'div',
    box: [40, 640, 400, 300],
  }),
  // 7: outside every section
  node({ parent: 0, tag: 'footer', box: [0, 1500, 1280, 100] }),
  node({
    parent: 5,
    ks: 'sections/Pricing:section',
    tag: 'img',
    kind: 'image',
    box: [500, 640, 300, 200],
    paints: [{ kind: 'image', src: 'file:///C:/Users/me/proj/src/img/hero.png', fit: 'cover' }],
  }),
];

function shape(
  frames: { width: number; facts: LayerFacts }[] = [{ width: 1280, facts: facts(NODES) }],
) {
  return shapeTree({
    slug: 'pricing',
    version: 2,
    kit: 'base',
    state: 'default',
    sendId: 'abc123',
    frames,
    ids,
    sections: ['hero', 'pricing', 'empty'],
    tokens: [ink],
    uses,
    assetOf: (src) => (src.endsWith('hero.png') ? 'a1.png' : null),
  });
}

test('layers go to the section of their nearest element id, the rest to page, which comes first', () => {
  const [frame] = shape().frames;
  assert.equal(frame?.width, 1280);
  assert.equal(frame?.height, 1600);
  assert.equal(frame?.background, '#ffffffff');
  assert.deepEqual(
    frame?.sections.map((section) => [section.id, section.layers.length]),
    [
      ['page', 2],
      ['hero', 4],
      ['pricing', 3],
    ],
  );
});

test('a layer outside every section sits in page, under the page wrapper', () => {
  const page = shape().frames[0]?.sections[0];
  assert.deepEqual(
    page?.layers.map((layer) => [layer.name, layer.parent]),
    [
      ['div', -1],
      ['footer', 0],
    ],
  );
});

test('a layer whose parent is in another section is a child of the section frame', () => {
  const heroSection = shape().frames[0]?.sections[1];
  assert.deepEqual(
    heroSection?.layers.map((layer) => layer.parent),
    [-1, 0, 0, 2],
  );
});

test('a component root is named and marked; what it draws inside itself is not', () => {
  const layers = shape().frames[0]?.sections[1]?.layers ?? [];
  assert.deepEqual(
    layers.map((layer) => [layer.name, layer.component]),
    [
      ['section', null],
      ['Ship the screen you drew', null],
      ['Button', 'Button'],
      ['Buy now', null],
    ],
  );
  assert.equal(shape().frames[0]?.sections[2]?.layers[1]?.component, 'Card');
});

test('a section frame holds its layers in page coordinates and its box is their union', () => {
  const [page, heroSection, pricingSection] = shape().frames[0]?.sections ?? [];
  assert.deepEqual(page?.box, [0, 0, 1280, 1600]);
  assert.deepEqual(heroSection?.box, [0, 0, 1280, 600]);
  assert.deepEqual(pricingSection?.box, [0, 600, 1280, 800]);
  assert.deepEqual(heroSection?.layers[2]?.node.box, [40, 120, 160, 48]);
});

test('a layout section with no layer has no frame', () => {
  const found = shape().frames[0]?.sections.map((section) => section.id);
  assert.equal(found?.includes('empty'), false);
});

test('an element id the ids file does not know is placed by the file its prefix names', () => {
  const tree = shape([
    {
      width: 390,
      facts: facts([
        node({ ks: 'sections/Hero:section/p', tag: 'p' }),
        node({ ks: 'sections/Other:section', tag: 'p' }),
      ]),
    },
  ]);
  assert.deepEqual(
    tree.frames[0]?.sections.map((section) => [section.id, section.layers.length]),
    [
      ['page', 1],
      ['hero', 1],
    ],
  );
});

test('an image layer gets its asset file, and the address it asked for does not leave', () => {
  const picture = shape().frames[0]?.sections[2]?.layers[2];
  assert.equal(picture?.asset, 'a1.png');
  assert.deepEqual(picture?.node.paints, [{ kind: 'image', src: 'a1.png', fit: 'cover' }]);
  const none = shapeTree({
    slug: 's',
    version: 1,
    kit: 'base',
    state: 'default',
    sendId: 'x',
    frames: [
      {
        width: 1280,
        facts: facts([
          node({
            kind: 'image',
            paints: [{ kind: 'image', src: 'https://a.test/x.png', fit: 'fill' }],
          }),
        ]),
      },
    ],
    ids,
    sections: [],
    tokens: [],
    uses,
    assetOf: () => null,
  });
  const layer = none.frames[0]?.sections[0]?.layers[0];
  assert.equal(layer?.asset, null);
  assert.deepEqual(layer?.node.paints, [{ kind: 'image', src: '', fit: 'fill' }]);
});

test('nothing in the tree is a path, an element id or a source file', () => {
  const json = JSON.stringify(shape());
  assert.doesNotMatch(json, /sections\/|\.tsx|file:|C:[\\/]|Hero:|index:|"ks"|"ownKs"|"tag"/);
});

test('the layer keeps no id, no tag and no parent of the walk', () => {
  const layer = shape().frames[0]?.sections[1]?.layers[1];
  assert.deepEqual(Object.keys(layer?.node ?? {}).sort(), [
    'border',
    'box',
    'clips',
    'fill',
    'flow',
    'kind',
    'opacity',
    'paints',
    'placed',
    'radius',
    'shadows',
    'svg',
    'text',
  ]);
});

test('counts, fonts and the values left raw', () => {
  const tree = shape([
    { width: 1280, facts: facts(NODES) },
    { width: 390, facts: facts(NODES) },
  ]);
  assert.deepEqual(tree.counts, { layers: 18, texts: 4, images: 2, icons: 0 });
  assert.deepEqual(tree.fonts, [
    { family: 'Inter', weight: 400, italic: false },
    { family: 'Inter', weight: 600, italic: true },
    { family: 'Inter', weight: 700, italic: false },
  ]);
  // Per width: the wrapper's fill and, per text, its size, weight and family. The ink colour binds.
  assert.equal(tree.unbound, 2 * (1 + 2 * 3));
  assert.equal(tree.frames[0]?.sections[1]?.layers[1]?.bound.text, 'color/ink');
  assert.deepEqual(
    tree.frames.map((frame) => frame.width),
    [1280, 390],
  );
});

test('the header of the tree', () => {
  const tree = shape();
  assert.equal(tree.schemaVersion, 1);
  assert.deepEqual(
    [tree.slug, tree.version, tree.kit, tree.state, tree.sendId],
    ['pricing', 2, 'base', 'default', 'abc123'],
  );
});

test('1,500 layers in a kit of 600 tokens shape at once', () => {
  const tokens = Array.from(
    { length: 600 },
    (_, at): FlatToken => ({
      path: ['space', `t${at}`],
      type: 'dimension',
      value: { value: at + 1, unit: 'px' },
    }),
  );
  const css = tokens.map((token) => `.a { gap: var(--kit-space-${token.path[1]}) }`).join('\n');
  const nodes = Array.from({ length: 1500 }, (_, at) =>
    node({
      parent: at === 0 ? -1 : 0,
      flow: {
        direction: 'row',
        wrap: false,
        gap: (at % 600) + 1,
        crossGap: 0,
        padding: [0, 0, 0, 0],
        justify: 'start',
        align: 'start',
      },
    }),
  );
  const tree = shapeTree({
    slug: 's',
    version: 1,
    kit: 'base',
    state: 'default',
    sendId: 'x',
    frames: [{ width: 1280, facts: facts(nodes) }],
    ids,
    sections: [],
    tokens,
    uses: tokenUses(css),
    assetOf: () => null,
  });
  assert.equal(tree.counts.layers, 1500);
  assert.equal(tree.unbound, 0);
  assert.equal(tree.frames[0]?.sections[0]?.layers[599]?.bound.gap, 'space/t599');
});
