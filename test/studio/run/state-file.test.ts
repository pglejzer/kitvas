import assert from 'node:assert/strict';
import { readdirSync, statSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { test } from 'node:test';
import {
  readState,
  removeState,
  studioFiles,
  writeState,
} from '../../../src/studio/run/state-file.ts';
import { SAMPLE_STATE } from '../../helpers/studio/studio-state.ts';
import { tempDir } from '../../helpers/tmp.ts';

test('one state file per project, written whole, read back, removed only for its own pid', () => {
  const data = tempDir();
  const a = studioFiles(data, 'C:/projects/a');
  const b = studioFiles(data, 'C:/projects/b');
  assert.notEqual(a.state, b.state);
  assert.match(a.state, /studio[\\/][0-9a-f]{16}\.json$/);
  assert.match(a.log, /studio[\\/][0-9a-f]{16}\.log$/);
  // The ports and the page secret share the state file's key, so they belong to the same project.
  assert.equal(a.ports, a.state.replace(/\.json$/, '.ports.json'));
  assert.equal(a.secret, a.state.replace(/\.json$/, '.secret'));
  assert.notEqual(a.secret, b.secret);
  assert.equal(readState(a.state), undefined);
  writeState(a.state, SAMPLE_STATE);
  assert.deepEqual(readState(a.state), SAMPLE_STATE);
  removeState(a.state, SAMPLE_STATE.pid + 1);
  assert.deepEqual(readState(a.state), SAMPLE_STATE);
  removeState(a.state, SAMPLE_STATE.pid);
  assert.equal(readState(a.state), undefined);
  assert.deepEqual(readdirSync(dirname(a.state)), []);
  removeState(a.state);
});

test('a broken or foreign file reads as no studio', () => {
  const file = join(tempDir(), 'state.json');
  writeFileSync(file, '{');
  assert.equal(readState(file), undefined);
  writeFileSync(file, JSON.stringify({ ...SAMPLE_STATE, schemaVersion: 2 }));
  assert.equal(readState(file), undefined);
  writeFileSync(file, JSON.stringify({ ...SAMPLE_STATE, extra: true }));
  assert.equal(readState(file), undefined);
});

test('the state file is readable by its owner only', { skip: process.platform === 'win32' }, () => {
  const file = join(tempDir(), 'studio', 'state.json');
  writeState(file, SAMPLE_STATE);
  assert.equal(statSync(file).mode & 0o777, 0o600);
});
