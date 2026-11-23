import assert from 'node:assert/strict';
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { test } from 'node:test';
import { initCommand, runCli } from '../../src/cli/index.ts';
import { PLUGIN_ROOT } from '../../src/shared/index.ts';
import { tempDir } from '../helpers/tmp.ts';

function harness(cwd: string) {
  const out: string[] = [];
  const err: string[] = [];
  const io = {
    out: (text: string) => out.push(text),
    err: (text: string) => err.push(text),
    cwd,
    home: tempDir(),
    localesDir: join(PLUGIN_ROOT, 'locales'),
  };
  return { out, err, run: (...argv: string[]) => runCli(argv, [initCommand], io) };
}

test('init refuses in the plugin folder', async () => {
  const h = harness(PLUGIN_ROOT);
  assert.equal(await h.run('init', '--json'), 39);
  const text = h.out[0] ?? h.err[0] ?? '';
  const payload = JSON.parse(text) as { ok: boolean; error: { code: string } };
  assert.equal(payload.ok, false);
  assert.equal(payload.error.code, 'PLUGIN_FOLDER');
});

test('init refuses inside the plugin folder', async () => {
  const h = harness(join(PLUGIN_ROOT, 'src'));
  assert.equal(await h.run('init', '--json'), 39);
  assert.equal(existsSync(join(PLUGIN_ROOT, 'src', '.kitvas')), false);
});

test('init works in a project folder', async () => {
  const cwd = tempDir();
  const h = harness(cwd);
  assert.equal(await h.run('init', '--json'), 0);
  assert.equal(existsSync(join(cwd, '.kitvas')), true);
});
