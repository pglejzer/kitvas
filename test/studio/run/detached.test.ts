import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { join } from 'node:path';
import { test } from 'node:test';
import { PLUGIN_ROOT } from '../../../src/shared/index.ts';
import { forceKill, isAlive } from '../../../src/studio/run/processes.ts';
import { call } from '../../helpers/studio.ts';
import { tempDir } from '../../helpers/tmp.ts';
import { until } from '../../helpers/wait.ts';

const BIN = join(PLUGIN_ROOT, 'bin', 'kitvas.ts');

test('kitvas studio starts a detached server, reuses it and stops it', async () => {
  const project = tempDir();
  const home = tempDir();
  const env = { ...process.env, HOME: home, USERPROFILE: home, KITVAS_DATA_DIR: tempDir() };
  const kitvas = (...args: string[]) => {
    const result = spawnSync(process.execPath, [BIN, ...args, '--json'], {
      cwd: project,
      encoding: 'utf8',
      env,
      timeout: 60_000,
    });
    assert.equal(result.status, 0, `${args.join(' ')}: ${result.stderr}`);
    return (JSON.parse(result.stdout) as { data: unknown }).data;
  };
  kitvas('init');
  const started = kitvas('studio') as {
    started: boolean;
    port: number;
    pid: number;
    openUrl: string;
  };
  try {
    assert.equal(started.started, true);
    assert.equal(isAlive(started.pid), true);
    assert.equal((await call(started.port, { path: '/' })).status, 401);
    const link = new URL(started.openUrl);
    const opened = await call(started.port, { path: `${link.pathname}${link.search}` });
    assert.equal(opened.status, 303);
    const cookie = String(opened.headers['set-cookie']).split(';')[0] ?? '';
    assert.equal((await call(started.port, { path: '/', headers: { cookie } })).status, 200);
    const again = kitvas('studio') as { started: boolean; pid: number };
    assert.equal(again.started, false);
    assert.equal(again.pid, started.pid);
    assert.equal((kitvas('studio', 'status') as { running: boolean }).running, true);
    assert.equal((kitvas('studio', 'stop') as { stopped: boolean }).stopped, true);
    await until(() => !isAlive(started.pid));
    assert.equal((kitvas('studio', 'status') as { running: boolean }).running, false);
  } finally {
    if (isAlive(started.pid)) forceKill(started.pid);
  }
});
