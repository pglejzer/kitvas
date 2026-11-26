import assert from 'node:assert/strict';
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { test } from 'node:test';
import { PLUGIN_ROOT } from '../../../src/shared/env/paths.ts';
import { collectSources, valueReach } from '../../helpers/architecture.ts';

test('every file of the frame runtime is in the build key, so a change rebuilds drafts', () => {
  const main = readFileSync(join(PLUGIN_ROOT, 'src', 'main.ts'), 'utf8');
  const missing: string[] = [];
  for (const folder of ['frame', 'channel']) {
    // Every folder below, too: the frame runtime is split by responsibility.
    const names = readdirSync(join(PLUGIN_ROOT, 'client', folder), { recursive: true });
    for (const name of names.map((one) => String(one).replaceAll('\\', '/'))) {
      const file = `${folder}/${name}`;
      if (name.endsWith('.ts') && !main.includes(`'${file}'`)) missing.push(file);
    }
  }
  assert.deepEqual(missing, []);
});

test('every src file the frame takes values from is in the build key too (ADR 0080)', () => {
  const main = readFileSync(join(PLUGIN_ROOT, 'src', 'main.ts'), 'utf8');
  const files = [...collectSources(PLUGIN_ROOT, 'client'), ...collectSources(PLUGIN_ROOT, 'src')];
  const starts = files
    .map((file) => file.path)
    .filter((path) => /^client\/(?:frame|channel|jsx)\//.test(path));
  // Listed by the path from the root, or under `src/` as the client files are under `client/`.
  const listed = (path: string): boolean =>
    main.includes(`'${path}'`) || main.includes(`'${path.slice('src/'.length)}'`);
  assert.deepEqual(
    valueReach(files, starts).filter((path) => !listed(path)),
    [],
  );
});
