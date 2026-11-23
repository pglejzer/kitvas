import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  createDeniedLog,
  DENIED_PER_MINUTE,
  type DeniedRequest,
  deniedLine,
} from '../../../src/studio/security/denied-log.ts';

const request = (url: string, headers: DeniedRequest['headers'] = {}): DeniedRequest => ({
  method: 'GET',
  url,
  headers: { host: '127.0.0.1:5000', ...headers },
});

test('a line names the status, code, method, path and Host, never the query', () => {
  const line = deniedLine(
    request('/open?code=SECRET&to=%2F', { origin: 'http://evil.test' }),
    401,
    'TOKEN_INVALID',
  );
  assert.equal(
    line,
    'denied 401 TOKEN_INVALID GET /open host=127.0.0.1:5000 origin=http://evil.test',
  );
  assert.ok(!line.includes('SECRET'));
  assert.equal(
    deniedLine(request('/drafts'), 401, undefined),
    'denied 401 - GET /drafts host=127.0.0.1:5000',
  );
});

test('what a client sent is cut and kept to one line of plain characters', () => {
  const line = deniedLine(
    { method: 'GET', url: `/${'a'.repeat(300)}`, headers: { host: 'evil\u0000.test x\nnext' } },
    403,
    'REQUEST_FORBIDDEN',
  );
  assert.ok(!line.includes('\n'));
  assert.match(line, / host=evil\?\.test\?x\?next$/);
  const path = line.split(' ')[4] ?? '';
  assert.equal(path.length, 200);
  assert.equal(
    deniedLine({ method: undefined, url: undefined, headers: {} }, 403, 'X'),
    'denied 403 X - - host=-',
  );
});

test('only refusals are logged, at most 20 a minute, then how many were left out', () => {
  const lines: string[] = [];
  let now = 0;
  const denied = createDeniedLog(
    (line) => lines.push(line),
    () => now,
  );
  denied(request('/missing'), 404, 'ROUTE_NOT_FOUND');
  denied(request('/'), 200, undefined);
  assert.deepEqual(lines, []);
  for (let index = 0; index < DENIED_PER_MINUTE + 5; index += 1) {
    denied(request('/api/v1/drafts'), 401, 'TOKEN_INVALID');
  }
  assert.equal(DENIED_PER_MINUTE, 20);
  assert.equal(lines.length, 20);
  now = 60_000;
  denied(request('/api/v1/drafts'), 403, 'REQUEST_FORBIDDEN');
  assert.equal(lines.length, 22);
  assert.equal(lines[20], 'denied: 5 more refused requests were not logged (at most 20 a minute)');
  assert.match(lines[21] ?? '', /^denied 403 REQUEST_FORBIDDEN /);
});
