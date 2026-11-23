import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  CATALOG_BODY_RULE,
  catalogCss,
  catalogMountSource,
  exampleFunction,
  examplesSource,
} from '../../src/render/domain/catalog-mount.ts';

const EXAMPLES = [
  { key: 'Button.1', code: '<Button>Save</Button>' },
  { key: 'Icon.1', code: '<Icon name="check" />' },
];

test('the entry imports the runtime and the kit, then every example, then starts', () => {
  const source = catalogMountSource({
    providers: [],
    components: ['Button', 'Icon'],
    examples: EXAMPLES,
  });
  const order = [
    "import { flushSync } from 'react-dom';",
    "import { createRoot } from 'react-dom/client';",
    "import { startExample } from 'kitvas-example';",
    "import * as Kit from '@kit';",
    'const { Button, Icon } = Kit as Record<string, unknown>;',
    'function KitvasExample0() {',
    'function KitvasExample1() {',
    'class KitvasBoundary',
    'startExample({ keys: ["Button.1","Icon.1"], render });',
  ].map((line) => source.indexOf(line));
  assert.ok(
    order.every((at) => at >= 0),
    String(order),
  );
  assert.deepEqual(
    order,
    [...order].sort((a, b) => a - b),
  );
  assert.ok(
    source.includes(
      'const EXAMPLES: [string, () => unknown][] = [["Button.1", KitvasExample0], ["Icon.1", KitvasExample1]];',
    ),
  );
});

test('example code is inserted as JSX text inside a fragment', () => {
  const source = catalogMountSource({
    providers: [],
    components: ['Button'],
    examples: [EXAMPLES[0] ?? { key: '', code: '' }],
  });
  assert.ok(
    source.includes('function KitvasExample0() {\n  return (<>\n<Button>Save</Button>\n</>);\n}'),
  );
  assert.equal(exampleFunction('X', '<a />'), 'function X() {\n  return (<>\n<a />\n</>);\n}');
});

test('the examples alone are the functions the entry holds, for class names', () => {
  assert.equal(
    examplesSource(EXAMPLES),
    'function KitvasExample0() {\n  return (<>\n<Button>Save</Button>\n</>);\n}\n\n' +
      'function KitvasExample1() {\n  return (<>\n<Icon name="check" />\n</>);\n}\n',
  );
  assert.equal(examplesSource([]), '\n');
});

test('a failure inside an example is caught and reported as not shown', () => {
  const source = catalogMountSource({ providers: [], components: [], examples: EXAMPLES });
  assert.ok(source.includes('componentDidCatch() {\n    failed = true;'));
  assert.ok(
    source.includes(
      'flushSync(() => root.render(<KitvasBoundary><KitvasShown /></KitvasBoundary>));',
    ),
  );
  assert.ok(source.includes('  return !failed;'));
  assert.ok(source.includes('if (!root || !entry) return false;'));
});

test('no components and no examples still gives a valid entry without a destructuring', () => {
  const source = catalogMountSource({ providers: [], components: [], examples: [] });
  assert.ok(!source.includes('Kit as Record'));
  assert.ok(source.includes('const EXAMPLES: [string, () => unknown][] = [];'));
  assert.ok(source.includes('startExample({ keys: [], render });'));
});

test('the providers wrap the boundary, the first outermost', () => {
  const source = catalogMountSource({
    providers: [
      { from: '@kit', name: 'Theme', isDefault: false, props: { mode: 'light' } },
      { from: 'some-lib', name: undefined, isDefault: true, props: {} },
    ],
    components: ['Button'],
    examples: [EXAMPLES[0] ?? { key: '', code: '' }],
  });
  assert.match(source, /^import \{ Theme as Provider0 \} from "@kit";$/m);
  assert.match(source, /^import Provider1 from "some-lib";$/m);
  assert.ok(
    source.includes(
      'root.render(<Provider0 mode={"light"}><Provider1><KitvasBoundary><KitvasShown /></KitvasBoundary></Provider1></Provider0>)',
    ),
  );
});

test('the sheet is tokens, kit styles, then the page rule', () => {
  assert.equal(catalogCss(':root {}\n', '.a {}\n'), `:root {}\n\n.a {}\n\n${CATALOG_BODY_RULE}`);
  assert.ok(CATALOG_BODY_RULE.startsWith('body {\n  margin: 0;\n  padding: 16px;\n}\n'));
  // A modal dialog starts at the top at full height, so the frame can grow to fit it.
  assert.match(
    CATALOG_BODY_RULE,
    /dialog:modal \{[^}]*inset-block-end: auto;[^}]*max-height: none;/,
  );
});
