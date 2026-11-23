import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  ERROR_TABLE,
  err,
  exitCodeOf,
  httpStatusOf,
  KitvasError,
  ok,
} from '../../src/shared/errors/errors.ts';

test('KitvasError carries a code and params', () => {
  const error = new KitvasError('CONFIG_INVALID', { file: 'a.json', detail: 'bad' });
  assert.equal(error.code, 'CONFIG_INVALID');
  assert.deepEqual(error.params, { file: 'a.json', detail: 'bad' });
  assert.ok(error instanceof Error);
});

test('codes map to exit codes and HTTP statuses', () => {
  assert.equal(exitCodeOf('USAGE'), 2);
  assert.equal(exitCodeOf('INTERNAL'), 1);
  assert.equal(httpStatusOf('CONFIG_INVALID'), 422);
});

test('kit codes have their own exit codes', () => {
  assert.equal(exitCodeOf('KIT_NOT_FOUND'), 6);
  assert.equal(exitCodeOf('KIT_INVALID'), 7);
  assert.equal(exitCodeOf('KIT_COMPONENT_NOT_FOUND'), 8);
  assert.equal(httpStatusOf('KIT_NOT_FOUND'), 404);
});

test('Result helpers', () => {
  assert.deepEqual(ok(3), { ok: true, value: 3 });
  const failure = err(new KitvasError('USAGE'));
  assert.equal(failure.ok, false);
});

test('draft codes have their own exit codes', () => {
  assert.equal(exitCodeOf('DRAFT_NOT_FOUND'), 9);
  assert.equal(exitCodeOf('DRAFT_EXISTS'), 10);
  assert.equal(exitCodeOf('DRAFT_INVALID'), 11);
  assert.equal(exitCodeOf('SECTION_NOT_FOUND'), 12);
  assert.equal(exitCodeOf('WORKSPACE_MISSING'), 13);
  assert.equal(httpStatusOf('DRAFT_EXISTS'), 409);
});

test('browser codes have their own exit codes', () => {
  assert.equal(exitCodeOf('BROWSER_MISSING'), 14);
  assert.equal(exitCodeOf('BROWSER_INSTALL_FAILED'), 15);
  assert.equal(httpStatusOf('BROWSER_MISSING'), 503);
});

test('studio request codes map to their HTTP statuses', () => {
  const statuses = {
    REQUEST_INVALID: 400,
    REQUEST_FORBIDDEN: 403,
    TOKEN_INVALID: 401,
    ROUTE_NOT_FOUND: 404,
    METHOD_NOT_ALLOWED: 405,
    PRECONDITION_FAILED: 412,
    BODY_TOO_LARGE: 413,
    MEDIA_TYPE_UNSUPPORTED: 415,
    BODY_INVALID: 422,
    PRECONDITION_REQUIRED: 428,
    VERSION_NOT_FOUND: 404,
  } as const;
  for (const [code, status] of Object.entries(statuses)) {
    assert.equal(httpStatusOf(code as keyof typeof statuses), status, code);
  }
  assert.equal(exitCodeOf('REQUEST_INVALID'), 16);
  assert.equal(exitCodeOf('VERSION_NOT_FOUND'), 26);
});

test('a studio that does not start has its own exit code', () => {
  assert.equal(exitCodeOf('STUDIO_START_FAILED'), 27);
  assert.equal(httpStatusOf('STUDIO_START_FAILED'), 500);
});

test('jobs and event streams have their own codes', () => {
  assert.equal(exitCodeOf('JOB_RUNNING'), 28);
  assert.equal(httpStatusOf('JOB_RUNNING'), 409);
  assert.equal(httpStatusOf('JOB_NOT_FOUND'), 404);
  assert.equal(httpStatusOf('JOB_LIMIT'), 500);
  assert.equal(httpStatusOf('JOB_CRASHED'), 500);
  assert.equal(exitCodeOf('STREAM_LIMIT'), 32);
  assert.equal(httpStatusOf('STREAM_LIMIT'), 503);
});

test('a full inbox has its own code', () => {
  assert.equal(exitCodeOf('INBOX_FULL'), 33);
  assert.equal(httpStatusOf('INBOX_FULL'), 409);
});

test('exit codes are unique', () => {
  const exits = Object.values(ERROR_TABLE).map((entry) => entry.exit);
  assert.equal(new Set(exits).size, exits.length);
});
