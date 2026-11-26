import assert from 'node:assert/strict';
import { test } from 'node:test';
import { mountSource } from '../../src/render/domain/mount.ts';
import { pageHtml } from '../../src/render/domain/page.ts';
import { buildFiles } from '../../src/render/domain/report.ts';

test('the entry hands the frame runtime the states, its stamp and a way to mount the draft', () => {
  assert.equal(
    mountSource({
      providers: [],
      states: ['filled', 'empty'],
      defaultState: 'filled',
      options: [],
      runtime: 'abc123',
    }),
    [
      "import { flushSync } from 'react-dom';",
      "import { createRoot } from 'react-dom/client';",
      "import { startFrame } from 'kitvas-frame';",
      "import { Draft } from '@draft';",
      "import * as Kit from '@kit';",
      '',
      '(globalThis as { __KITVAS_KIT__?: unknown }).__KITVAS_KIT__ = Kit;',
      'const STATES: string[] = ["filled","empty"];',
      'const OPTIONS = [];',
      'const RUNTIME = "abc123";',
      "const asked = new URLSearchParams(window.location.search).get('state');",
      'const state = asked !== null && STATES.includes(asked) ? asked : "filled";',
      "const element = document.getElementById('root');",
      'if (element) {',
      '  const mount = () => {',
      '    const root = createRoot(element);',
      '    return {',
      '      render(shown: string): void {',
      '        document.documentElement.dataset.state = shown;',
      '        flushSync(() => root.render(<Draft state={shown} />));',
      '      },',
      '      unmount(): void {',
      '        root.unmount();',
      '      },',
      '    };',
      '  };',
      '  startFrame({ states: STATES, options: OPTIONS, initial: state, mount, runtime: RUNTIME });',
      '}',
      '',
    ].join('\n'),
  );
});

test('options go to the runtime as data and to the draft as the choice it is rendered with', () => {
  const source = mountSource({
    providers: [],
    states: ['filled'],
    defaultState: 'filled',
    options: [
      {
        id: 'columns',
        label: 'Columns "x"',
        default: '3',
        values: [
          { id: '3', label: 'Three' },
          { id: '2', label: 'Two' },
        ],
      },
    ],
    runtime: 'r',
  });
  assert.ok(source.includes('const OPTIONS = [{"id":"columns","label":"Columns \\"x\\"",'));
  assert.ok(source.includes('render(shown: string, choice: Record<string, string>): void {'));
  assert.ok(source.includes('root.render(<Draft state={shown} options={choice} />)'));
  assert.ok(source.includes('startFrame({ states: STATES, options: OPTIONS,'));
  // No second parser of the address: the runtime reads `opt-*` and sets the attributes.
  assert.ok(!source.includes('opt-'));
  assert.ok(!source.includes('data-opt'));
});

test('the entry makes no root itself: only `mount` does, when the runtime calls it', () => {
  const source = mountSource({
    providers: [],
    states: ['a'],
    defaultState: 'a',
    options: [],
    runtime: 'r',
  });
  const body = source.slice(source.indexOf('if (element) {'));
  assert.equal(body.match(/createRoot\(/g)?.length, 1);
  assert.ok(body.indexOf('const mount = () => {') < body.indexOf('createRoot('));
  assert.ok(!/^ {2}(mount\(\)|const root)/m.test(body), 'nothing is mounted by the entry');
});

test('the stamp of the runtime is written as a string, whatever it holds', () => {
  const source = mountSource({
    providers: [],
    states: ['a'],
    defaultState: 'a',
    options: [],
    runtime: '"x',
  });
  assert.ok(source.includes('const RUNTIME = "\\"x";'));
});

test('the providers of the kit wrap the draft, the first outermost', () => {
  const source = mountSource({
    providers: [
      { from: '@kit', name: 'Theme', isDefault: false, props: { mode: 'light' } },
      { from: 'some-lib', name: undefined, isDefault: true, props: {} },
    ],
    states: ['filled'],
    defaultState: 'filled',
    options: [],
    runtime: 'abc123',
  });
  assert.match(source, /^import \{ Theme as Provider0 \} from "@kit";$/m);
  assert.match(source, /^import Provider1 from "some-lib";$/m);
  assert.ok(
    source.includes(
      'root.render(<Provider0 mode={"light"}><Provider1><Draft state={shown} /></Provider1></Provider0>)',
    ),
  );
});

test('a provider bound to a theme export gets it as a prop, its import after the kit', () => {
  const source = mountSource({
    providers: [
      {
        from: '@acme/ui',
        name: 'AcmeProvider',
        isDefault: false,
        props: {},
        bindings: [{ prop: 'theme', from: '/work/app/src/theme', name: 'theme' }],
      },
    ],
    states: ['filled'],
    defaultState: 'filled',
    options: [],
    runtime: 'abc123',
  });
  assert.ok(
    source.includes(
      [
        "import * as Kit from '@kit';",
        'import { AcmeProvider as Provider0 } from "@acme/ui";',
        'import { theme as Binding0_0 } from "/work/app/src/theme";',
        '',
      ].join('\n'),
    ),
  );
  assert.ok(
    source.includes(
      'root.render(<Provider0 theme={Binding0_0}><Draft state={shown} /></Provider0>)',
    ),
  );
});

test('the page links the sheet and the script and escapes the title', () => {
  const html = pageHtml({ title: 'Bikes & <more>' });
  assert.match(html, /^<!doctype html>\n<html lang="en">\n/);
  assert.ok(html.includes('<title>Bikes &amp; &lt;more&gt;</title>'));
  assert.ok(html.includes('<link rel="stylesheet" href="../css/index.css">'));
  assert.ok(html.includes('<div id="root"></div>\n<script src="../js/index.js"></script>'));
});

test('output paths sit in folders by file type', () => {
  assert.deepEqual(buildFiles('v2'), {
    html: 'v2/build/html/index.html',
    js: 'v2/build/js/index.js',
    css: 'v2/build/css/index.css',
    ids: 'v2/build/json/ids.json',
  });
});
