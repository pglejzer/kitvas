import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createOpenLinks, pagePathAllowed } from '../../../src/studio/security/open-links.ts';

test('a code works once, and only while it is fresh', () => {
  let now = new Date('2026-11-22T10:00:00.000Z');
  const links = createOpenLinks(() => now, 1_000);
  const first = links.issue();
  assert.match(first.code, /^[A-Za-z0-9_-]{43}$/);
  assert.equal(first.expiresAt, '2026-11-22T10:00:01.000Z');
  assert.equal(links.redeem(first.code), true);
  assert.equal(links.redeem(first.code), false);
  const late = links.issue();
  now = new Date('2026-11-22T10:00:01.000Z');
  assert.equal(links.redeem(late.code), false);
  assert.equal(links.redeem(null), false);
  assert.equal(links.redeem('x'.repeat(101)), false);
  assert.equal(links.redeem('not-a-code'), false);
});

test('at most 20 codes are kept; the oldest goes first', () => {
  const links = createOpenLinks(() => new Date('2026-11-22T10:00:00.000Z'));
  const codes = Array.from({ length: 21 }, () => links.issue().code);
  assert.equal(links.redeem(codes[0] ?? ''), false);
  assert.equal(links.redeem(codes[1] ?? ''), true);
  assert.equal(links.redeem(codes[20] ?? ''), true);
});

test("links lead only to the drafts, one draft or one kit's page", () => {
  for (const path of ['/', '/drafts/shop', '/drafts/a-1', '/kit/acme-sfc'])
    assert.equal(pagePathAllowed(path), true);
  for (const path of [
    '',
    '//evil.example',
    '/drafts/',
    '/drafts/Shop',
    '/kit/',
    '/kit/acme/x',
    '/api/v1/status',
    '/open',
  ]) {
    assert.equal(pagePathAllowed(path), false, path);
  }
});
