import assert from 'node:assert/strict';
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { test } from 'node:test';
import type { Browser } from '../../src/checks/index.ts';
import {
  createDoctorCommand,
  type DoctorCommandDeps,
  doctorReport,
  runCli,
  statusCommand,
} from '../../src/cli/index.ts';
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
  const deps: DoctorCommandDeps = {
    kits: layeredStore(cwd, join(PLUGIN_ROOT, 'kits')),
    projectFiles: createProjectFiles,
    browser: () => ({ open }),
    browsersDir: join(dataDir, 'browsers'),
    lifecycle: () => fakeLifecycle().deps,
    dataDir,
    machine: machine(),
    now: () => new Date(),
  };
  const command = createDoctorCommand(deps);
  const run = (...argv: string[]) => runCli(['doctor', ...argv], [command], io);
  const data = (): { checks: CheckResult[]; report?: string } =>
    (JSON.parse(out.at(-1) ?? '') as { data: { checks: CheckResult[]; report?: string } }).data;
  return { cwd, out, err, run, data, deps, io };
}

const IDS = [
  'node',
  'deps',
  'plugin',
  'workspace',
  'kit',
  'decisions',
  'browser',
  'data',
  'ports',
  'studio',
];

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
    IDS,
  );
  assert.deepEqual(statuses(checks), {
    node: 'ok',
    deps: 'ok',
    plugin: 'ok',
    workspace: 'ok',
    kit: 'ok',
    decisions: 'ok',
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
  assert.equal(result.decisions, 'skipped');
  assert.equal(result.studio, 'skipped');
});

test('a config file that does not parse is reported by the workspace check, not a stop', async () => {
  const h = harness(found);
  mkdirSync(join(h.io.home, '.kitvas'), { recursive: true });
  writeFileSync(join(h.io.home, '.kitvas', 'config.json'), '{"schemaVersion":1,"extra":true}');
  // The report is printed and the exit code says a check failed, not that the config is invalid.
  assert.equal(await h.run('--json'), 60);
  const result = statuses(h.data().checks);
  assert.equal(result.workspace, 'fail');
  assert.equal(result.kit, 'skipped');
  assert.equal(result.decisions, 'skipped');
  assert.deepEqual(h.err, []);

  // Any other command still ends with CONFIG_INVALID.
  const other = await runCli(['status', '--json'], [statusCommand], {
    out: () => undefined,
    err: (text: string) => h.err.push(text),
    cwd: h.cwd,
    home: h.io.home,
    localesDir: join(PLUGIN_ROOT, 'locales'),
  });
  assert.equal(other, 3);
});

test('a kit the decisions file names that does not exist is a warning, with base loaded', async () => {
  const h = harness(found);
  writeFileSync(join(h.cwd, '.kitvas', 'decisions.md'), '---\nkit: gone\n---\n');
  assert.equal(await h.run('--json'), 0);
  const checks = h.data().checks;
  const result = statuses(checks);
  assert.equal(result.decisions, 'warn');
  assert.equal(result.kit, 'ok');
  const decisions = checks.find((check) => check.id === 'decisions');
  assert.match(decisions?.detail ?? '', /doctor\.decisions\.found/);
  assert.match(decisions?.fix ?? '', /decisions\.fixKit/);
});

test('a decisions file with a bad line is a warning, a clean one passes', async () => {
  const h = harness(found);
  writeFileSync(join(h.cwd, '.kitvas', 'decisions.md'), '---\ncheck: sometimes\n---\n');
  assert.equal(await h.run('--json'), 0);
  const checks = h.data().checks;
  const decisions = checks.find((check) => check.id === 'decisions');
  assert.equal(decisions?.status, 'warn');
  assert.match(decisions?.fix ?? '', /decisions\.fix$/);
  writeFileSync(join(h.cwd, '.kitvas', 'decisions.md'), '---\ncheck: deep\n---\n');
  assert.equal(await h.run('--json'), 0);
  assert.equal(statuses(h.data().checks).decisions, 'ok');
});

test('--report adds the text to paste, with the project folder written out', async () => {
  const h = harness(found);
  assert.equal(await h.run('--report', '--json'), 0);
  const report = h.data().report ?? '';
  assert.match(report, /doctor\.report\.title/);
  assert.equal(report.split('\n').length, 4 + IDS.length);
  assert.equal(report.includes(h.cwd), false);

  assert.equal(await h.run('--report'), 0);
  assert.equal(h.out.at(-1), report);
});

test('doctorReport answers the checks and the report the command prints, for the studio', async () => {
  const h = harness(found);
  const t = (key: string): string => key;
  const answer = await doctorReport(h.deps, { cwd: h.cwd, home: h.io.home, t });
  assert.deepEqual(
    answer.checks.map((check) => check.id),
    IDS,
  );
  assert.match(answer.report, /doctor\.report\.title/);
  assert.equal(answer.report.includes(h.cwd), false);
});
