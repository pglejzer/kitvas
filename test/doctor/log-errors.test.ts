import assert from 'node:assert/strict';
import { test } from 'node:test';
import { errorCodeOf } from '../../src/doctor/domain/log-errors.ts';
import { countLogErrors } from '../../src/doctor/index.ts';

const NOW = new Date('2026-11-24T12:00:00Z');

test('an entry is an error when it starts like one, and only its code is kept', () => {
  assert.equal(errorCodeOf('KitvasError: EDIT_STALE_VERSION'), 'EDIT_STALE_VERSION');
  assert.equal(errorCodeOf('Error: EPERM: operation not permitted, rename /a/b'), 'EPERM');
  assert.equal(errorCodeOf('TypeError: cannot read properties of undefined'), 'INTERNAL');
  assert.equal(errorCodeOf('kitvas check shop ended with exit code 3: stderr text'), 'EXIT_3');
  assert.equal(errorCodeOf('kitvas check shop could not start: Error: x'), 'JOB_NOT_STARTED');
  assert.equal(errorCodeOf('listening on http://kitvas.localhost:5000'), undefined);
});

test('errors count per code over the last 24 hours, the most frequent first', () => {
  const log = [
    '2026-11-24T11:00:00.000Z Error: EPERM: operation not permitted, rename /a',
    '    at renameSync (node:fs:100:3)',
    '2026-11-24T11:05:00.000Z Error: EPERM: operation not permitted, rename /b',
    '2026-11-24T11:06:00.000Z KitvasError: EDIT_STALE_VERSION',
    '2026-11-23T13:00:00.000Z KitvasError: EDIT_STALE_VERSION',
    '2026-11-23T11:59:59.000Z KitvasError: EDIT_STALE_VERSION',
    '2026-11-24T11:07:00.000Z request denied',
    'not an entry at all',
  ].join('\r\n');
  assert.deepEqual(countLogErrors(log, NOW), [
    { code: 'EDIT_STALE_VERSION', count: 2 },
    { code: 'EPERM', count: 2 },
  ]);
});

test('an empty log has no errors', () => {
  assert.deepEqual(countLogErrors('', NOW), []);
});
