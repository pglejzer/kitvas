import assert from 'node:assert/strict';
import { test } from 'node:test';
import type { LayerNode, LayerText } from '../../../src/checks/index.ts';
import { bindLayer, rawValues } from '../../../src/handoff/domain/figma/bind.ts';
import { kitVarName, tokenUses } from '../../../src/handoff/domain/figma/token-uses.ts';
import { cssVarName, type FlatToken } from '../../../src/kit/index.ts';

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

function text(over: Partial<LayerText> = {}): LayerText {
  return {
    characters: 'Hello',
    truncated: false,
    family: 'Inter',
    weight: 400,
    italic: false,
    size: 14,
    lineHeight: 20,
    letterSpacing: 0,
    align: 'left',
    transform: 'none',
    colour: '#111111ff',
    runs: [],
    ...over,
  };
}

const flow = (
  over: Partial<NonNullable<LayerNode['flow']>> = {},
): NonNullable<LayerNode['flow']> => ({
  direction: 'row',
  wrap: false,
  gap: 0,
  crossGap: 0,
  padding: [0, 0, 0, 0],
  justify: 'start',
  align: 'start',
  ...over,
});

const colour = (path: string, components: [number, number, number], alpha?: number): FlatToken => ({
  path: path.split('.'),
  type: 'color',
  value: { colorSpace: 'srgb', components, ...(alpha === undefined ? {} : { alpha }) },
});
const length = (path: string, value: number, unit: 'px' | 'rem' = 'px'): FlatToken => ({
  path: path.split('.'),
  type: 'dimension',
  value: { value, unit },
});

const solid = (hex: string): LayerNode['paints'] => [{ kind: 'solid', colour: hex }];

test('a colour is bound when one token has it and the CSS uses that token for paint', () => {
  const tokens = [colour('color.ink', [0, 0, 0]), colour('color.brand', [1, 0, 0])];
  const uses = tokenUses('.a { color: var(--kit-color-ink); background: var(--kit-color-brand) }');
  const bound = bindLayer(node({ paints: solid('#ff0000ff') }), tokens, uses);
  assert.deepEqual(bound, { fill: 'color/brand' });
  const stroke = node({ border: { widths: [1, 1, 1, 1], colour: '#000000ff' } });
  assert.deepEqual(bindLayer(stroke, tokens, uses), { stroke: 'color/ink' });
  const label = node({ kind: 'text', text: text({ colour: '#000000ff' }) });
  assert.equal(bindLayer(label, tokens, uses).text, 'color/ink');
});

test('two tokens with one value: not bound, and counted as raw', () => {
  const tokens = [colour('color.ink', [0, 0, 0]), colour('color.text', [0, 0, 0])];
  const uses = tokenUses('.a { color: var(--kit-color-ink); background: var(--kit-color-text) }');
  const layer = node({ paints: solid('#000000ff') });
  const bound = bindLayer(layer, tokens, uses);
  assert.deepEqual(bound, {});
  assert.equal(rawValues(layer, bound), 1);
});

test('a value of 12.5 beside a token of 12 is not bound', () => {
  const tokens = [length('space.sm', 12)];
  const uses = tokenUses('.a { gap: var(--kit-space-sm) }');
  assert.deepEqual(bindLayer(node({ flow: flow({ gap: 12.5 }) }), tokens, uses), {});
  assert.deepEqual(bindLayer(node({ flow: flow({ gap: 12 }) }), tokens, uses), { gap: 'space/sm' });
});

test('16px that is a space, a radius and a font size at once: each property takes its own token', () => {
  const tokens = [length('space.md', 16), length('radius.md', 16), length('size.md', 16)];
  const uses = tokenUses(`
    .a { gap: var(--kit-space-md); padding: var(--kit-space-md) 0 0 0 }
    .b { border-radius: var(--kit-radius-md) }
    .c { font-size: var(--kit-size-md) }
  `);
  const layer = node({
    flow: flow({ gap: 16, padding: [16, 0, 0, 0] }),
    radius: [16, 16, 16, 16],
    kind: 'text',
    text: text({ size: 16 }),
  });
  const bound = bindLayer(layer, tokens, uses);
  assert.equal(bound.gap, 'space/md');
  assert.equal(bound['padding-top'], 'space/md');
  assert.equal(bound.radius, 'radius/md');
  assert.equal(bound['font-size'], 'size/md');
});

test('a token the CSS uses for another kind of property is not taken', () => {
  const tokens = [length('radius.md', 16)];
  const uses = tokenUses('.b { border-radius: var(--kit-radius-md) }');
  assert.deepEqual(bindLayer(node({ flow: flow({ gap: 16 }) }), tokens, uses), {});
  assert.deepEqual(bindLayer(node({ radius: [16, 16, 16, 16] }), tokens, uses), {
    radius: 'radius/md',
  });
  assert.deepEqual(bindLayer(node({ radius: [16, 0, 16, 16] }), tokens, uses), {});
});

test('a token the CSS never uses is not bound', () => {
  assert.deepEqual(
    bindLayer(node({ flow: flow({ gap: 8 }) }), [length('space.sm', 8)], tokenUses('')),
    {},
  );
});

test('a token of rem is compared in px with rem as 16', () => {
  const tokens = [length('space.lg', 1.5, 'rem')];
  const uses = tokenUses('.a { padding-left: var(--kit-space-lg) }');
  const layer = node({ flow: flow({ padding: [0, 0, 0, 24] }) });
  assert.deepEqual(bindLayer(layer, tokens, uses), { 'padding-left': 'space/lg' });
});

test('colours compare as #rrggbbaa, alpha included, case aside', () => {
  const tokens = [colour('color.veil', [0, 0, 0], 0.5)];
  const uses = tokenUses('.a { background-color: var(--kit-color-veil) }');
  assert.deepEqual(bindLayer(node({ paints: solid('#00000080') }), tokens, uses), {
    fill: 'color/veil',
  });
  assert.deepEqual(bindLayer(node({ paints: solid('#000000FF') }), tokens, uses), {});
  const gradient: LayerNode['paints'] = [
    { kind: 'linear', angle: 90, stops: [{ at: 0, colour: '#00000080' }] },
  ];
  assert.deepEqual(bindLayer(node({ paints: gradient }), tokens, uses), {});
});

test('font weight and family are bound by value', () => {
  const tokens: FlatToken[] = [
    { path: ['font', 'weightBold'], type: 'fontWeight', value: 700 },
    { path: ['font', 'body'], type: 'fontFamily', value: ['Inter', 'Segoe UI', 'sans-serif'] },
    { path: ['font', 'code'], type: 'number', value: 700 },
  ];
  const uses = tokenUses(
    '.a { font-weight: var(--kit-font-weight-bold); font-family: var(--kit-font-body, serif) }',
  );
  const layer = node({
    kind: 'text',
    text: text({ weight: 700, family: '"Inter", sans-serif' }),
  });
  const bound = bindLayer(layer, tokens, uses);
  assert.equal(bound['font-weight'], 'font/weightBold');
  assert.equal(bound['font-family'], 'font/body');
  const other = node({ kind: 'text', text: text({ weight: 600, family: 'Georgia' }) });
  assert.deepEqual(bindLayer(other, tokens, uses), {});
});

test('raw values are counted: the painted values no variable stood for', () => {
  const tokens = [length('space.sm', 8)];
  const uses = tokenUses('.a { gap: var(--kit-space-sm) }');
  const layer = node({
    paints: solid('#123456ff'),
    flow: flow({ gap: 8, padding: [4, 0, 0, 0] }),
    radius: [6, 6, 6, 6],
  });
  const bound = bindLayer(layer, tokens, uses);
  assert.deepEqual(bound, { gap: 'space/sm' });
  assert.equal(rawValues(layer, bound), 3);
  assert.equal(rawValues(node(), {}), 0);
});

test('a kit of 600 tokens binds the right one for each of 2,000 layers', () => {
  const tokens = Array.from({ length: 600 }, (_, at) => length(`space.t${at}`, at + 1));
  const uses = tokenUses(
    tokens.map((token) => `.a { gap: var(${kitVarName(token.path)}) }`).join('\n'),
  );
  assert.equal(uses.size, 600);
  for (let at = 0; at < 2000; at += 1) {
    const gap = (at % 600) + 1;
    assert.deepEqual(bindLayer(node({ flow: flow({ gap }) }), tokens, uses), {
      gap: `space/t${gap - 1}`,
    });
  }
});

test('tokenUses reads each variable for the kinds of property that use it', () => {
  const uses = tokenUses(`
    /* color: var(--kit-never-used); */
    :root { --kit-space-md: 16px; --card-pad: var(--kit-space-sm); }
    .a { padding: var(--kit-space-md) var(--kit-space-lg); border-radius: var(--kit-radius-md) }
    .b{border:1px solid var(--kit-color-line);margin-inline:var(--kit-space-md)}
    .c { font: var(--kit-font-weight-bold) var(--kit-font-size-md) var(--kit-font-body) }
    .d { background: linear-gradient(var(--kit-color-a), var(--kit-color-b)); gap: var(--missing, var(--kit-space-xs)) }
    .e:hover { color: var(--kit-color-ink) }
  `);
  const kinds = (name: string): string[] => [...(uses.get(name) ?? [])].sort();
  assert.deepEqual(kinds('--kit-space-md'), ['space']);
  assert.deepEqual(kinds('--kit-space-lg'), ['space']);
  assert.deepEqual(kinds('--kit-radius-md'), ['radius']);
  assert.deepEqual(kinds('--kit-color-line'), ['paint']);
  assert.deepEqual(kinds('--kit-font-size-md'), ['font-family', 'font-size', 'font-weight']);
  assert.deepEqual(kinds('--kit-color-a'), ['paint']);
  assert.deepEqual(kinds('--kit-color-b'), ['paint']);
  assert.deepEqual(kinds('--kit-space-xs'), ['space']);
  assert.deepEqual(kinds('--kit-color-ink'), ['paint']);
  assert.equal(uses.has('--kit-never-used'), false);
  assert.equal(uses.has('--kit-space-sm'), false, 'a custom property is not a use');
});

test('kitVarName is the kit module cssVarName', () => {
  for (const path of [
    ['space', 'md'],
    ['font', 'weightBold'],
    ['Color', 'Brand_Name'],
    ['a', '2xl'],
  ]) {
    assert.equal(kitVarName(path), cssVarName(path));
  }
});
