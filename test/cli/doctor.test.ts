import assert from 'node:assert/strict';
import { join } from 'node:path';
import { test } from 'node:test';
import type { Browser } from '../../src/checks/index.ts';
import { createDoctorCommand, runCli } from '../../src/cli/index.ts';
import { createNodeMachine } from '../../src/doctor/adapters/node-machine.ts';
import type { CheckResult, Machine } from '../../src/doctor/index.ts';
import { createProjectFiles } from '../../src/kit/adapters/project-files.ts';
import { defaultDepRoots, PLUGIN_ROOT } from '../../src/shared/index.ts';
import { doctorLocalesDir } from '../doctor/locales.ts';
import { fakeLifecycle } from '../helpers/fake-lifecycle.ts';
import { tempDir } from '../helpers/tmp.ts';
import { layeredStore, tempProject } from '../kit/helpers/project-kit.ts';

const found: Browser['open'] = async () => ({
  name: 'chromium',
  visit: async () => {
    throw new Error('not used');
  },
  close: async () => undefined,
});

/** The real machine, except that the network is the same on every computer. */
function machine(): Machine {
  return {
    ...createNodeMachine({ roots: defaultDepRoots() }),
    openLoopback: async () => undefined,
    resolveHost: async () => ['127.0.0.1'],
  };
}

function harness(open: Browser['open'], workspace = true) {
  const cwd = tempProject({}, {}, workspace);
  const out: string[] = [];
  const err: string[] = [];
  const io = {
    out: (text: string) => out.push(text),
    err: (text: string) => err.push(text),
    cwd,
    home: tempDir(),
    localesDir: doctorLocalesDir(),
  };
  const dataDir = tempDir();
  const command = createDoctorCommand({
    kits: layeredStore(cwd, join(PLUGIN_ROOT, 'kits')),
    projectFiles: createProjectFiles,
    browser: () => ({ open }),
    browsersDir: join(dataDir, 'browsers'),
    lifecycle: () => fakeLifecycle().deps,
    dataDir,
    machine: machine(),
    now: () => new Date(),
  });
  const run = (...argv: string[]) => runCli(['doctor', ...argv], [command], io);
  const data = (): { checks: CheckResult[]; report?: string } =>
    (JSON.parse(out.at(-1) ?? '') as { data: { checks: CheckResult[]; report?: string } }).data;
  return { cwd, out, err, run, data };
}

const statuses = (checks: CheckResult[]) =>
  Object.fromEntries(checks.map((check) => [check.id, check.status]));

test('doctor --json answers every check; with none failing the exit code is 0', async () => {
  const h = harness(found);
  assert.equal(await h.run('--json'), 0);
  const answer = JSON.parse(h.out.at(-1) ?? '') as { ok: boolean };
  assert.equal(answer.ok, true);
  const checks = h.data().checks;
  assert.deepEqual(
    checks.map((check) => check.id),
    ['node', 'deps', 'plugin', 'workspace', 'kit', 'browser', 'data', 'ports', 'studio'],
  );
  assert.deepEqual(statuses(checks), {
    node: 'ok',
    deps: 'ok',
    plugin: 'ok',
    workspace: 'ok',
    kit: 'ok',
    browser: 'ok',
    data: 'ok',
    ports: 'ok',
    studio: 'ok',
  });
  assert.equal('report' in h.data(), false);
  assert.deepEqual(h.err, []);
});

test('a failing check gives the DOCTOR_FAILED exit code, and the answer is still printed', async () => {
  const h = harness(async () => {
    throw Object.assign(new Error('boom'), { code: 'ECONNRESET' });
  });
  assert.equal(await h.run('--json'), 60);
  assert.equal(statuses(h.data().checks).browser, 'fail');
  // JSON stays one answer on stdout.
  assert.deepEqual(h.err, []);

  const plain = harness(async () => {
    throw new Error('boom');
  });
  assert.equal(await plain.run(), 60);
  assert.match(plain.out.at(-1) ?? '', /doctor\.summary/);
  assert.match(plain.err.at(-1) ?? '', /checks failed/);
});

test('no workspace is a warning, and the checks that need one are skipped', async () => {
  const h = harness(found, false);
  assert.equal(await h.run('--json'), 0);
  const result = statuses(h.data().checks);
  assert.equal(result.workspace, 'warn');
  assert.equal(result.studio, 'skipped');
});

test('--report adds the text to paste, with the project folder written out', async () => {
  const h = harness(found);
  assert.equal(await h.run('--report', '--json'), 0);
  const report = h.data().report ?? '';
  assert.match(report, /doctor\.report\.title/);
  assert.equal(report.split('\n').length, 4 + 9);
  assert.equal(report.includes(h.cwd), false);

  assert.equal(await h.run('--report'), 0);
  assert.equal(h.out.at(-1), report);
});
