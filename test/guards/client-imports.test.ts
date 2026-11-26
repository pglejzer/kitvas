// ADR 0080: the client imports values from `src/` only where the whole graph of value imports
// under them is package-free (no package, no `node:` built-in, no module's `index.ts`). A
// type-only import is erased, so it may name any file; `client/figma/` keeps its own rule.

import assert from 'node:assert/strict';
import { test } from 'node:test';
import { PLUGIN_ROOT } from '../../src/shared/env/paths.ts';
import {
  clientImportViolations,
  collectSources,
  readImports,
  valueReach,
} from '../helpers/architecture.ts';

const read = (path: string, text: string) => readImports(PLUGIN_ROOT, path, text);

/** A pure chain with a cycle in it, a type-only package and a type-only module index. */
const PURE = [
  read('src/edit/domain/pure.ts', "import { leaf } from './leaf.ts';\n"),
  read(
    'src/edit/domain/leaf.ts',
    "import type { Zod } from 'zod';\nimport type { Kit } from '../../kit/index.ts';\nimport { pure } from './pure.ts';\n",
  ),
];

test('a client file may take values from package-free src files and types from anywhere', () => {
  const good = [
    ...PURE,
    read('client/studio/a.ts', "import { pure } from '../../src/edit/domain/pure.ts';\n"),
    read('client/frame/b.ts', "import type { EditOp } from '../../src/edit/index.ts';\n"),
    read('client/studio/c.ts', "import { a } from './a.ts';\n"),
    // The Figma builder has its own rule (`figmaClientViolations`).
    read('client/figma/builder.ts', "import { z } from '../../src/shared/index.ts';\n"),
  ];
  assert.deepEqual(clientImportViolations(good), []);
  assert.deepEqual(valueReach(good, ['client/studio/a.ts']), [
    'src/edit/domain/leaf.ts',
    'src/edit/domain/pure.ts',
  ]);
});

test('a value import that reaches a package, a built-in or a module index is refused', () => {
  const bad = [
    ...PURE,
    // `type` on one name only still loads the module, and ops.ts loads zod through shared.
    read('src/edit/domain/ops.ts', "import { type Zod, z } from '../../shared/index.ts';\n"),
    read('src/shared/env/paths.ts', "import { join } from 'node:path';\n"),
    read('client/studio/d.ts', "import { MAX_OPS } from '../../src/edit/domain/ops.ts';\n"),
    read('client/frame/e.ts', "import { PLUGIN_ROOT } from '../../src/shared/env/paths.ts';\n"),
    read('client/channel/f.ts', "import { STYLE_PROPERTIES } from '../../src/edit/index.ts';\n"),
    read('client/studio/g.ts', "import { gone } from '../../src/edit/domain/gone.ts';\n"),
  ];
  const found = clientImportViolations(bad);
  assert.equal(found.length, 4, found.join('\n'));
  const all = found.join('\n');
  assert.match(
    all,
    /client\/studio\/d\.ts -> src\/edit\/domain\/ops\.ts -> src\/shared\/index\.ts: src\/shared\/index\.ts is the index\.ts of a module/,
  );
  assert.match(
    all,
    /client\/frame\/e\.ts -> src\/shared\/env\/paths\.ts: src\/shared\/env\/paths\.ts imports node:path/,
  );
  assert.match(all, /client\/channel\/f\.ts -> src\/edit\/index\.ts: src\/edit\/index\.ts is the/);
  assert.match(all, /src\/edit\/domain\/gone\.ts is no \.ts file the guard reads/);
  assert.match(all, /package-free src files \(ADR 0080\)/);
});

test('the real client imports values only from package-free src files', () => {
  const files = [...collectSources(PLUGIN_ROOT, 'client'), ...collectSources(PLUGIN_ROOT, 'src')];
  assert.deepEqual(clientImportViolations(files), []);
});
