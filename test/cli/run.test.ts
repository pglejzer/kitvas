import assert from 'node:assert/strict';
import { existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { test } from 'node:test';
import { initCommand, runCli, statusCommand } from '../../src/cli/index.ts';
import { PLUGIN_ROOT } from '../../src/shared/index.ts';
import { tempDir } from '../helpers/tmp.ts';

function harness() {
  const out: string[] = [];
  const err: string[] = [];
  const io = {
    out: (text: string) => out.push(text),
    err: (text: string) => err.push(text),
    cwd: tempDir(),
    home: tempDir(),
    localesDir: join(PLUGIN_ROOT, 'locales'),
  };
  const run = (...argv: string[]) => runCli(argv, [statusCommand, initCommand], io);
  return { out, err, io, run };
}

test('status --json reports version, node, settings and a missing workspace', async () => {
  const h = harness();
  assert.equal(await h.run('status', '--json'), 0);
  const payload = JSON.parse(h.out[0] ?? '') as {
    ok: boolean;
    data: {
      version: string;
      node: string;
      language: string;
      kit: string;
      workspace: { path: string; exists: boolean };
    };
  };
  assert.equal(payload.ok, true);
  assert.equal(payload.data.version, '1.1.0');
  assert.equal(payload.data.node, process.version);
  assert.equal(payload.data.language, 'en');
  assert.equal(payload.data.kit, 'kitvas-ui');
  assert.deepEqual(payload.data.workspace, { path: join(h.io.cwd, '.kitvas'), exists: false });
});

test('status in words tells the user to run init', async () => {
  const h = harness();
  await h.run('status');
  assert.match(h.out[0] ?? '', /kitvas 1\.1\.0/);
  assert.match(h.out[0] ?? '', /run "kitvas init"/);
});

test('init creates the workspace once', async () => {
  const h = harness();
  assert.equal(await h.run('init', '--json'), 0);
  assert.equal((JSON.parse(h.out[0] ?? '') as { data: { created: boolean } }).data.created, true);
  assert.ok(existsSync(join(h.io.cwd, '.kitvas', 'decisions.md')));
  await h.run('init');
  assert.match(h.out[1] ?? '', /already exists/);
});

test('an unknown command is a usage error with exit code 2', async () => {
  const h = harness();
  assert.equal(await h.run('nope', '--json'), 2);
  const payload = JSON.parse(h.err[0] ?? '') as { ok: boolean; error: { code: string } };
  assert.deepEqual(payload.ok, false);
  assert.equal(payload.error.code, 'USAGE');
});

test('an unknown flag is a usage error', async () => {
  const h = harness();
  assert.equal(await h.run('status', '--bogus'), 2);
  assert.match(h.err[0] ?? '', /Usage error/);
});

test('no command prints usage and exits 2; --help exits 0', async () => {
  const h = harness();
  assert.equal(await h.run(), 2);
  assert.match(h.out[0] ?? '', /Usage: kitvas/);
  assert.match(h.out[0] ?? '', /status/);
  assert.equal(await h.run('--help'), 0);
});

test('broken settings give CONFIG_INVALID and exit code 3', async () => {
  const h = harness();
  mkdirSync(join(h.io.home, '.kitvas'), { recursive: true });
  writeFileSync(join(h.io.home, '.kitvas', 'config.json'), '{"schemaVersion":1,"extra":true}');
  assert.equal(await h.run('status', '--json'), 3);
  assert.equal(
    (JSON.parse(h.err[0] ?? '') as { error: { code: string } }).error.code,
    'CONFIG_INVALID',
  );
});
