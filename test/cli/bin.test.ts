import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { test } from 'node:test';
import { PLUGIN_ROOT } from '../../src/shared/env/paths.ts';
import { tempDir } from '../helpers/tmp.ts';

function run(script: string, args: string[], cwd: string, home: string) {
  return spawnSync(process.execPath, [join(PLUGIN_ROOT, script), ...args], {
    cwd,
    encoding: 'utf8',
    env: { ...process.env, HOME: home, USERPROFILE: home },
  });
}

test('the real entry point answers status --json', () => {
  const result = run('bin/kitvas.ts', ['status', '--json'], tempDir(), tempDir());
  assert.equal(result.status, 0, result.stderr);
  assert.equal((JSON.parse(result.stdout) as { data: { kit: string } }).data.kit, 'base');
});

test('the entry point passes exit codes through', () => {
  const result = run('bin/kitvas.ts', ['nope'], tempDir(), tempDir());
  assert.equal(result.status, 2);
});

test('the hook script exits 0 and says nothing when dependencies are present', () => {
  const result = run('scripts/ensure-deps.ts', ['--data', tempDir()], tempDir(), tempDir());
  assert.equal(result.status, 0, result.stderr);
  assert.equal(result.stdout, '');
});

test('the hook takes the data folder Claude Code gives it, with no argument', () => {
  const data = tempDir();
  const home = tempDir();
  const result = spawnSync(process.execPath, [join(PLUGIN_ROOT, 'scripts/ensure-deps.ts')], {
    cwd: tempDir(),
    encoding: 'utf8',
    env: {
      ...process.env,
      HOME: home,
      USERPROFILE: home,
      CLAUDE_PLUGIN_ROOT: PLUGIN_ROOT,
      CLAUDE_PLUGIN_DATA: data,
    },
  });
  assert.equal(result.status, 0, result.stderr);
  assert.equal(result.stdout, '');
  assert.equal(readFileSync(join(home, '.kitvas', 'data-dir'), 'utf8').trim(), data);
});

test('the hook never names a variable but CLAUDE_PLUGIN_ROOT, as the plugin directory asks', () => {
  const hooks = readFileSync(join(PLUGIN_ROOT, 'hooks', 'hooks.json'), 'utf8');
  const named = [...hooks.matchAll(/\$\{([A-Z_]+)\}/g)].map((match) => match[1]);
  assert.ok(named.length > 0);
  assert.deepEqual([...new Set(named)], ['CLAUDE_PLUGIN_ROOT']);
});

test('a CLAUDE_PLUGIN_DATA left in the shell by another plugin is never used', () => {
  const foreign = tempDir();
  const home = tempDir();
  for (const script of ['bin/kitvas.ts', 'scripts/ensure-deps.ts']) {
    const args = script.startsWith('bin') ? ['status', '--json'] : [];
    const result = spawnSync(process.execPath, [join(PLUGIN_ROOT, script), ...args], {
      cwd: tempDir(),
      encoding: 'utf8',
      env: { ...process.env, HOME: home, USERPROFILE: home, CLAUDE_PLUGIN_DATA: foreign },
    });
    assert.equal(result.status, 0, result.stderr);
  }
  assert.deepEqual(readdirSync(foreign), []);
  const pointer = readFileSync(join(home, '.kitvas', 'data-dir'), 'utf8').trim();
  assert.equal(pointer, join(home, '.kitvas', 'data'));
});
