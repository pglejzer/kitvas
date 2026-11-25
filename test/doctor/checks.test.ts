import assert from 'node:assert/strict';
import { join } from 'node:path';
import { test } from 'node:test';
import { checkData, probeFolder } from '../../src/doctor/app/checks/data.ts';
import {
  checkBrowser,
  checkDecisions,
  checkKit,
  checkWorkspace,
} from '../../src/doctor/app/checks/project.ts';
import { checkDeps, checkNode, checkPlugin } from '../../src/doctor/app/checks/runtime.ts';
import { checkPorts, checkStudio } from '../../src/doctor/app/checks/studio.ts';
import { CHECK_IDS, runDoctor } from '../../src/doctor/index.ts';
import { KitvasError } from '../../src/shared/index.ts';
import { DATA, fakeMachine, healthy, PLUGIN, SETTINGS } from './fakes.ts';

test('node: a supported version passes, an old one fails with its code', () => {
  assert.equal(checkNode(healthy().input).status, 'ok');
  const old = checkNode(healthy({ nodeVersion: 'v20.1.0' }).input);
  assert.equal(old.status, 'fail');
  assert.equal(old.code, 'NODE_UNSUPPORTED');
  assert.ok(old.fix);
});

test('deps: missing packages fail and are named', () => {
  assert.equal(checkDeps(healthy().input).status, 'ok');
  const machine = fakeMachine();
  machine.missing = ['esbuild', 'zod'];
  const result = checkDeps(healthy({}, machine).input);
  assert.equal(result.status, 'fail');
  assert.equal(result.code, 'DEPS_MISSING');
  assert.match(result.detail, /esbuild, zod/);
});

test('plugin: manifest and folder', () => {
  assert.equal(checkPlugin(healthy().input).status, 'ok');

  const unreadable = healthy();
  unreadable.machine.files.delete(join(PLUGIN, '.claude-plugin', 'plugin.json'));
  assert.match(checkPlugin(unreadable.input).detail, /doctor\.plugin\.unreadable/);

  const invalid = healthy();
  invalid.machine.files.set(join(PLUGIN, '.claude-plugin', 'plugin.json'), '{"name":"kitvas"}');
  const broken = checkPlugin(invalid.input);
  assert.equal(broken.status, 'fail');
  assert.match(broken.detail, /doctor\.plugin\.invalid/);

  const inside = checkPlugin(healthy({ insidePlugin: true }).input);
  assert.equal(inside.status, 'fail');
  assert.equal(inside.code, 'PLUGIN_FOLDER');
});

test('workspace: ok, missing is a warning, a broken config fails', () => {
  assert.equal(checkWorkspace(healthy().input).result.status, 'ok');

  const missing = checkWorkspace(
    healthy({
      settings: () => ({ ...SETTINGS, workspace: { ...SETTINGS.workspace, exists: false } }),
    }).input,
  );
  assert.equal(missing.result.status, 'warn');
  assert.match(missing.result.fix ?? '', /doctor\.workspace\.fixMissing/);
  assert.ok(missing.settings);

  const invalid = checkWorkspace(
    healthy({
      settings: () => {
        throw new KitvasError('CONFIG_INVALID', { file: '/project/.kitvas/config.json' });
      },
    }).input,
  );
  assert.equal(invalid.result.status, 'fail');
  assert.equal(invalid.result.code, 'CONFIG_INVALID');
  assert.equal(invalid.settings, undefined);
  // The file's path is not in the text: only the code is.
  assert.doesNotMatch(invalid.result.detail, /project/);
});

test('kit: ok, stale, issues, a load failure and no settings', () => {
  const { input } = healthy();
  assert.equal(checkKit(input, SETTINGS).status, 'ok');
  assert.equal(checkKit(input, undefined).status, 'skipped');

  const stale = healthy({
    kit: () => ({ id: 'base', version: '1.0.0', source: 'npm', issues: 0, stale: true }),
  }).input;
  assert.equal(checkKit(stale, SETTINGS).status, 'warn');

  const issues = healthy({
    kit: () => ({ id: 'base', version: '1.0.0', source: 'npm', issues: 3, stale: false }),
  }).input;
  const found = checkKit(issues, SETTINGS);
  assert.equal(found.status, 'fail');
  assert.match(found.detail, /"count":3/);

  const missing = healthy({
    kit: () => {
      throw new KitvasError('KIT_NOT_FOUND', { id: 'base' });
    },
  }).input;
  const lost = checkKit(missing, SETTINGS);
  assert.equal(lost.status, 'fail');
  assert.equal(lost.code, 'KIT_NOT_FOUND');
});

test('decisions: clean passes, warnings warn with the fix, no workspace skips', () => {
  assert.equal(checkDecisions(healthy().input, true).status, 'ok');
  assert.equal(checkDecisions(healthy().input, false).status, 'skipped');

  const none = healthy({ decisions: () => ({ exists: false, warnings: [] }) }).input;
  assert.equal(checkDecisions(none, true).status, 'ok');

  const bad = healthy({
    decisions: () => ({
      exists: true,
      warnings: [{ code: 'badValue', line: 3, params: { key: 'check', value: 'x' } }],
    }),
  }).input;
  const warned = checkDecisions(bad, true);
  assert.equal(warned.status, 'warn');
  assert.match(warned.detail, /"count":1/);
  assert.match(warned.fix ?? '', /doctor\.decisions\.fix\b(?!Kit)/);

  const lost = healthy({
    decisions: () => ({
      exists: true,
      warnings: [{ code: 'kitMissing', line: 2, params: { id: 'gone' } }],
    }),
  }).input;
  assert.match(checkDecisions(lost, true).fix ?? '', /doctor\.decisions\.fixKit/);
});

test('browser: found passes, missing warns', async () => {
  assert.equal((await checkBrowser(healthy().input)).status, 'ok');
  const none = await checkBrowser(
    healthy({ browser: async () => ({ found: null, dir: '/data/browsers' }) }).input,
  );
  assert.equal(none.status, 'warn');
  assert.match(none.fix ?? '', /doctor\.browser\.fix/);
});

test('data: both folders take the file the way the draft store writes it', () => {
  const { input, machine } = healthy();
  const result = checkData(input, true);
  assert.equal(result.status, 'ok');
  assert.equal(machine.moves.length, 2);
  // Nothing stays behind.
  assert.deepEqual(
    [...machine.files.keys()].filter((file) => file.includes('doctor-probe')),
    [],
  );
});

test('data: a move that needs a retry warns, one that never works fails', () => {
  const retried = healthy();
  retried.machine.moveResult = { retries: 2 };
  const warned = checkData(retried.input, true);
  assert.equal(warned.status, 'warn');
  assert.match(warned.fix ?? '', /doctor\.data\.fixRetried/);

  const blocked = healthy();
  blocked.machine.moveResult = { throws: 'EPERM' };
  const failed = checkData(blocked.input, true);
  assert.equal(failed.status, 'fail');
  assert.equal(failed.code, 'EPERM');
  assert.match(failed.detail, /EPERM/);
});

test('data: the probe removes both files when the move fails', () => {
  const machine = fakeMachine();
  machine.folders.add(DATA);
  machine.moveResult = { throws: 'EBUSY' };
  assert.deepEqual(probeFolder(machine, DATA), { state: 'failed', code: 'EBUSY' });
  assert.equal(machine.files.size, 0);
});

test('data: a folder that does not exist yet is probed through the folder above it', () => {
  const machine = fakeMachine();
  const base = join('/new');
  machine.folders.add(base);
  const { input } = healthy({ dataDir: join(base, 'data') }, machine);
  const result = checkData(input, true);
  assert.equal(result.status, 'ok');
  assert.match(result.detail, /doctor\.data\.okParent/);
});

test('data: without a workspace the drafts folder is skipped', () => {
  const { input, machine } = healthy();
  const result = checkData(input, false);
  assert.equal(result.status, 'ok');
  assert.match(result.detail, /doctor\.data\.noDrafts/);
  assert.equal(machine.moves.length, 1);
});

test('ports: a port and the name pass; each failure has its own state', async () => {
  assert.equal((await checkPorts(healthy().input)).status, 'ok');

  const closed = healthy();
  closed.machine.portError = 'EACCES';
  const noPort = await checkPorts(closed.input);
  assert.equal(noPort.status, 'fail');
  assert.equal(noPort.code, 'EACCES');

  const outside = healthy();
  outside.machine.hosts = ['10.0.0.5'];
  assert.equal((await checkPorts(outside.input)).status, 'warn');

  const unknown = healthy();
  unknown.machine.hosts = { throws: 'ENOTFOUND' };
  // A system that does not know the name is fine: the browser resolves `.localhost` itself.
  const unresolved = await checkPorts(unknown.input);
  assert.equal(unresolved.status, 'ok');
  assert.match(unresolved.detail, /ENOTFOUND/);
});

test('studio: skipped without a workspace, codes and counts from the log otherwise', async () => {
  assert.equal((await checkStudio(healthy().input, false)).status, 'skipped');

  const quiet = healthy();
  quiet.machine.files.set('/data/studio/a.log', '2026-11-24T10:00:00.000Z listening\n');
  assert.equal((await checkStudio(quiet.input, true)).status, 'ok');

  const noisy = healthy();
  const line = (time: string, text: string) => `${time} ${text}`;
  noisy.machine.files.set(
    '/data/studio/a.log',
    [
      line('2026-11-24T10:00:00.000Z', 'Error: EPERM: operation not permitted, rename /secret/a'),
      line('2026-11-24T10:01:00.000Z', 'Error: EPERM: operation not permitted, rename /secret/b'),
      '    at renameSync (node:fs:1)',
      line('2026-11-20T10:01:00.000Z', 'Error: EBUSY: too old to count'),
    ].join('\n'),
  );
  const result = await checkStudio(noisy.input, true);
  assert.equal(result.status, 'warn');
  assert.match(result.detail, /EPERM x2/);
  assert.doesNotMatch(result.detail, /secret|EBUSY/);
});

test('runDoctor: results come in order, and a check that throws fails alone', async () => {
  const { input } = healthy({
    browser: async () => {
      throw Object.assign(new Error('boom'), { code: 'ECONNRESET' });
    },
  });
  const results = await runDoctor(input);
  assert.deepEqual(
    results.map((result) => result.id),
    [...CHECK_IDS],
  );
  const browser = results.find((result) => result.id === 'browser');
  assert.equal(browser?.status, 'fail');
  assert.equal(browser?.code, 'ECONNRESET');
  assert.deepEqual(
    results.filter((result) => result.status === 'fail').map((result) => result.id),
    ['browser'],
  );
});

test('runDoctor: a broken config skips the checks that need it', async () => {
  const { input } = healthy({
    settings: () => {
      throw new KitvasError('CONFIG_INVALID', {});
    },
  });
  const results = await runDoctor(input);
  const byId = Object.fromEntries(results.map((result) => [result.id, result.status]));
  assert.equal(byId.workspace, 'fail');
  assert.equal(byId.kit, 'skipped');
  assert.equal(byId.decisions, 'skipped');
  assert.equal(byId.studio, 'skipped');
});
