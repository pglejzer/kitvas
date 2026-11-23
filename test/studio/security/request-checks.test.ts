import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  allowedHost,
  bearerToken,
  frameSiteAllowed,
  originAllowed,
  repeatedHeaders,
  studioSiteAllowed,
} from '../../../src/studio/security/request-checks.ts';

test('Host, Origin, Authorization and Content-Length may come once', () => {
  const once = ['Host', 'a', 'Accept', '*/*', 'X-Other', '1', 'x-other', '2'];
  assert.deepEqual(repeatedHeaders(once), []);
  assert.deepEqual(repeatedHeaders(['Host', 'a', 'host', 'b']), ['host']);
  const many = [
    ...['Authorization', 'a', 'AUTHORIZATION', 'b'],
    ...['Content-Length', '1', 'content-length', '1'],
    ...['Origin', 'x', 'origin', 'y'],
  ];
  assert.deepEqual(repeatedHeaders(many), ['origin', 'authorization', 'content-length']);
});

test('Host must name this server on loopback', () => {
  assert.equal(allowedHost('127.0.0.1:4000', 4000), '127.0.0.1:4000');
  assert.equal(allowedHost('LOCALHOST:4000', 4000), 'localhost:4000');
  assert.equal(allowedHost('kitvas.localhost:4000', 4000), 'kitvas.localhost:4000');
  assert.equal(allowedHost('KITVAS.LOCALHOST:4000', 4000), 'kitvas.localhost:4000');
  assert.equal(allowedHost('Kitvas.LocalHost:4000', 4000), 'kitvas.localhost:4000');
  const refused = [
    '127.0.0.1:4001',
    'evil.example:4000',
    '127.0.0.1',
    'localhost',
    '[::1]:4000',
    '127.0.0.1:4000.evil.example',
    'kitvas.localhost',
    'kitvas.localhost:4001',
    'other.localhost:4000',
    'evil.kitvas.localhost:4000',
    'kitvas.localhost.evil.example:4000',
    'kitvas.localhost.:4000',
    undefined,
  ];
  for (const host of refused) assert.equal(allowedHost(host, 4000), undefined, String(host));
});

test('the studio takes requests from itself, typed addresses and clients that are no browser', () => {
  assert.equal(studioSiteAllowed({}), true);
  assert.equal(studioSiteAllowed({ 'sec-fetch-site': 'same-origin' }), true);
  assert.equal(studioSiteAllowed({ 'sec-fetch-site': 'none' }), true);
  assert.equal(studioSiteAllowed({ 'sec-fetch-site': 'same-site' }), false);
  assert.equal(studioSiteAllowed({ 'sec-fetch-site': 'cross-site' }), false);
});

test('the prototype origin: files for any page, but only the studio frames it', () => {
  const nav = (site: string, dest: string) => ({
    'sec-fetch-mode': 'navigate',
    'sec-fetch-site': site,
    'sec-fetch-dest': dest,
  });
  const script = {
    'sec-fetch-mode': 'no-cors',
    'sec-fetch-site': 'cross-site',
    'sec-fetch-dest': 'script',
  };
  assert.equal(frameSiteAllowed({}), true);
  assert.equal(frameSiteAllowed(script), true);
  assert.equal(frameSiteAllowed(nav('same-site', 'iframe')), true);
  assert.equal(frameSiteAllowed(nav('same-origin', 'iframe')), true);
  assert.equal(frameSiteAllowed(nav('none', 'document')), true);
  assert.equal(frameSiteAllowed(nav('cross-site', 'iframe')), false);
  assert.equal(frameSiteAllowed(nav('same-site', 'document')), false);
});

test('a write must come from the studio origin the request was sent to', () => {
  assert.equal(originAllowed('http://127.0.0.1:4000', '127.0.0.1:4000'), true);
  assert.equal(originAllowed('http://localhost:4000', 'localhost:4000'), true);
  assert.equal(originAllowed('http://kitvas.localhost:4000', 'kitvas.localhost:4000'), true);
  assert.equal(originAllowed('http://kitvas.localhost:4000', '127.0.0.1:4000'), false);
  const refused = [
    undefined,
    'null',
    'http://127.0.0.1:4001',
    'https://127.0.0.1:4000',
    'http://localhost:4000',
  ];
  for (const origin of refused) {
    assert.equal(originAllowed(origin, '127.0.0.1:4000'), false, String(origin));
  }
});

test('the bearer token is read from Authorization', () => {
  assert.equal(bearerToken('Bearer abc_DEF-1'), 'abc_DEF-1');
  assert.equal(bearerToken('bearer abc'), 'abc');
  for (const header of [undefined, '', 'Basic abc', 'Bearer', 'Bearer a b', 'Bearer a=b']) {
    assert.equal(bearerToken(header), undefined, String(header));
  }
});
