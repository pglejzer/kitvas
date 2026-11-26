import assert from 'node:assert/strict';
import { test } from 'node:test';
import { runInNewContext } from 'node:vm';
import type { LayerFlow, LayerText } from '../../../../src/checks/index.ts';
import {
  figmaVariableName,
  hex,
  literal,
  normalizeSection,
  packedSection,
  packVariable,
} from '../../../../src/handoff/domain/figma/scripts/pack.ts';
import {
  continuedIn,
  ownLayers,
  splitSection,
} from '../../../../src/handoff/domain/figma/scripts/split.ts';
import type { TreeLayer, TreeSection } from '../../../../src/handoff/domain/figma/tree.ts';

type Node = TreeLayer['node'];

const node = (box: Node['box'], extra: Partial<Node> = {}): Node => ({
  box,
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
  ...extra,
});
const layer = (
  parent: number,
  name: string,
  data: Node,
  extra: Partial<TreeLayer> = {},
): TreeLayer => ({
  parent,
  name,
  component: null,
  node: data,
  bound: {},
  asset: null,
  ...extra,
});
const flow = (direction: LayerFlow['direction'], extra: Partial<LayerFlow> = {}): LayerFlow => ({
  direction,
  wrap: false,
  gap: 0,
  crossGap: 0,
  padding: [0, 0, 0, 0],
  justify: 'start',
  align: 'start',
  ...extra,
});
const text = (characters: string, extra: Partial<LayerText> = {}): LayerText => ({
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
  colour: '#1a1a1aff',
  runs: [],
  ...extra,
});
const section = (layers: TreeLayer[], box: Node['box'] = [0, 0, 1280, 400]): TreeSection => ({
  id: 'hero',
  box,
  layers,
});

test('a section packs short: boxes from the parent, colours as hex, defaults left out', () => {
  const column = flow('column', { gap: 24, padding: [48, 32, 48, 32], align: 'center' });
  const white = { kind: 'solid', colour: '#FFFFFFFF' } as const;
  const hero = section(
    [
      layer(-1, 'section', node([0, 100, 1280, 400], { flow: column, paints: [white] }), {
        bound: { fill: 'color/surface', gap: 'space.lg' },
      }),
      layer(0, 'Plain', node([32, 148, 200, 40])),
      layer(
        0,
        'Pricing for teams',
        node([32, 200, 600, 48], {
          kind: 'text',
          text: text('Pricing for teams', { weight: 700, size: 40, lineHeight: 48 }),
        }),
        { bound: { text: 'color/ink' } },
      ),
    ],
    [0, 100, 1280, 400],
  );
  const packed = packedSection(hero);
  assert.deepEqual(packed.vars, ['color/surface', 'space_lg', 'color/ink']);
  assert.deepEqual(packed.continues, []);
  assert.deepEqual(packed.layers, [
    {
      p: -1,
      n: 'section',
      b: [0, 0, 1280, 400],
      l: ['V', 0, 24, 0, 48, 32, 48, 32, 'MIN', 'CENTER'],
      f: ['#ffffff'],
      x: { f: 0, g: 1 },
    },
    { p: 0, n: 'Plain', b: [32, 48, 200, 40] },
    {
      p: 0,
      n: 'Pricing for teams',
      k: 't',
      b: [32, 100, 600, 48],
      t: { c: 'Pricing for teams', f: 'Inter', w: 700, z: 40, h: 48, o: '#1a1a1a' },
      x: { t: 2 },
    },
  ]);
});

test('a text that paints a background is framed; one that fills its row wraps', () => {
  const button = node([0, 0, 120, 40], {
    kind: 'text',
    text: text('Buy now', { align: 'center', lineHeight: 20 }),
    paints: [{ kind: 'solid', colour: '#0055ffff' }],
    radius: [6, 6, 6, 6],
    flow: flow('none', { padding: [10, 16, 10, 16] }),
  });
  const packed = packedSection(
    section([
      layer(-1, 'row', node([0, 0, 400, 40], { flow: flow('row') })),
      layer(0, 'Button', button, {
        component: 'Button',
        bound: { fill: 'color/brand', radius: 'radius/sm' },
      }),
      layer(
        0,
        'Billed yearly',
        node([120, 0, 280, 20], {
          kind: 'text',
          fill: [true, false],
          text: text('Billed yearly', { lineHeight: 20 }),
        }),
      ),
    ]),
  );
  assert.deepEqual(packed.layers.slice(1), [
    {
      p: 0,
      n: 'Button',
      k: 't',
      b: [0, 0, 120, 40],
      l: ['H', 0, 0, 0, 10, 16, 10, 16, 'CENTER', 'CENTER'],
      f: ['#0055ff'],
      r: [6, 6, 6, 6],
      t: { c: 'Buy now', f: 'Inter', w: 400, z: 16, h: 20, a: 'CENTER', o: '#1a1a1a' },
      x: { f: 0, r: 1 },
    },
    {
      p: 0,
      n: 'Billed yearly',
      k: 't',
      b: [120, 0, 280, 20],
      g: [1, 0],
      t: { c: 'Billed yearly', f: 'Inter', w: 400, z: 16, h: 20, o: '#1a1a1a', m: 1 },
    },
  ]);
});

test('runs stay inside their text, and an inline part with an id moves up to the frame', () => {
  const sentence = text('Read the terms before you buy.', {
    runs: [
      { start: 9, end: 14, weight: 400, italic: false, underline: true, colour: '#0055ffff' },
      { start: 28, end: 40, weight: 700, italic: true, underline: false, colour: '#1a1a1aff' },
      { start: 5, end: 5, weight: 700, italic: false, underline: false, colour: '#1a1a1aff' },
    ],
  });
  const card = section([
    layer(-1, 'card', node([0, 0, 300, 100], { flow: flow('column') })),
    layer(0, 'Read the terms', node([0, 0, 300, 48], { kind: 'text', text: sentence })),
    layer(1, 'a', node([90, 0, 50, 24])),
  ]);
  const normal = normalizeSection(card);
  assert.equal(normal.layers[2]?.parent, 0);
  assert.equal(normal.layers[2]?.node.placed, 'absolute');
  assert.deepEqual(normalizeSection(normal), normal);
  const [, words, link] = packedSection(card).layers;
  assert.deepEqual(words?.t?.r, [
    [9, 14, 400, 0, 1, '#0055ff'],
    [28, 30, 700, 1, 0, '#1a1a1a'],
  ]);
  // Two lines in a box of 48 with lines of 24: it wraps at its width.
  assert.equal(words?.t?.m, 1);
  assert.deepEqual(link, { p: 0, n: 'a', b: [90, 0, 50, 24], a: 1 });
});

test('paints, borders and shadows pack; images are left to upload_assets and numbered', () => {
  const svg = '<svg width="24" height="24" viewBox="0 0 24 24"><path d="M0 0h24v24H0z"/></svg>';
  const banner = node([0, 0, 1280, 300], {
    paints: [
      { kind: 'solid', colour: '#000000ff' },
      {
        kind: 'linear',
        angle: 135,
        stops: [
          { at: 0, colour: '#ff000080' },
          { at: 1, colour: '#0000ffff' },
        ],
      },
      { kind: 'image', src: 'a1b2.png', fit: 'cover' },
    ],
    border: { widths: [0, 0, 1, 0], colour: '#e5e5e5ff' },
    shadows: [{ x: 0, y: 4, blur: 12, spread: -2, colour: '#00000033', inset: false }],
    opacity: 0.95,
    clips: true,
  });
  const packed = packedSection(
    section([
      layer(-1, 'banner', banner, { asset: 'a1b2.png' }),
      layer(
        0,
        'img',
        node([40, 40, 200, 200], {
          kind: 'image',
          paints: [{ kind: 'image', src: 'c3d4.jpg', fit: 'contain' }],
          radius: [100, 100, 100, 100],
        }),
        { asset: 'c3d4.jpg' },
      ),
      layer(0, 'svg', node([300, 40, 24, 24], { kind: 'svg', svg }), { asset: 'not-sent.png' }),
      layer(0, 'svg', node([340, 40, 24, 24], { kind: 'svg', svg: null }), { asset: 'big.png' }),
      layer(
        0,
        'single',
        node([0, 0, 10, 10], {
          paints: [{ kind: 'linear', angle: 90, stops: [{ at: 0.5, colour: '#123456ff' }] }],
        }),
      ),
    ]),
    { firstImage: 3 },
  );
  assert.deepEqual(packed.layers, [
    {
      p: -1,
      n: 'banner',
      b: [0, 0, 1280, 300],
      f: ['#000000', [135, [0, '#ff000080'], [1, '#0000ff']]],
      s: [0, 0, 1, 0, '#e5e5e5'],
      e: [[0, 4, 12, -2, '#00000033', 0]],
      o: 0.95,
      c: 1,
      i: 3,
    },
    { p: 0, n: 'img', b: [40, 40, 200, 200], r: [100, 100, 100, 100], i: 4 },
    { p: 0, n: 'svg', k: 's', v: svg, b: [300, 40, 24, 24] },
    { p: 0, n: 'svg', b: [340, 40, 24, 24], i: 5 },
    { p: 0, n: 'single', b: [0, 0, 10, 10], f: ['#123456'] },
  ]);
});

test("a literal keeps a draft's text a string: quotes, a backtick, </script>, line separators", () => {
  const [line, paragraph] = [0x2028, 0x2029].map((code) => String.fromCharCode(code));
  const characters = `A "quote", a \`tick\`, </script> and ${line} a line ${paragraph} break`;
  const code = literal({ c: characters });
  assert.ok(!code.includes(line ?? '') && !code.includes(paragraph ?? ''));
  assert.match(code, /\\u2028 a line \\u2029/);
  assert.deepEqual(JSON.parse(code), { c: characters });
  assert.equal(runInNewContext(`(${code}).c`), characters);
});

test('colours, variable names and scopes are what Figma takes', () => {
  assert.equal(hex('#FFFFFFFF'), '#ffffff');
  assert.equal(hex('#11223380'), '#11223380');
  assert.equal(hex('#112233'), '#112233');
  assert.equal(hex('red'), '#000000');
  assert.equal(figmaVariableName('space/1.5'), 'space/1_5');
  assert.equal(figmaVariableName('{color}/ink'), 'color/ink');
  assert.equal(figmaVariableName(' . '), '_');
  const syntax = 'var(--kit-color-ink)';
  assert.deepEqual(
    packVariable({
      name: 'color/ink',
      type: 'COLOR',
      value: { r: 0.1, g: 0.2, b: 0.3, a: 1 },
      scopes: ['ALL_FILLS', 'NOT_A_SCOPE'],
      syntax,
    }),
    { n: 'color/ink', t: 'COLOR', v: '#1a334d', s: ['ALL_FILLS'], c: syntax },
  );
  const veil = { name: 'color/veil', type: 'COLOR', value: { r: 0, g: 0, b: 0, a: 0.5 } } as const;
  assert.equal(packVariable({ ...veil, scopes: [], syntax: '' }).v, '#00000080');
  assert.deepEqual(
    packVariable({ name: 'space/1.5', type: 'FLOAT', value: 6, scopes: ['GAP'], syntax: '' }),
    { n: 'space/1_5', t: 'FLOAT', v: 6, s: ['GAP'], c: '' },
  );
});

/** A list: its root column, `groups` rows of `items` texts each, in document order. */
function listSection(groups: number, items: number): TreeSection {
  const root = node([0, 0, 1280, groups * 40], { flow: flow('column', { gap: 8 }) });
  const layers: TreeLayer[] = [layer(-1, 'list root', root)];
  for (let row = 1; row <= groups; row += 1) {
    const top = (row - 1) * 40;
    const group = layers.length;
    layers.push(
      layer(0, `group ${row}`, node([0, top, 1280, 32], { flow: flow('row', { gap: 4 }) }), {
        bound: { gap: 'space/xs' },
      }),
    );
    for (let item = 1; item <= items; item += 1) {
      const name = `Row ${row}, item ${item}`;
      const box: Node['box'] = [(item - 1) * 64, top, 60, 32];
      layers.push(layer(group, name, node(box, { kind: 'text', text: text(name) })));
    }
  }
  return { id: 'list', box: [0, 0, 1280, groups * 40], layers };
}

test('a section of 400 layers is cut into parts that fit, each going on where the last stopped', () => {
  const whole = listSection(19, 20);
  assert.equal(whole.layers.length, 400);
  const room = 6000;
  const parts = splitSection(whole, room);
  assert.ok(parts.length >= 3, `${parts.length} parts`);
  const continued = continuedIn(parts);
  let offset = 0;
  const marked = new Map<string, number>();
  parts.forEach((part, at) => {
    const own = ownLayers(part);
    const stubs = part.layers.slice(0, part.layers.length - own.length);
    assert.ok(stubs.every((stub) => stub.parent < -1));
    // Each stub stands for a frame an earlier part made, carrying its mark.
    const packed = packedSection(part, { offset, continued });
    assert.ok(literal(packed).length <= room, `part ${at + 1}: ${literal(packed).length}`);
    for (const stub of packed.continues) {
      assert.ok((marked.get(stub) ?? Number.POSITIVE_INFINITY) < at, stub);
    }
    packed.layers.forEach((each) => {
      if (each.m !== undefined) marked.set(each.m, at);
    });
    // Every own layer keeps its parent in the whole section.
    own.forEach((each, index) => {
      const original = whole.layers[offset + index];
      assert.equal(each.name, original?.name);
      const parent =
        each.parent === -1
          ? -1
          : each.parent < stubs.length
            ? -(stubs[each.parent]?.parent ?? 0) - 2
            : offset + each.parent - stubs.length;
      assert.equal(parent, original?.parent, `${each.name}`);
    });
    offset += own.length;
  });
  assert.equal(offset, 400);
  assert.deepEqual(splitSection(whole, 10_000_000), [whole]);
});
