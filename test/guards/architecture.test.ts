import assert from 'node:assert/strict';
import { test } from 'node:test';
import { PLUGIN_ROOT } from '../../src/shared/env/paths.ts';
import { collectSources, violations } from '../helpers/architecture.ts';

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

test('the real source tree follows the rules', () => {
  assert.deepEqual(violations(collectSources(PLUGIN_ROOT)), []);
});
