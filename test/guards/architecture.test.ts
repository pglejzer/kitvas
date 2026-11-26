import assert from 'node:assert/strict';
import { test } from 'node:test';
import { PLUGIN_ROOT } from '../../src/shared/env/paths.ts';
import {
  collectSources,
  figmaClientViolations,
  readImports,
  violations,
} from '../helpers/architecture.ts';

const file = (path: string, ...imports: string[]) => ({ path, imports });

test('the rules catch each kind of bad import', () => {
  const bad = violations([
    file('src/shared/a.ts', 'src/cli/run.ts'),
    file('src/kit/app/load.ts', 'src/cli/index.ts'),
    file('src/kit/app/load.ts', 'src/kit/adapters/builtin.ts'),
    file('src/render/app/build.ts', 'src/kit/domain/kit.ts'),
    file('src/kit/domain/kit.ts', 'src/kit/app/load.ts'),
    file('src/cli/run.ts', 'src/main.ts'),
  ]);
  // Tally per import: 3 + 1 + 2 + 2 + 1 + 1.
  assert.equal(bad.length, 10);
  assert.match(bad.join('\n'), /shared imports nothing outside shared/);
  assert.match(bad.join('\n'), /only main\.ts imports cli/);
  assert.match(bad.join('\n'), /only main\.ts imports adapters/);
  assert.match(bad.join('\n'), /through its index\.ts/);
  assert.match(bad.join('\n'), /domain imports only/);
  assert.match(bad.join('\n'), /nothing imports main\.ts/);
});

test('the rules accept the allowed shapes', () => {
  const good = violations([
    file('src/main.ts', 'src/cli/index.ts', 'src/kit/adapters/builtin.ts'),
    file('src/cli/run.ts', 'src/shared/index.ts', 'src/kit/index.ts'),
    file('src/kit/app/load.ts', 'src/kit/domain/kit.ts', 'src/kit/ports/source.ts'),
    file('src/kit/adapters/builtin.ts', 'src/kit/ports/source.ts', 'src/kit/adapters/read.ts'),
    file('src/render/app/build.ts', 'src/kit/index.ts', 'src/shared/errors/errors.ts'),
  ]);
  assert.deepEqual(good, []);
});

test("a domain file may take another module's types from its index.ts, never its code", () => {
  const types = {
    path: 'src/handoff/domain/figma/tree.ts',
    imports: ['src/checks/index.ts'],
    types: ['src/checks/index.ts'],
  };
  assert.deepEqual(violations([types]), []);
  // Code from the same index, or types from past the index, stay refused.
  const code = { ...types, types: [] };
  assert.match(violations([code]).join('\n'), /domain imports only its own domain and shared/);
  const deep = {
    path: types.path,
    imports: ['src/checks/domain/page/layers.ts'],
    types: ['src/checks/domain/page/layers.ts'],
  };
  assert.equal(violations([deep]).length, 2);
});

test('readImports tells a type-only import from one that brings code', () => {
  const path = 'src/handoff/domain/figma/tree.ts';
  const read = (text: string) => readImports(PLUGIN_ROOT, path, text);
  const typeOnly = read("import type { Box } from '../../../checks/index.ts';\n");
  assert.deepEqual(typeOnly.imports, ['src/checks/index.ts']);
  assert.deepEqual(typeOnly.types, ['src/checks/index.ts']);
  // `type` on one name only still loads the module.
  assert.deepEqual(read("import { type Box, walk } from '../../../checks/index.ts';\n").types, []);
  // A type import and a code import of the same file: the file brings code.
  const both = read(
    "import type { Box } from '../../../checks/index.ts';\nimport { walk } from '../../../checks/index.ts';\n",
  );
  assert.deepEqual(both.types, []);
  // The `type` of an earlier statement is not the import's own.
  const after = read(
    "export type Size = number;\nimport { walk } from '../../../checks/index.ts';\n",
  );
  assert.deepEqual(after.imports, ['src/checks/index.ts']);
  assert.deepEqual(after.types, []);
  // The word "import" in a comment starts no import: the type import under it stays type-only.
  const commented = read(
    "// each with the import that brings it in, and the rest\n// of the comment\nimport type { IdsFile } from '../../../render/index.ts';\n",
  );
  assert.deepEqual(commented.types, ['src/render/index.ts']);
  assert.deepEqual(read("// import { z } from 'zod';\n").packages, []);
  assert.deepEqual(read("export type * from './tree.ts';\n").types, [
    'src/handoff/domain/figma/tree.ts',
  ]);
  assert.deepEqual(read("import { join } from 'node:path';\nimport 'zod';\n").packages, [
    'node:path',
    'zod',
  ]);
  assert.deepEqual(read("import type { Zod } from 'zod';\n").packages, []);
});

test('client/figma imports only client/figma and no package', () => {
  const read = (path: string, text: string) => readImports(PLUGIN_ROOT, path, text);
  const good = [
    read('client/figma/builder.ts', "import type { FigmaApi } from './api.ts';\n"),
    read('client/figma/steps/frame.ts', "import { paint } from '../paint.ts';\n"),
  ];
  assert.deepEqual(figmaClientViolations(good), []);
  const bad = [
    read('client/figma/builder.ts', "import { t } from '../studio/texts.ts';\n"),
    read('client/figma/paint.ts', "import { join } from 'node:path';\n"),
  ];
  const found = figmaClientViolations(bad).join('\n');
  assert.match(found, /client\/studio\/texts\.ts: client\/figma imports only client\/figma/);
  assert.match(found, /node:path: client\/figma imports no package/);
});

test('the real source tree follows the rules', () => {
  assert.deepEqual(violations(collectSources(PLUGIN_ROOT)), []);
  assert.deepEqual(figmaClientViolations(collectSources(PLUGIN_ROOT, 'client/figma')), []);
});
