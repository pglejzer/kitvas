import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join, posix } from 'node:path';
import { test } from 'node:test';
import { PLUGIN_ROOT } from '../../src/shared/env/paths.ts';
import { listFiles } from '../helpers/architecture.ts';

const LIMITS = [
  { dirs: ['src', 'bin', 'scripts', 'kits', 'client'], max: 500 },
  { dirs: ['test'], max: 800 },
];
const CODE = /\.(ts|tsx|js|mjs)$/;
/** The code files one folder may hold directly, before it is split by responsibility. */
const FOLDER_MAX = 20;

const codeFiles = (dir: string): string[] =>
  listFiles(PLUGIN_ROOT, dir).filter((file) => CODE.test(file));

test('code files have at most 500 lines and test files at most 800', () => {
  const long: string[] = [];
  for (const { dirs, max } of LIMITS) {
    for (const dir of dirs) {
      for (const path of codeFiles(dir)) {
        const lines = readFileSync(join(PLUGIN_ROOT, path), 'utf8').split('\n').length;
        if (lines > max) long.push(`${path}: ${lines} lines (limit ${max})`);
      }
    }
  }
  assert.deepEqual(long, []);
});

test('a folder holds at most 20 code files directly', () => {
  const counts = new Map<string, number>();
  for (const dir of LIMITS.flatMap((limit) => limit.dirs)) {
    for (const path of codeFiles(dir)) {
      const folder = posix.dirname(path);
      counts.set(folder, (counts.get(folder) ?? 0) + 1);
    }
  }
  const full = [...counts]
    .filter(([, count]) => count > FOLDER_MAX)
    .map(([folder, count]) => `${folder}: ${count} code files (limit ${FOLDER_MAX})`);
  assert.deepEqual(full, []);
});
