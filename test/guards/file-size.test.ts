import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { test } from 'node:test';
import { PLUGIN_ROOT } from '../../src/shared/env/paths.ts';
import { listFiles } from '../helpers/architecture.ts';

const LIMITS = [
  { dirs: ['src', 'bin', 'scripts', 'kits', 'client'], max: 500 },
  { dirs: ['test'], max: 800 },
];
const CODE = /\.(ts|tsx|js|mjs)$/;

test('code files have at most 500 lines and test files at most 800', () => {
  const long: string[] = [];
  for (const { dirs, max } of LIMITS) {
    for (const dir of dirs) {
      for (const path of listFiles(PLUGIN_ROOT, dir).filter((file) => CODE.test(file))) {
        const lines = readFileSync(join(PLUGIN_ROOT, path), 'utf8').split('\n').length;
        if (lines > max) long.push(`${path}: ${lines} lines (limit ${max})`);
      }
    }
  }
  assert.deepEqual(long, []);
});
