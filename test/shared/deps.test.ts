import assert from 'node:assert/strict';
import { join } from 'node:path';
import { test } from 'node:test';
import { loadDep, resolveDep } from '../../src/shared/deps/deps.ts';
import { PLUGIN_ROOT } from '../../src/shared/env/paths.ts';
import { KitvasError } from '../../src/shared/errors/errors.ts';
import { tempDir } from '../helpers/tmp.ts';

test('loads a package from the first root that has it', async () => {
  const zod = await loadDep<{ z: { string(): unknown } }>('zod', [tempDir(), PLUGIN_ROOT]);
  assert.equal(typeof zod.z.string, 'function');
});

test('throws DEPS_MISSING when no root has the package', async () => {
  await assert.rejects(
    () => loadDep('zod', [tempDir()]),
    (error: unknown) => error instanceof KitvasError && error.code === 'DEPS_MISSING',
  );
});

test('resolveDep gives the file of a package and fails like loadDep', () => {
  const file = resolveDep('react/package.json', [tempDir(), PLUGIN_ROOT]);
  assert.ok(file.endsWith(join('react', 'package.json')), file);
  assert.throws(
    () => resolveDep('react/package.json', [tempDir()]),
    (error: unknown) => error instanceof KitvasError && error.code === 'DEPS_MISSING',
  );
});
