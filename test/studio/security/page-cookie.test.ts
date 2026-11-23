import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  cookieName,
  cookieValue,
  pageCookieHeader,
} from '../../../src/studio/security/page-cookie.ts';

test('the cookie names its port, lasts 30 days and keeps off scripts and other sites', () => {
  assert.equal(cookieName(5000), 'kitvas_5000');
  assert.equal(
    pageCookieHeader(5000, 'abc'),
    'kitvas_5000=abc; Path=/; Max-Age=2592000; HttpOnly; SameSite=Strict',
  );
});

test('the cookie is read from a Cookie header; twice is not at all', () => {
  assert.equal(cookieValue('a=1; kitvas_5000=abc; b=2', 'kitvas_5000'), 'abc');
  assert.equal(cookieValue('kitvas_5001=zzz', 'kitvas_5000'), undefined);
  assert.equal(cookieValue(undefined, 'kitvas_5000'), undefined);
  assert.equal(cookieValue('kitvas_5000=a; kitvas_5000=b', 'kitvas_5000'), undefined);
  assert.equal(cookieValue('broken; kitvas_5000=abc', 'kitvas_5000'), 'abc');
});
