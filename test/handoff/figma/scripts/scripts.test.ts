import assert from 'node:assert/strict';
import { after, before, test } from 'node:test';
import type { LayerFlow, LayerText } from '../../../../src/checks/index.ts';
import { bundleFigmaBuilder } from '../../../../src/handoff/app/figma/bundle.ts';
import {
  FIGMA_SCRIPT_LIMIT,
  type FigmaScript,
  figmaScripts,
} from '../../../../src/handoff/domain/figma/scripts/scripts.ts';
import type {
  HandoffTree,
  TreeFrame,
  TreeLayer,
  TreeSection,
} from '../../../../src/handoff/domain/figma/tree.ts';
import type { FigmaVariable } from '../../../../src/handoff/domain/figma/variables.ts';
import { createEsbuildBundler } from '../../../../src/render/adapters/esbuild-bundler.ts';
import { PLUGIN_ROOT } from '../../../../src/shared/index.ts';
import { JSX_RUNTIME } from '../../../helpers/draft/render.ts';
import {
  createFigmaFake,
  type FakeDocument,
  type FakeNodeData,
  type FigmaFake,
  runScript,
} from '../../../helpers/handoff/figma-fake.ts';

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
): TreeLayer => ({ parent, name, component: null, node: data, bound: {}, asset: null, ...extra });
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
const solid = (colour: string) => ({ kind: 'solid' as const, colour });

const SVG = '<svg width="24" height="24" viewBox="0 0 24 24"><path d="M0 0h24v24H0z"/></svg>';

/** Eight layers: a column, a heading that wraps, a row (a card with a button, an image, an icon), a badge. */
function pricingSection(id: string, top: number, width: number): TreeSection {
  const inner = width - 24;
  const row = flow('row', { gap: 12, wrap: true, crossGap: 12 });
  const card = node([12, top + 72, 200, 200], {
    flow: flow('column', { padding: [12, 12, 12, 12] }),
    paints: [solid('#f5f5f5ff')],
    radius: [8, 8, 8, 8],
    border: { widths: [1, 1, 1, 1], colour: '#e0e0e0ff' },
    shadows: [{ x: 0, y: 2, blur: 8, spread: 0, colour: '#00000026', inset: false }],
  });
  const button = node([24, top + 84, 120, 40], {
    kind: 'text',
    text: text('Buy now', { align: 'center', lineHeight: 20, weight: 700 }),
    paints: [solid('#1a1a1aff')],
    flow: flow('none', { padding: [10, 16, 10, 16] }),
  });
  return {
    id,
    box: [0, top, width, 400],
    layers: [
      layer(
        -1,
        'section',
        node([0, top, width, 400], {
          flow: flow('column', { gap: 12, padding: [12, 12, 12, 12] }),
          paints: [solid('#ffffffff')],
        }),
        { bound: { fill: 'color/surface', gap: 'space/md', 'padding-top': 'space/md' } },
      ),
      layer(
        0,
        'Heading',
        node([12, top + 12, inner, 48], {
          kind: 'text',
          fill: [false, true],
          text: text(`${id} plans`, { weight: 700, size: 20, lineHeight: 48 }),
        }),
        { bound: { text: 'color/ink', 'font-size': 'font/size/lg' } },
      ),
      layer(0, 'row', node([12, top + 72, inner, 200], { flow: row })),
      layer(2, 'Card', card, {
        component: 'Card',
        bound: { radius: 'radius/md', stroke: 'color/line' },
      }),
      layer(3, 'Button', button, { component: 'Button' }),
      layer(
        2,
        'img',
        node([224, top + 72, 200, 200], {
          kind: 'image',
          paints: [{ kind: 'image', src: 'photo.png', fit: 'cover' }],
        }),
        { asset: 'photo.png' },
      ),
      layer(2, 'Icon', node([436, top + 72, 24, 24], { kind: 'svg', svg: SVG })),
      layer(
        0,
        'badge',
        node([width - 60, top + 4, 48, 20], { placed: 'absolute', paints: [solid('#ff0000ff')] }),
      ),
    ],
  };
}

/** A list: a root column, `groups` rows of `items` texts each, in document order. */
function listSection(id: string, groups: number, items: number): TreeSection {
  const root = node([0, 0, 1280, groups * 40], { flow: flow('column', { gap: 8 }) });
  const layers: TreeLayer[] = [layer(-1, `${id} root`, root)];
  for (let row = 1; row <= groups; row += 1) {
    const top = (row - 1) * 40;
    const group = layers.length;
    layers.push(layer(0, `${id} group ${row}`, node([0, top, 1280, 32], { flow: flow('row') })));
    for (let item = 1; item <= items; item += 1) {
      const name = `Row ${row}, item ${item}`;
      const box: Node['box'] = [(item - 1) * 64, top, 60, 32];
      layers.push(layer(group, name, node(box, { kind: 'text', text: text(name) })));
    }
  }
  return { id, box: [0, 0, 1280, groups * 40], layers };
}

function treeOf(frames: TreeFrame[]): HandoffTree {
  const counts = { layers: 0, texts: 0, images: 0, icons: 0 };
  for (const frame of frames) {
    for (const section of frame.sections) {
      for (const { node: data } of section.layers) {
        counts.layers += 1;
        if (data.kind === 'text') counts.texts += 1;
        if (data.kind === 'image') counts.images += 1;
        if (data.kind === 'svg') counts.icons += 1;
      }
    }
  }
  const fonts = [
    { family: 'Inter', weight: 400, italic: false },
    { family: 'Inter', weight: 700, italic: false },
  ];
  return {
    schemaVersion: 1,
    slug: 'pricing',
    version: 3,
    kit: 'base',
    state: 'default',
    sendId: 'k7x2m9qa',
    frames,
    fonts,
    counts,
    unbound: 0,
  };
}

const pricing = (): HandoffTree =>
  treeOf(
    [1280, 390].map((width) => ({
      width,
      height: 1200,
      background: '#fafafaff',
      sections: ['hero', 'plans', 'faq'].map((id, at) => pricingSection(id, at * 400, width)),
    })),
  );

const variable = (
  name: string,
  type: FigmaVariable['type'],
  value: FigmaVariable['value'],
  scope: string,
): FigmaVariable => ({
  name,
  type,
  value,
  scopes: [scope],
  syntax: `var(--kit-${name.replace(/\//g, '-')})`,
});
const VARIABLES: FigmaVariable[] = [
  variable('color/surface', 'COLOR', { r: 1, g: 1, b: 1, a: 1 }, 'FRAME_FILL'),
  variable('color/ink', 'COLOR', { r: 0.1, g: 0.1, b: 0.1, a: 1 }, 'TEXT_FILL'),
  variable('color/line', 'COLOR', { r: 0.88, g: 0.88, b: 0.88, a: 1 }, 'STROKE_COLOR'),
  variable('space/md', 'FLOAT', 12, 'GAP'),
  variable('radius/md', 'FLOAT', 8, 'CORNER_RADIUS'),
  variable('font/size/lg', 'FLOAT', 20, 'FONT_SIZE'),
];

const PAGE = 'kitvas · pricing';
const bundler = createEsbuildBundler({ roots: [PLUGIN_ROOT], jsxRuntime: JSX_RUNTIME });
let builder = '';
before(async () => {
  builder = await bundleFigmaBuilder({ bundler });
});
after(async () => {
  await bundler.dispose();
});

const everyNode = (doc: FakeDocument): FakeNodeData[] =>
  Object.values(doc.nodes)
    .flat()
    .filter((each) => each.page === PAGE);
const byId = (doc: FakeDocument, id: string): FakeNodeData => {
  const found = everyNode(doc).find((each) => each.id === id);
  assert.ok(found, `no node ${id}`);
  return found;
};
const named = (doc: FakeDocument, name: string): FakeNodeData[] => doc.nodes[name] ?? [];
const childNames = (doc: FakeDocument, parent: FakeNodeData): string[] =>
  parent.children.map((id) => byId(doc, id).name);

async function runAll(fake: FigmaFake, scripts: readonly FigmaScript[]) {
  const results = new Map<string, unknown>();
  for (const script of scripts) results.set(script.file, await runScript(script.code, fake.figma));
  return results;
}

/** No mark left in a name, no shimmer left on. */
function assertClosed(doc: FakeDocument): void {
  for (const each of everyNode(doc)) {
    assert.doesNotMatch(each.name, /⟨/, each.name);
    assert.equal(each.placeholder, false, each.name);
  }
}

test('every script of a three-section tree runs in order on the fake and builds the draft', async () => {
  const tree = pricing();
  const { scripts } = figmaScripts(tree, VARIABLES, builder, { limit: FIGMA_SCRIPT_LIMIT });
  const files = scripts.map((script) => script.file);
  assert.deepEqual(files, [
    '00-inspect.js',
    '10-variables.js',
    '20-frames.js',
    '30-1280-01.js',
    '30-1280-02.js',
    '30-1280-03.js',
    '30-390-01.js',
    '30-390-02.js',
    '30-390-03.js',
    '40-image-targets.js',
    '50-close.js',
  ]);
  assert.deepEqual([...files].sort(), files);
  const fake = createFigmaFake();
  const results = await runAll(fake, scripts);
  const doc = fake.snapshot();

  assert.deepEqual(
    doc.pages.map((page) => page.name),
    ['Page 1', PAGE],
  );
  const page = doc.pages[1];
  assert.ok(page);
  const frames = page.children.map((id) => byId(doc, id));
  assert.deepEqual(
    frames.map((frame) => [frame.name, frame.box]),
    [
      ['pricing v3 · 1280', [0, 0, 1280, 1200]],
      ['pricing v3 · 390', [1480, 0, 390, 1200]],
    ],
  );
  for (const frame of frames) assert.deepEqual(childNames(doc, frame), ['hero', 'plans', 'faq']);
  // Every layer of the tree, and the text inside each button's frame.
  assert.equal(everyNode(doc).length - 2 - 6, tree.counts.layers + 6);
  for (const section of named(doc, 'section')) {
    assert.deepEqual(section.bound, {
      'fills.0': 'color/surface',
      itemSpacing: 'space/md',
      paddingTop: 'space/md',
    });
  }
  for (const heading of named(doc, 'Heading')) {
    assert.deepEqual(heading.bound, { 'fills.0': 'color/ink', fontSize: 'font/size/lg' });
    assert.equal(heading.text?.autoResize, 'HEIGHT');
    assert.equal(heading.sizing[0], 'FILL');
  }
  const radius = 'radius/md';
  for (const card of named(doc, 'Card')) {
    assert.deepEqual(card.bound, {
      'strokes.0': 'color/line',
      topLeftRadius: radius,
      topRightRadius: radius,
      bottomRightRadius: radius,
      bottomLeftRadius: radius,
    });
  }
  assert.equal(named(doc, 'Card')[0]?.frame?.effects.length, 1);
  assert.ok(named(doc, 'badge').every((badge) => badge.positioning === 'ABSOLUTE'));
  assert.deepEqual(named(doc, 'Buy now')[0]?.text?.fontName, { family: 'Inter', style: 'Bold' });
  assert.equal(named(doc, 'Icon')[0]?.frame?.svg, SVG);
  assert.deepEqual(
    doc.collections.map((collection) => [collection.name, collection.modes]),
    [['kitvas · base', ['Default']]],
  );
  assert.deepEqual(
    doc.variables.map((each) => [each.name, each.scopes, each.codeSyntax.WEB]),
    VARIABLES.map((each) => [each.name, each.scopes, each.syntax]),
  );
  assertClosed(doc);

  assert.deepEqual(results.get('00-inspect.js'), {
    pages: 1,
    page: null,
    collection: null,
    fontsMissing: [],
  });
  for (const file of files.filter((name) => name.startsWith('30-'))) {
    const result = results.get(file);
    assert.ok(typeof result === 'object' && result !== null);
    assert.deepEqual(
      [Reflect.get(result, 'skipped'), Reflect.get(result, 'refused')],
      [false, 0],
      file,
    );
  }
  // The image layers' ids, in the order of the assets: per width, then per section.
  assert.deepEqual(results.get('40-image-targets.js'), {
    nodeIds: named(doc, 'img').map((image) => image.id),
  });
  assert.deepEqual(results.get('50-close.js'), {
    skipped: false,
    page: page.id,
    frames: [
      { width: 1280, node: frames[0]?.id },
      { width: 390, node: frames[1]?.id },
    ],
    counts: { sections: 6, layers: 54, texts: 12 },
    unbuilt: [],
    fontsMissing: [],
  });
});

test('each script run a second time changes nothing and says so', async () => {
  const { scripts } = figmaScripts(pricing(), VARIABLES, builder, { limit: FIGMA_SCRIPT_LIMIT });
  const fake = createFigmaFake();
  for (const script of scripts) {
    const first = await runScript(script.code, fake.figma);
    const done = fake.snapshot();
    const again = await runScript(script.code, fake.figma);
    assert.deepEqual(fake.snapshot(), done, script.file);
    if (script.writes) {
      assert.ok(typeof again === 'object' && again !== null, script.file);
      assert.equal(Reflect.get(again, 'skipped'), true, script.file);
    } else assert.deepEqual(again, first, script.file);
  }
  assertClosed(fake.snapshot());
});

test('a section of 400 layers is split, refuses to run out of order, and is built whole', async () => {
  const list = listSection('list', 19, 20);
  assert.equal(list.layers.length, 400);
  const tree = treeOf([{ width: 1280, height: 800, background: '#ffffffff', sections: [list] }]);
  const limit = builder.length + 9000;
  const { scripts } = figmaScripts(tree, VARIABLES, builder, { limit });
  assert.ok(scripts.every((script) => script.code.length <= limit));
  const parts = scripts.filter((script) => script.file.startsWith('30-'));
  assert.ok(parts.length >= 3, `${parts.length} parts`);
  const [first, second, third] = parts;
  assert.ok(first && second && third);
  const fake = createFigmaFake();
  await runAll(
    fake,
    scripts.filter((script) => script.file < '30-'),
  );
  await runScript(first.code, fake.figma);
  await assert.rejects(
    runScript(third.code, fake.figma),
    /Part 2 of section "list" has not run yet/,
  );
  // What a run of part 2 that stopped halfway would have left: cleared by the next run of part 2.
  await runScript(
    [
      `const page = figma.root.children.find((each) => each.name === ${JSON.stringify(PAGE)});`,
      'await figma.setCurrentPageAsync(page);',
      'const junk = figma.createFrame();',
      "junk.name = 'half ⟨b2⟩';",
      'page.children[0].children[0].appendChild(junk);',
    ].join('\n'),
    fake.figma,
  );
  await runAll(
    fake,
    scripts.filter((script) => script.file > first.file),
  );
  const doc = fake.snapshot();
  assert.equal(named(doc, 'half ⟨b2⟩').length, 0);
  const root = named(doc, 'list root')[0];
  assert.ok(root);
  const groups = root.children.map((id) => byId(doc, id));
  assert.deepEqual(
    groups.map((group) => group.name),
    Array.from({ length: 19 }, (_, at) => `list group ${at + 1}`),
  );
  groups.forEach((group, at) => {
    assert.deepEqual(
      childNames(doc, group),
      Array.from({ length: 20 }, (_, item) => `Row ${at + 1}, item ${item + 1}`),
    );
  });
  assert.equal(everyNode(doc).length, 1 + 1 + 400);
  assertClosed(doc);
});

test('a text with a quote, a backtick and </script> arrives in Figma as written', async () => {
  const line = String.fromCharCode(0x2028);
  const characters = `A "quote", a \`tick\`, \${not} and </script>${line}and a line break.`;
  const note: TreeSection = {
    id: 'note',
    box: [0, 0, 390, 100],
    layers: [
      layer(-1, 'note', node([0, 0, 390, 100])),
      layer(0, 'odd text', node([0, 0, 390, 48], { kind: 'text', text: text(characters) })),
    ],
  };
  const tree = treeOf([{ width: 390, height: 100, background: '#ffffffff', sections: [note] }]);
  const { scripts } = figmaScripts(tree, [], builder, { limit: FIGMA_SCRIPT_LIMIT });
  assert.deepEqual(
    scripts.map((script) => script.file),
    ['00-inspect.js', '20-frames.js', '30-390-01.js', '50-close.js'],
  );
  const fake = createFigmaFake();
  await runAll(fake, scripts);
  assert.equal(named(fake.snapshot(), 'odd text')[0]?.text?.characters, characters);
});

test('no script is over 45,000 characters, however large the draft and the kit', async () => {
  const frames = [1280, 390].map((width) => ({
    width,
    height: 3000,
    background: '#ffffffff',
    sections: ['a', 'b', 'c'].map((id) => listSection(id, 23, 20)),
  }));
  const tree = treeOf(frames);
  assert.equal(tree.counts.layers, 2 * 3 * 484);
  const kit = Array.from({ length: 600 }, (_, at) =>
    variable(`color/c${at}`, 'COLOR', { r: at / 600, g: 0.5, b: 0, a: 1 }, 'ALL_FILLS'),
  );
  const { scripts, steps } = figmaScripts(tree, kit, builder, { limit: FIGMA_SCRIPT_LIMIT });
  for (const script of scripts) {
    assert.ok(script.code.length <= FIGMA_SCRIPT_LIMIT, `${script.file}: ${script.code.length}`);
  }
  const files = scripts.map((script) => script.file);
  assert.deepEqual([...files].sort(), files);
  assert.ok(files.includes('10-variables-01.js') && files.includes('10-variables-02.js'));
  assert.ok(files.filter((file) => file.startsWith('30-390-')).length > 3);
  assert.deepEqual(
    steps.map((step) => (step.kind === 'script' ? step.file : 'assets')),
    files,
  );
  const fake = createFigmaFake();
  await runAll(fake, scripts);
  const doc = fake.snapshot();
  assert.equal(everyNode(doc).length, 2 + 6 + tree.counts.layers);
  assert.equal(doc.variables.length, 600);
  assertClosed(doc);
});

test("the steps follow the scripts, with the images' upload after their targets", () => {
  const { scripts, steps } = figmaScripts(pricing(), VARIABLES, builder, { limit: 45_000 });
  const files = scripts.map((script) => script.file);
  const at = files.indexOf('40-image-targets.js') + 1;
  assert.deepEqual(
    steps.map((step) => (step.kind === 'script' ? step.file : `assets of ${step.targets}`)),
    [...files.slice(0, at), 'assets of 40-image-targets.js', ...files.slice(at)],
  );
  const assets = steps.find((step) => step.kind === 'assets');
  assert.deepEqual(
    assets?.kind === 'assets' ? assets.items : [],
    Array.from({ length: 6 }, () => ({ file: 'photo.png', contentType: 'image/png' })),
  );
  const writes = steps.flatMap((step) =>
    step.kind === 'script' && !step.writes ? [step.file] : [],
  );
  assert.deepEqual(writes, ['00-inspect.js', '40-image-targets.js']);
  assert.ok(steps.every((step) => step.kind !== 'script' || step.description.length > 0));
});
