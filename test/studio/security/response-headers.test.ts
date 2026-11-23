import assert from 'node:assert/strict';
import { test } from 'node:test';
import { frameHeaders, studioHeaders } from '../../../src/studio/security/response-headers.ts';

test('studio responses: nonce for inline code, the prototype origin framed, the rest locked', () => {
  const headers = studioHeaders('N0nce==', 5001);
  const csp = headers['content-security-policy'] ?? '';
  assert.match(csp, /script-src 'self' 'nonce-N0nce=='/);
  assert.match(csp, /style-src 'self' 'nonce-N0nce=='/);
  const frames = 'http://127.0.0.1:5001 http://localhost:5001 http://kitvas.localhost:5001';
  assert.ok(csp.includes(`frame-src ${frames};`), csp);
  assert.ok(csp.includes(`img-src 'self' data: ${frames};`), csp);
  for (const part of [
    "default-src 'self'",
    "object-src 'none'",
    "frame-ancestors 'self'",
    "base-uri 'none'",
  ]) {
    assert.ok(csp.includes(part), part);
  }
  assert.equal(headers['x-content-type-options'], 'nosniff');
  assert.equal(headers['referrer-policy'], 'no-referrer');
  assert.equal(headers['cross-origin-opener-policy'], 'same-origin');
  assert.equal(headers['cross-origin-resource-policy'], 'same-origin');
  assert.equal(headers['cache-control'], 'no-store');
  assert.match(headers.vary ?? '', /Sec-Fetch-Site/);
  assert.match(headers['permissions-policy'] ?? '', /camera=\(\)/);
});

test('prototype responses: sandboxed, framed only by the studio, files loadable from the sandbox', () => {
  const headers = frameHeaders(5000, 5001);
  const csp = headers['content-security-policy'] ?? '';
  assert.match(csp, /^sandbox allow-scripts;/);
  const studio = 'http://127.0.0.1:5000 http://localhost:5000 http://kitvas.localhost:5000';
  const self = 'http://127.0.0.1:5001 http://localhost:5001 http://kitvas.localhost:5001';
  assert.ok(csp.includes(`frame-ancestors ${studio};`), csp);
  assert.ok(csp.includes(`script-src ${self};`), csp);
  assert.ok(csp.includes(`style-src ${self} 'unsafe-inline';`), csp);
  assert.ok(csp.includes(`img-src ${self} data: blob:;`), csp);
  assert.ok(csp.includes(`font-src ${self} data:;`), csp);
  assert.ok(csp.includes("default-src 'none'"));
  assert.ok(!csp.includes('allow-same-origin'));
  assert.equal(headers['cross-origin-resource-policy'], 'cross-origin');
  assert.equal(headers['x-content-type-options'], 'nosniff');
});
