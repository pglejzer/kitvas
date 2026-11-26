import assert from 'node:assert/strict';
import { test } from 'node:test';
import type { FigmaApi, FrameNode, Variable, VariableValue } from '../../../client/figma/api.ts';
import {
  buildLayer,
  gradientTransform,
  type PackedLayer,
} from '../../../client/figma/build-layer.ts';
import type { Scope } from '../../../client/figma/build-text.ts';
import { loadFonts, type WantedFont } from '../../../client/figma/fonts.ts';
import {
  createFigmaFake,
  type FakeNodeData,
  type FigmaFake,
} from '../../helpers/handoff/figma-fake.ts';

/** The kit's variables as `10-variables.js` makes them; a layer binds them by index. */
const VARIABLES: [string, 'COLOR' | 'FLOAT' | 'STRING', VariableValue][] = [
  ['color/surface', 'COLOR', { r: 1, g: 1, b: 1, a: 1 }],
  ['space/md', 'FLOAT', 12],
  ['radius/md', 'FLOAT', 8],
  ['color/ink', 'COLOR', { r: 0.1, g: 0.1, b: 0.1, a: 1 }],
  ['font/size/lg', 'FLOAT', 20],
  ['font/family/sans', 'STRING', 'Inter'],
  ['font/weight/bold', 'FLOAT', 700],
  ['color/line', 'COLOR', { r: 0.88, g: 0.88, b: 0.88, a: 1 }],
];

function kitVariables(figma: FigmaApi): { vars: Variable[]; mode: string } {
  const collection = figma.variables.createVariableCollection('kitvas · base');
  const mode = collection.defaultModeId;
  const vars = VARIABLES.map(([name, type, value]) => {
    const variable = figma.variables.createVariable(name, collection, type);
    variable.setValueForMode(mode, value);
    return variable;
  });
  return { vars, mode };
}

type Bench = {
  fake: FigmaFake;
  scope: Scope;
  section: FrameNode;
  node(name: string): FakeNodeData;
};

/** A fake with the kit's variables, the fonts loaded, and a plain frame standing for a section. */
async function bench(wanted: WantedFont[] = []): Promise<Bench> {
  const fake = createFigmaFake();
  const fonts = await loadFonts(fake.figma, wanted);
  const { vars, mode } = kitVariables(fake.figma);
  const section = fake.figma.createFrame();
  section.name = 'hero';
  const scope: Scope = { figma: fake.figma, fonts, vars, mode, refused: 0 };
  const node = (name: string): FakeNodeData => {
    const found = fake.snapshot().nodes[name]?.at(-1);
    assert.ok(found, `no node named ${name}`);
    return found;
  };
  return { fake, scope, section, node };
}

const close = (actual: readonly number[], expected: readonly number[]): void => {
  assert.equal(actual.length, expected.length);
  actual.forEach((value, at) => {
    assert.ok(Math.abs(value - (expected[at] ?? 0)) < 1e-9, `${at}`);
  });
};

test('a row frame takes its flow, paints, border, radius, shadows and bound values', async () => {
  const { scope, section, node } = await bench();
  const card: PackedLayer = {
    p: -1,
    n: 'Card',
    b: [10, 20, 300, 120],
    l: ['H', 1, 12, 6, 12, 16, 12, 16, 'MIN', 'CENTER'],
    f: ['#ffffff'],
    s: [1, 2, 1, 2, '#e0e0e0'],
    r: [8, 8, 8, 8],
    e: [
      [0, 2, 8, 0, '#00000040', 0],
      [0, 1, 2, 1, '#0000001a', 1],
    ],
    o: 0.9,
    c: 1,
    x: { f: 0, s: 7, g: 1, pt: 1, pb: 1, r: 2 },
  };
  const built = buildLayer(scope, card, section, 'Card');
  assert.equal(built.holder, built.node);
  const data = node('Card');
  assert.equal(data.frame?.layoutMode, 'HORIZONTAL');
  assert.equal(data.frame?.layoutWrap, 'WRAP');
  assert.equal(data.frame?.itemSpacing, 12);
  assert.equal(data.frame?.counterAxisSpacing, 6);
  assert.deepEqual(data.frame?.padding, [12, 16, 12, 16]);
  assert.equal(data.frame?.primaryAxisAlignItems, 'MIN');
  assert.equal(data.frame?.counterAxisAlignItems, 'CENTER');
  // Placed in a plain frame: at its box, at a fixed size.
  assert.deepEqual(data.box, [10, 20, 300, 120]);
  assert.deepEqual(data.sizing, ['FIXED', 'FIXED']);
  assert.deepEqual(data.frame?.strokeWeights, [1, 2, 1, 2]);
  assert.equal(data.frame?.strokeAlign, 'INSIDE');
  assert.deepEqual(data.frame?.radii, [8, 8, 8, 8]);
  assert.deepEqual(
    data.frame?.effects.map((effect) => [effect.type, effect.radius, effect.spread]),
    [
      ['DROP_SHADOW', 8, 0],
      ['INNER_SHADOW', 2, 1],
    ],
  );
  assert.ok(Math.abs((data.frame?.effects[0]?.color.a ?? 0) - 64 / 255) < 1e-3);
  assert.equal(data.opacity, 0.9);
  assert.equal(data.frame?.clipsContent, true);
  assert.deepEqual(data.bound, {
    'fills.0': 'color/surface',
    'strokes.0': 'color/line',
    itemSpacing: 'space/md',
    paddingTop: 'space/md',
    paddingBottom: 'space/md',
    topLeftRadius: 'radius/md',
    topRightRadius: 'radius/md',
    bottomRightRadius: 'radius/md',
    bottomLeftRadius: 'radius/md',
  });
  assert.equal(scope.refused, 0);
});

test('a child fills its auto-layout parent after appendChild; an absolute one keeps its box', async () => {
  const { scope, section, node } = await bench();
  const row = buildLayer(
    scope,
    { p: -1, n: 'row', b: [0, 0, 400, 50], l: ['H', 0, 8, 0, 0, 0, 0, 0, 'MIN', 'MIN'] },
    section,
    'row',
  );
  buildLayer(scope, { p: 0, n: 'grow', b: [0, 0, 200, 50], g: [1, 1] }, row.holder, 'grow');
  buildLayer(scope, { p: 0, n: 'badge', b: [380, -6, 20, 20], a: 1 }, row.holder, 'badge');
  const column = buildLayer(
    scope,
    { p: -1, n: 'column', b: [0, 60, 400, 300], l: ['V', 0, 0, 0, 0, 0, 0, 0, 'MIN', 'MIN'] },
    section,
    'column',
  );
  buildLayer(scope, { p: 0, n: 'tall', b: [0, 0, 400, 90], g: [1, 0] }, column.holder, 'tall');
  buildLayer(scope, { p: -1, n: 'loose', b: [5, 6, 7, 8] }, section, 'loose');

  assert.deepEqual(node('grow').sizing, ['FILL', 'FILL']);
  assert.equal(node('grow').positioning, 'AUTO');
  assert.equal(node('badge').positioning, 'ABSOLUTE');
  assert.deepEqual(node('badge').box, [380, -6, 20, 20]);
  assert.deepEqual(node('tall').sizing, ['FIXED', 'FILL']);
  assert.deepEqual(node('row').children, [node('grow').id, node('badge').id]);
  // A plain frame starts white in Figma: a layer that paints nothing gets no fill.
  assert.deepEqual(node('loose').fills, []);
  assert.deepEqual(node('loose').box, [5, 6, 7, 8]);
  // A box of zero is still a valid size.
  buildLayer(scope, { p: -1, n: 'flat', b: [0, 0, 0, 0] }, section, 'flat');
  assert.deepEqual(node('flat').box.slice(2), [0.01, 0.01]);
});

test('a CSS angle becomes the gradient transform, and the stops keep their alpha', async () => {
  close(gradientTransform(90).flat(), [1, 0, 0, 0, 1, 0]);
  close(gradientTransform(180).flat(), [0, 1, 0, -1, 0, 1]);
  close(gradientTransform(0).flat(), [0, -1, 1, 1, 0, 0]);
  const { scope, section, node } = await bench();
  const glow: PackedLayer = {
    p: -1,
    n: 'glow',
    b: [0, 0, 100, 100],
    f: ['#ff000080', [90, [0, '#000000'], [1, '#ffffff00']]],
  };
  buildLayer(scope, glow, section, 'glow');
  const [base, gradient] = node('glow').fills;
  assert.deepEqual(base, { type: 'SOLID', color: { r: 1, g: 0, b: 0 }, opacity: 0.502 });
  assert.equal(gradient?.type, 'GRADIENT_LINEAR');
  if (gradient?.type !== 'GRADIENT_LINEAR') return;
  assert.deepEqual(gradient.gradientStops, [
    { position: 0, color: { r: 0, g: 0, b: 0, a: 1 } },
    { position: 1, color: { r: 1, g: 1, b: 1, a: 0 } },
  ]);
});

test('a text with a background is a frame holding the text, which hugs on one line', async () => {
  const { scope, section, node } = await bench([{ family: 'Inter', weight: 600, italic: false }]);
  const button: PackedLayer = {
    p: -1,
    n: 'Button',
    k: 't',
    b: [0, 0, 120, 40],
    l: ['H', 0, 0, 0, 10, 16, 10, 16, 'CENTER', 'CENTER'],
    f: ['#1a1a1a'],
    r: [6, 6, 6, 6],
    t: { c: 'Buy now', f: 'Inter', w: 600, z: 20, h: 20, o: '#ffffff', a: 'CENTER' },
    x: { z: 4 },
  };
  const built = buildLayer(scope, button, section, 'Button');
  const frame = node('Button');
  const text = node('Buy now');
  assert.equal(frame.type, 'FRAME');
  assert.equal(frame.frame?.layoutMode, 'HORIZONTAL');
  assert.equal(frame.frame?.primaryAxisAlignItems, 'CENTER');
  assert.deepEqual(frame.frame?.padding, [10, 16, 10, 16]);
  assert.deepEqual(frame.children, [text.id]);
  assert.deepEqual(built.ids, [frame.id, text.id]);
  assert.equal(text.text?.characters, 'Buy now');
  assert.deepEqual(text.text?.fontName, { family: 'Inter', style: 'Semi Bold' });
  assert.equal(text.text?.fontSize, 20);
  assert.equal(text.text?.align, 'CENTER');
  assert.equal(text.text?.autoResize, 'WIDTH_AND_HEIGHT');
  assert.deepEqual(text.fills, [{ type: 'SOLID', color: { r: 1, g: 1, b: 1 } }]);
  assert.deepEqual(text.bound, { fontSize: 'font/size/lg' });
  assert.equal(scope.refused, 0);
});

test('a longer text wraps at its width, with its runs, case, spacing and bound colour', async () => {
  const { scope, section, node } = await bench([
    { family: 'Inter', weight: 400, italic: false },
    { family: 'Inter', weight: 700, italic: false },
    { family: 'Inter', weight: 400, italic: true },
  ]);
  const column = buildLayer(
    scope,
    { p: -1, n: 'column', b: [0, 0, 300, 200], l: ['V', 0, 0, 0, 0, 0, 0, 0, 'MIN', 'MIN'] },
    section,
    'column',
  );
  const characters = 'Plans for teams of every size, billed yearly.';
  const paragraph: PackedLayer = {
    p: 0,
    n: 'Plans for teams of every size,',
    k: 't',
    b: [0, 0, 280, 72],
    g: [0, 1],
    t: {
      c: characters,
      f: 'Inter',
      w: 400,
      z: 16,
      h: 24,
      s: 0.5,
      o: '#1a1a1a',
      x: 'UPPER',
      r: [
        [0, 5, 700, 0, 0, '#1a1a1a'],
        [10, 15, 400, 1, 1, '#0055ff'],
        [40, 99, 700, 0, 0, '#1a1a1a'],
      ],
      m: 1,
    },
    x: { t: 3 },
  };
  const built = buildLayer(scope, paragraph, column.holder, paragraph.n);
  assert.equal(built.holder, column.holder);
  const text = node(paragraph.n);
  assert.equal(text.text?.characters, characters);
  assert.equal(text.text?.autoResize, 'HEIGHT');
  assert.equal(text.box[2], 280);
  assert.equal(text.sizing[0], 'FILL');
  assert.equal(text.text?.textCase, 'UPPER');
  assert.deepEqual(text.text?.lineHeight, { unit: 'PIXELS', value: 24 });
  assert.deepEqual(text.text?.letterSpacing, { unit: 'PIXELS', value: 0.5 });
  assert.deepEqual(text.bound, { 'fills.0': 'color/ink' });
  // A run past the end of the text is left out.
  assert.deepEqual(text.text?.ranges, [
    { start: 0, end: 5, fontName: { family: 'Inter', style: 'Bold' } },
    { start: 10, end: 15, fontName: { family: 'Inter', style: 'Italic' } },
    { start: 10, end: 15, fills: [{ type: 'SOLID', color: { r: 0, g: 0.3333, b: 1 } }] },
    { start: 10, end: 15, decoration: 'UNDERLINE' },
  ]);
});

test('the family and the weight are bound only when Figma sets the text in that very font', async () => {
  const { scope, section, node } = await bench([
    { family: 'Inter', weight: 700, italic: false },
    { family: 'Brand Sans', weight: 700, italic: false },
  ]);
  const text = (n: string, family: string): PackedLayer => ({
    p: -1,
    n,
    k: 't',
    b: [0, 0, 80, 24],
    t: { c: n, f: family, w: 700, z: 20, o: '#1a1a1a' },
    x: { y: 5, w: 6 },
  });
  buildLayer(scope, text('Total', 'Inter'), section, 'Total');
  assert.deepEqual(node('Total').bound, {
    fontFamily: 'font/family/sans',
    fontWeight: 'font/weight/bold',
  });
  assert.equal(scope.refused, 0);
  // Set in Inter for want of Brand Sans: neither is bound, and both are counted.
  buildLayer(scope, text('Due', 'Brand Sans'), section, 'Due');
  assert.deepEqual(node('Due').text?.fontName, { family: 'Inter', style: 'Bold' });
  assert.deepEqual(node('Due').bound, {});
  assert.equal(scope.refused, 2);
});

test('an SVG becomes vectors at its box; markup Figma cannot read becomes an empty frame', async () => {
  const { scope, section, node } = await bench();
  const svg = '<svg width="16" height="16" viewBox="0 0 16 16"><path d="M0 0h16v16H0z"/></svg>';
  buildLayer(
    scope,
    { p: -1, n: 'Icon', k: 's', b: [4, 4, 24, 24], v: svg, o: 0.5 },
    section,
    'Icon',
  );
  assert.equal(node('Icon').frame?.svg, svg);
  assert.deepEqual(node('Icon').box, [4, 4, 24, 24]);
  assert.equal(node('Icon').opacity, 0.5);
  buildLayer(
    scope,
    { p: -1, n: 'broken', k: 's', b: [0, 0, 24, 24], v: '<div/>' },
    section,
    'broken',
  );
  assert.equal(node('broken').frame?.svg, null);
  assert.deepEqual(node('broken').fills, []);
  assert.equal(scope.refused, 1);
});

test('the fake refuses what the builder must not do: WRAP down a column, text set before its font', async () => {
  const { figma } = createFigmaFake();
  const column = figma.createAutoLayout('VERTICAL');
  assert.throws(() => {
    column.layoutWrap = 'WRAP';
  }, /WRAP can only be set on a horizontal auto-layout frame/);
  const text = figma.createText();
  assert.throws(() => {
    text.textAutoResize = 'HEIGHT';
  }, /unloaded font "Inter Regular"/);
  assert.throws(() => {
    text.textAlignHorizontal = 'CENTER';
  }, /unloaded font/);
  // A resize after FILL makes the side FIXED again, so FILL comes after the resize.
  const row = figma.createAutoLayout('HORIZONTAL');
  const cell = figma.createFrame();
  row.appendChild(cell);
  cell.layoutSizingHorizontal = 'FILL';
  cell.resize(10, 10);
  assert.equal(cell.layoutSizingHorizontal, 'FIXED');
});

test('a binding to a variable the file lacks is counted, and the value stays as it is', async () => {
  const { scope, section, node } = await bench();
  const lost: PackedLayer = {
    p: -1,
    n: 'lost',
    b: [0, 0, 10, 10],
    l: ['V', 0, 4, 0, 0, 0, 0, 0, 'MIN', 'MIN'],
    f: ['#336699'],
    x: { f: 40, g: 41 },
  };
  buildLayer(scope, lost, section, 'lost');
  assert.equal(node('lost').frame?.itemSpacing, 4);
  assert.deepEqual(node('lost').bound, {});
  assert.equal(scope.refused, 2);
});
