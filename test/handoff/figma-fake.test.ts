import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createFigmaFake, runScript } from '../helpers/handoff/figma-fake.ts';

const FONT = "await figma.loadFontAsync({ family: 'Inter', style: 'Regular' });";
const SVG = '<svg width="16" height="16" viewBox="0 0 16 16"><path d="M0 0h16v16H0z"/></svg>';
const lines = (...code: string[]): string => code.join('\n');

test('runScript gives back what the script returns, as JSON, with await at the top', async () => {
  const { figma } = createFigmaFake();
  const result = await runScript(
    lines(
      'const fonts = await figma.listAvailableFontsAsync();',
      'const frame = figma.createFrame();',
      "frame.name = 'probe';",
      "return { fonts: fonts.length, id: frame.id, nothing: undefined, list: [1, 'two'] };",
    ),
    figma,
  );
  assert.deepEqual(result, { fonts: 8, id: '1:2', list: [1, 'two'] });
  assert.equal(await runScript('const x = 1;', figma), undefined);
  await assert.rejects(runScript('return (', figma), /Unexpected/);
  await assert.rejects(runScript("throw new Error('stopped here');", figma), /stopped here/);
});

test('the same script on two new files gives the same document', async () => {
  const script = lines(
    "const frame = figma.createAutoLayout('VERTICAL');",
    "frame.name = 'card';",
    FONT,
    'const text = figma.createText();',
    "text.characters = 'Hello';",
    'frame.appendChild(text);',
  );
  const first = createFigmaFake();
  const second = createFigmaFake();
  await runScript(script, first.figma);
  await runScript(script, second.figma);
  assert.deepEqual(first.snapshot(), second.snapshot());
  const { nodes } = first.snapshot();
  assert.deepEqual(nodes.card?.[0]?.children, [nodes.Hello?.[0]?.id]);
  assert.deepEqual(
    first.calls.map((call) => call.name),
    ['createAutoLayout', 'loadFontAsync', 'createText'],
  );
});

test('a colour channel over 1 and an a in a paint colour are refused, as Figma refuses them', async () => {
  const { figma, snapshot } = createFigmaFake();
  const fill = (paint: string): string => `figma.createFrame().fills = [${paint}];`;
  await assert.rejects(
    runScript(fill("{ type: 'SOLID', color: { r: 255, g: 0, b: 0 } }"), figma),
    /"\[0\]\.color\.r" to have a value from 0 to 1, got 255/,
  );
  await assert.rejects(
    runScript(fill("{ type: 'SOLID', color: { r: 1, g: 0, b: 0, a: 1 } }"), figma),
    /Unrecognized key\(s\) in object: 'a'/,
  );
  await assert.rejects(
    runScript(fill("{ type: 'SOLID', color: { r: 1, g: 0, b: 0 }, opacity: 2 }"), figma),
    /opacity" to have a value from 0 to 1/,
  );
  // Alpha goes in the paint's opacity; a gradient stop and a shadow take an `a`.
  await runScript(
    lines(
      'const frame = figma.createFrame();',
      "frame.name = 'tinted';",
      "frame.fills = [{ type: 'SOLID', color: { r: 1, g: 0, b: 0 }, opacity: 0.5 }, {",
      "  type: 'GRADIENT_LINEAR', gradientTransform: [[1, 0, 0], [0, 1, 0]],",
      '  gradientStops: [{ position: 0, color: { r: 0, g: 0, b: 0, a: 1 } },',
      '    { position: 1, color: { r: 1, g: 1, b: 1, a: 0 } }] }];',
      "frame.effects = [{ type: 'DROP_SHADOW', color: { r: 0, g: 0, b: 0, a: 0.25 },",
      "  offset: { x: 0, y: 2 }, radius: 4, spread: 0, visible: true, blendMode: 'NORMAL' }];",
    ),
    figma,
  );
  const tinted = snapshot().nodes.tinted?.[0];
  assert.equal(tinted?.fills.length, 2);
  assert.equal(tinted?.frame?.effects.length, 1);
});

test('text is written only after its font is loaded, in the same call', async () => {
  const { figma, snapshot } = createFigmaFake();
  await assert.rejects(
    runScript("const text = figma.createText();\ntext.characters = 'Hello';", figma),
    /Cannot write to node with unloaded font "Inter Regular"/,
  );
  const greeting = lines(
    FONT,
    'const text = figma.createText();',
    "text.name = 'greeting';",
    "text.characters = 'Hello';",
  );
  await runScript(greeting, figma);
  assert.equal(snapshot().nodes.greeting?.[0]?.text?.characters, 'Hello');
  // A font loaded by an earlier call is not loaded in this one.
  await assert.rejects(runScript('figma.createText().fontSize = 20;', figma), /unloaded font/);
  await assert.rejects(
    runScript("await figma.loadFontAsync({ family: 'Nope', style: 'Regular' });", figma),
    /The font "Nope Regular" could not be loaded/,
  );
  // A bold run needs its own font loaded, and so does a node set to it.
  const hello = lines(FONT, 'const text = figma.createText();', "text.characters = 'Hello';");
  await assert.rejects(
    runScript(`${hello}\ntext.setRangeFontName(0, 2, { family: 'Inter', style: 'Bold' });`, figma),
    /unloaded font "Inter Bold"/,
  );
  await assert.rejects(
    runScript(`${hello}\ntext.fontName = { family: 'Inter', style: 'Bold' };`, figma),
    /unloaded font "Inter Bold"/,
  );
});

test('FILL and ABSOLUTE need an auto-layout parent, so they come after appendChild', async () => {
  const { figma, snapshot } = createFigmaFake();
  const head = lines(
    "const row = figma.createAutoLayout('HORIZONTAL');",
    'const cell = figma.createFrame();',
    "cell.name = 'cell';",
  );
  await assert.rejects(
    runScript(`${head}\ncell.layoutSizingHorizontal = 'FILL';`, figma),
    /FILL can only be set on children of auto-layout frames/,
  );
  await assert.rejects(
    runScript(`${head}\ncell.layoutPositioning = 'ABSOLUTE';`, figma),
    /ABSOLUTE can only be set on children of auto-layout frames/,
  );
  await assert.rejects(
    runScript(`${head}\ncell.layoutSizingVertical = 'HUG';`, figma),
    /HUG can only be set on auto-layout frames and text nodes/,
  );
  await runScript(
    lines(
      head,
      'row.appendChild(cell);',
      "cell.layoutSizingHorizontal = 'FILL';",
      "cell.layoutPositioning = 'ABSOLUTE';",
    ),
    figma,
  );
  const cells = snapshot().nodes.cell ?? [];
  assert.equal(cells.length, 4);
  assert.deepEqual(cells.at(-1)?.sizing, ['FILL', 'FIXED']);
  assert.equal(cells.at(-1)?.positioning, 'ABSOLUTE');
});

test('a call switches the page at most once, and only with setCurrentPageAsync', async () => {
  const { figma, snapshot } = createFigmaFake();
  await assert.rejects(
    runScript(
      lines(
        'const page = figma.createPage();',
        'await figma.setCurrentPageAsync(page);',
        'await figma.setCurrentPageAsync(figma.root.children[0]);',
      ),
      figma,
    ),
    /switches the page at most once/,
  );
  assert.equal(snapshot().currentPage, 'Page 2');
  await assert.rejects(
    runScript('figma.currentPage = figma.root.children[0];', figma),
    /not supported in use_figma: await figma\.setCurrentPageAsync/,
  );
  // The next call may switch again.
  await runScript('await figma.setCurrentPageAsync(figma.root.children[0]);', figma);
  assert.equal(snapshot().currentPage, 'Page 1');
});

test('fills, strokes and effects read from a node cannot be changed in place', async () => {
  const { figma, snapshot } = createFigmaFake();
  const black = "{ type: 'SOLID', color: { r: 0, g: 0, b: 0 } }";
  const shadow =
    "{ type: 'DROP_SHADOW', color: { r: 0, g: 0, b: 0, a: 0.2 }, offset: { x: 0, y: 1 }, radius: 2, visible: true, blendMode: 'NORMAL' }";
  const changes: [string, string][] = [
    ['fills', 'frame.fills[0].color.r = 0.5;'],
    ['fills', `frame.fills.push(${black});`],
    ['fills', 'frame.fills[0] = frame.fills[0];'],
    ['fills', 'delete frame.fills[0].color;'],
    ['strokes', `frame.strokes = [${black}];\nframe.strokes[0].color.g = 1;`],
    ['effects', `frame.effects = [${shadow}];\nframe.effects[0].radius = 8;`],
  ];
  for (const [what, change] of changes) {
    await assert.rejects(
      runScript(`const frame = figma.createFrame();\n${change}`, figma),
      new RegExp(`Cannot change ${what} in place`),
      change,
    );
  }
  // A copy, changed and assigned, is the way.
  await runScript(
    lines(
      'const frame = figma.createFrame();',
      "frame.name = 'copied';",
      'const fills = JSON.parse(JSON.stringify(frame.fills));',
      'fills[0].color = { r: 0.5, g: 0.5, b: 0.5 };',
      'frame.fills = fills;',
    ),
    figma,
  );
  assert.deepEqual(snapshot().nodes.copied?.[0]?.fills, [
    { type: 'SOLID', color: { r: 0.5, g: 0.5, b: 0.5 } },
  ]);
});

test('the calls use_figma forbids fail', async () => {
  const { figma, calls } = createFigmaFake();
  for (const call of [
    "figma.notify('done');",
    "figma.createFrame().setPluginData('kitvas', '1');",
    "figma.currentPage.setPluginData('kitvas', '1');",
    'await figma.createImageAsync("https://example.com/a.png");',
    'await figma.loadAllPagesAsync();',
    'figma.closePlugin();',
  ]) {
    await assert.rejects(runScript(call, figma), /is not available in use_figma/, call);
  }
  assert.ok(calls.some((call) => call.name === 'notify'));
});

test('the calls of probe P1 run on the fake: variables, a bound fill and gap, text, an SVG', async () => {
  const { figma, snapshot } = createFigmaFake();
  const result = await runScript(
    lines(
      "const collection = figma.variables.createVariableCollection('kitvas · base');",
      "collection.renameMode(collection.modes[0].modeId, 'Default');",
      "const ink = figma.variables.createVariable('color/ink', collection, 'COLOR');",
      "ink.scopes = ['FRAME_FILL', 'SHAPE_FILL'];",
      "ink.setVariableCodeSyntax('WEB', 'var(--kit-color-ink)');",
      'ink.setValueForMode(collection.defaultModeId, { r: 0.1, g: 0.2, b: 0.3, a: 1 });',
      "const gap = figma.variables.createVariable('space/md', collection, 'FLOAT');",
      "gap.scopes = ['GAP'];",
      'gap.setValueForMode(collection.defaultModeId, 12);',
      "const family = figma.variables.createVariable('font/family', collection, 'STRING');",
      "family.scopes = ['FONT_FAMILY'];",
      "family.setValueForMode(collection.defaultModeId, 'Inter');",
      "const frame = figma.createAutoLayout('VERTICAL');",
      "frame.name = 'card';",
      'frame.paddingTop = 16;',
      "const solid = { type: 'SOLID', color: { r: 1, g: 1, b: 1 } };",
      "frame.fills = [figma.variables.setBoundVariableForPaint(solid, 'color', ink)];",
      "frame.setBoundVariable('itemSpacing', gap);",
      FONT,
      'const text = figma.createText();',
      "text.characters = 'Pricing';",
      'frame.appendChild(text);',
      "text.layoutSizingHorizontal = 'HUG';",
      `const icon = figma.createNodeFromSvg('${SVG}');`,
      'frame.appendChild(icon);',
      "icon.layoutSizingHorizontal = 'FILL';",
      'return { gap: frame.itemSpacing, icon: icon.type, kept: solid.boundVariables === undefined };',
    ),
    figma,
  );
  assert.deepEqual(result, { gap: 12, icon: 'FRAME', kept: true });
  const document = snapshot();
  const card = document.nodes.card?.[0];
  assert.deepEqual(card?.bound, { itemSpacing: 'space/md', 'fills.0': 'color/ink' });
  assert.equal(card?.children.length, 2);
  assert.equal(document.nodes.Frame?.[0]?.frame?.svg, SVG);
  assert.deepEqual(
    document.collections.map((collection) => [collection.name, collection.modes]),
    [['kitvas · base', ['Default']]],
  );
  const ink = document.variables.find((variable) => variable.name === 'color/ink');
  assert.deepEqual(ink?.scopes, ['FRAME_FILL', 'SHAPE_FILL']);
  assert.deepEqual(ink?.codeSyntax, { WEB: 'var(--kit-color-ink)' });
  assert.deepEqual(ink?.values, { Default: { r: 0.1, g: 0.2, b: 0.3, a: 1 } });
  assert.deepEqual(
    document.variables.map((variable) => [variable.name, variable.type]),
    [
      ['color/ink', 'COLOR'],
      ['space/md', 'FLOAT'],
      ['font/family', 'STRING'],
    ],
  );
});

test('variables refuse what Figma refuses: a scope of another type, a bad name, a twin', async () => {
  const { figma } = createFigmaFake();
  const make = "const set = figma.variables.createVariableCollection('kitvas · base');";
  const refused: [string, RegExp][] = [
    [
      "figma.variables.createVariable('color/a', set, 'COLOR').scopes = ['GAP'];",
      /Invalid scope GAP for a COLOR variable/,
    ],
    ["figma.variables.createVariable('space/1.5', set, 'FLOAT');", /Invalid variable name/],
    [
      lines(
        "figma.variables.createVariable('a', set, 'FLOAT');",
        "figma.variables.createVariable('a', set, 'FLOAT');",
      ),
      /already in this collection/,
    ],
    ["figma.variables.createVariable('a', set.id, 'FLOAT');", /passed as itself/],
    [
      lines(
        "const v = figma.variables.createVariable('c', set, 'COLOR');",
        "figma.createFrame().setBoundVariable('itemSpacing', v);",
      ),
      /itemSpacing takes a FLOAT variable, got COLOR/,
    ],
  ];
  for (const [code, message] of refused) {
    await assert.rejects(runScript(lines(make, code), figma), message, code);
  }
});

test('a later call finds what an earlier one made, by name or by id', async () => {
  const { figma, snapshot } = createFigmaFake();
  const id = await runScript(
    "const frame = figma.createFrame();\nframe.name = 'kitvas · pricing';\nreturn frame.id;",
    figma,
  );
  assert.match(String(id), /^\d+:\d+$/);
  const found = await runScript(
    lines(
      "const byName = figma.currentPage.findOne((node) => node.name === 'kitvas · pricing');",
      `const byId = await figma.getNodeByIdAsync(${JSON.stringify(id)});`,
      'byId.remove();',
      `const gone = (await figma.getNodeByIdAsync(${JSON.stringify(id)})) === null;`,
      'return { same: byName === byId, gone };',
    ),
    figma,
  );
  assert.deepEqual(found, { same: true, gone: true });
  assert.equal(snapshot().nodes['kitvas · pricing'], undefined);
});
