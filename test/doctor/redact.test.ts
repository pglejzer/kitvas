import assert from 'node:assert/strict';
import { test } from 'node:test';
import { buildReport, redact } from '../../src/doctor/index.ts';
import { fakeT } from './fakes.ts';

const WINDOWS = {
  home: 'C:\\Users\\Piotr_Glejzer',
  project: 'C:\\Users\\Piotr_Glejzer\\work\\shop',
};
const POSIX = { home: '/home/piotr', project: '/home/piotr/work/shop' };

test('the project and home folders become stand-ins, in every spelling', () => {
  const text = [
    'a C:\\Users\\Piotr_Glejzer\\work\\shop\\.kitvas\\drafts',
    'b C:/Users/Piotr_Glejzer/work/shop/src',
    'c "C:\\\\Users\\\\Piotr_Glejzer\\\\.kitvas\\\\data"',
    'd c:\\users\\piotr_glejzer\\work',
  ].join('\n');
  const result = redact(text, WINDOWS);
  assert.match(result, /^a <project>\\\.kitvas\\drafts$/m);
  assert.match(result, /^b <project>\/src$/m);
  assert.match(result, /^c "~\\\\\.kitvas\\\\data"$/m);
  assert.match(result, /^d ~\\work$/m);
  assert.doesNotMatch(result, /Piotr|Glejzer/i);
});

test('posix folders and the user name are written out', () => {
  const result = redact('/home/piotr/work/shop/a.ts by piotr; /home/piotr/.kitvas', POSIX);
  assert.equal(result, '<project>/a.ts by <user>; ~/.kitvas');
});

test('a user name that is one of kitvas words is left alone', () => {
  const result = redact('Node v26 in /home/node/x', { home: '/home/node', project: '/srv/app' });
  assert.equal(result, 'Node v26 in ~/x');
});

test('draft slugs, e-mail addresses, addresses, tokens, keys and environment values', () => {
  const token = 'a'.repeat(40);
  const text = [
    'rename /somewhere/drafts/landing-page/src/Hero.tsx failed',
    'by pg@example.com',
    'listening on 192.168.1.20 and fe80::1ff:fe23:4567:890a and ::1',
    `token ${token}`,
    'file 0123456789abcdef.log',
    'KITVAS_DATA_DIR=/secret/place PATH=/bin',
    'open http://example.org/a?code=1 and https://evil.test:8080/x',
  ].join('\n');
  const result = redact(text, POSIX);
  assert.match(result, /drafts\/<draft>\/src\/Hero\.tsx/);
  assert.doesNotMatch(result, /landing-page/);
  assert.match(result, /by <email>/);
  assert.match(result, /listening on <address> and <address> and <address>/);
  assert.match(result, /token <token>/);
  assert.match(result, /file <key>\.log/);
  assert.match(result, /KITVAS_DATA_DIR=<value> PATH=<value>/);
  assert.match(result, /http:\/\/<host>\/a/);
  assert.match(result, /https:\/\/<host>:8080\/x/);
  assert.doesNotMatch(result, /example|evil|secret|192\.168/);
});

test('the two names the studio uses and the loopback address stay', () => {
  const text = 'http://kitvas.localhost:5173 and 127.0.0.1 and http://127.0.0.1:5174';
  assert.equal(redact(text, POSIX), text);
});

test('versions and plain words are not touched', () => {
  const text = 'Node v26.13.1, Windows_NT 10.0.26300 (x64), kit kitvas-ui 1.1.0, EPERM x14';
  assert.equal(redact(text, POSIX), text);
});

test('the report holds the versions and one line per check and nothing private', () => {
  const report = buildReport({
    t: fakeT,
    version: '1.1.0',
    nodeVersion: 'v26.13.1',
    system: { os: 'Windows_NT 10.0.26300', arch: 'x64' },
    home: POSIX.home,
    project: POSIX.project,
    checks: [
      { id: 'node', status: 'ok', detail: 'fine' },
      {
        id: 'data',
        status: 'fail',
        detail: 'cannot write /home/piotr/work/shop/.kitvas/drafts/my-secret-draft/a.tsx',
        fix: 'look at /home/piotr/.kitvas/data',
        code: 'EPERM',
      },
    ],
  });
  const lines = report.split('\n');
  assert.equal(lines.length, 4 + 2);
  assert.match(report, /doctor\.report\.version \{"version":"1\.1\.0"\}/);
  assert.match(report, /<project>\/\.kitvas\/drafts\/<draft>\/a\.tsx/);
  assert.match(report, /~\/\.kitvas\/data/);
  assert.doesNotMatch(report, /piotr|my-secret-draft/);
});
