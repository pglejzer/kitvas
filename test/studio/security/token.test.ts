import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  newChannel,
  newFrameKey,
  newNonce,
  newToken,
  secretMatches,
} from '../../../src/studio/security/token.ts';

test('tokens, keys and nonces are random and long enough', () => {
  const token = newToken();
  assert.match(token, /^[A-Za-z0-9_-]{43}$/);
  assert.notEqual(newToken(), token);
  assert.match(newFrameKey(), /^[A-Za-z0-9_-]{22}$/);
  assert.match(newNonce(), /^[A-Za-z0-9+/]{22}==$/);
});

test('a channel id is 16 random bytes in the form the frame protocol reads', () => {
  const channel = newChannel();
  assert.match(channel, /^[A-Za-z0-9_-]{22}$/);
  assert.notEqual(newChannel(), channel);
});

test('secrets compare exactly', () => {
  const token = newToken();
  assert.equal(secretMatches(token, token), true);
  assert.equal(secretMatches(`${token}x`, token), false);
  assert.equal(secretMatches('', token), false);
  assert.equal(secretMatches(undefined, token), false);
});
