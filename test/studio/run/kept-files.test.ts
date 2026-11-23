import assert from 'node:assert/strict';
import { readdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { test } from 'node:test';
import { readPorts, writePorts } from '../../../src/studio/run/ports-file.ts';
import { pageSecretOf } from '../../../src/studio/run/secret-file.ts';
import { tempDir } from '../../helpers/tmp.ts';

test('the page secret is made once, as 32 random bytes in hex, and read back after', () => {
  const file = join(tempDir(), 'studio', 'project.secret');
  const secret = pageSecretOf(file);
  assert.match(secret, /^[0-9a-f]{64}$/);
  assert.equal(readFileSync(file, 'utf8'), `${secret}\n`);
  assert.equal(pageSecretOf(file), secret);
  assert.notEqual(pageSecretOf(join(tempDir(), 'other.secret')), secret);
  // Written whole: no temporary file is left beside it.
  assert.deepEqual(readdirSync(dirname(file)), ['project.secret']);
});

test('a malformed secret file is replaced by a new secret', () => {
  const file = join(tempDir(), 'project.secret');
  for (const text of ['', 'nope', 'A'.repeat(64), '0'.repeat(63), `${'0'.repeat(64)}x`]) {
    writeFileSync(file, text);
    const secret = pageSecretOf(file);
    assert.match(secret, /^[0-9a-f]{64}$/, text);
    assert.equal(readFileSync(file, 'utf8').trim(), secret, text);
  }
});

test('the secret is readable by its owner only', { skip: process.platform === 'win32' }, () => {
  const file = join(tempDir(), 'studio', 'project.secret');
  pageSecretOf(file);
  assert.equal(statSync(file).mode & 0o777, 0o600);
});

test('saved ports are read back; a missing or foreign file reads as none', () => {
  const file = join(tempDir(), 'studio', 'project.ports.json');
  assert.equal(readPorts(file), undefined);
  writePorts(file, { port: 41000, framePort: 41001 });
  assert.deepEqual(readPorts(file), { port: 41000, framePort: 41001 });
  assert.deepEqual(readdirSync(dirname(file)), ['project.ports.json']);
  const foreign = [
    '{',
    '{"port":41000}',
    '{"port":0,"framePort":41001}',
    '{"port":70000,"framePort":41001}',
    '{"port":41000.5,"framePort":41001}',
    '{"port":41000,"framePort":41001,"extra":true}',
  ];
  for (const text of foreign) {
    writeFileSync(file, text);
    assert.equal(readPorts(file), undefined, text);
  }
});
