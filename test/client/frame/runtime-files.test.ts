import assert from 'node:assert/strict';
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { test } from 'node:test';
import { PLUGIN_ROOT } from '../../../src/shared/env/paths.ts';

test('every file of the frame runtime is in the build key, so a change rebuilds drafts', () => {
  const main = readFileSync(join(PLUGIN_ROOT, 'src', 'main.ts'), 'utf8');
  const missing: string[] = [];
  for (const folder of ['frame', 'channel']) {
    for (const name of readdirSync(join(PLUGIN_ROOT, 'client', folder))) {
      const file = `${folder}/${name}`;
      if (name.endsWith('.ts') && !main.includes(`'${file}'`)) missing.push(file);
    }
  }
  assert.deepEqual(missing, []);
});
