import assert from 'node:assert/strict';
import { existsSync, mkdirSync, readdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { test } from 'node:test';
import { createNodeMachine } from '../../src/doctor/adapters/node-machine.ts';
import { checkData, probeFolder } from '../../src/doctor/app/checks/data.ts';
import { defaultDepRoots } from '../../src/shared/index.ts';
import { tempDir } from '../helpers/tmp.ts';
import { healthy } from './fakes.ts';

test('the probe takes a real folder and leaves nothing behind', () => {
  const folder = tempDir();
  const machine = createNodeMachine({ roots: defaultDepRoots() });
  assert.deepEqual(probeFolder(machine, folder), { state: 'ok' });
  assert.deepEqual(readdirSync(folder), []);
});

test('a folder that does not exist is probed through its parent and is not created', () => {
  const parent = tempDir();
  const folder = join(parent, 'data');
  const { input } = healthy({
    dataDir: folder,
    machine: createNodeMachine({ roots: defaultDepRoots() }),
  });
  const result = checkData(input, false);
  assert.equal(result.status, 'ok');
  assert.equal(existsSync(folder), false);
  assert.deepEqual(readdirSync(parent), []);
});

test('a probe that cannot work fails, and it never removes what it did not make', () => {
  const folder = tempDir();
  const machine = createNodeMachine({ roots: defaultDepRoots() });
  // A folder sits where the probe file goes: a file cannot be written over it.
  mkdirSync(join(folder, '.kitvas-doctor-probe'));
  writeFileSync(join(folder, '.kitvas-doctor-probe', 'keep'), 'x');
  const outcome = probeFolder(machine, folder);
  assert.equal(outcome.state, 'failed');
  assert.deepEqual(readdirSync(folder), ['.kitvas-doctor-probe']);
});

test('reading, folders and the loopback port work on the real machine', async () => {
  const folder = tempDir();
  const machine = createNodeMachine({ roots: defaultDepRoots() });
  writeFileSync(join(folder, 'a.txt'), 'hello');
  assert.equal(machine.readText(join(folder, 'a.txt')), 'hello');
  assert.equal(machine.readText(join(folder, 'none.txt')), undefined);
  assert.equal(machine.isFolder(folder), true);
  assert.equal(machine.isFolder(join(folder, 'a.txt')), false);
  await machine.openLoopback();
  assert.deepEqual(machine.packages().missing, []);
  assert.match(machine.system().os, /\d/);
});
