import assert from 'node:assert/strict';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { test } from 'node:test';
import { forceKill, isAlive, spawnServer } from '../../../src/studio/run/processes.ts';
import { tempDir } from '../../helpers/tmp.ts';
import { until } from '../../helpers/wait.ts';

test('a detached process writes into its log, is found alive and can be ended', async () => {
  const dir = tempDir();
  const bin = join(dir, 'fake-bin.mjs');
  writeFileSync(
    bin,
    "process.stdout.write(process.argv.slice(2).join(' '));\nsetTimeout(() => {}, 30000);\n",
  );
  const log = join(dir, 'logs', 'studio.log');
  const pid = spawnServer({ bin, project: dir, log, env: process.env });
  try {
    await until(() => existsSync(log) && readFileSync(log, 'utf8') === 'studio serve');
    assert.equal(isAlive(pid), true);
  } finally {
    forceKill(pid);
  }
  await until(() => !isAlive(pid));
  assert.equal(isAlive(pid), false);
});

test('a pid nobody has is not alive, and ending it does nothing', () => {
  assert.equal(isAlive(2_000_000_000), false);
  assert.doesNotThrow(() => forceKill(2_000_000_000));
});
