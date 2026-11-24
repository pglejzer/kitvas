// The AI tab's listening line (spec 4d, goal 1; plan 17, task B): its words for each state, the
// command only while no session listens, and the read again while one is seen.

import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  commandOf,
  LISTEN_RECHECK_MS,
  recheckLater,
  statusLine,
} from '../../../../../client/studio/edit/ai/status.ts';
import { LISTEN_GRACE_MS } from '../../../../../src/studio/api/requests/request-schemas.ts';

const SINCE = '2026-11-24T10:00:00.000Z';

test('a waiting take says Claude is listening, with no command to copy', () => {
  assert.deepEqual(statusLine({ state: 'listening', since: SINCE }, 'shop'), {
    state: 'listening',
    key: 'ai.status.listening',
    command: null,
  });
});

test('a taken request says Claude is working', () => {
  const line = statusLine({ state: 'working', since: SINCE }, 'shop');
  assert.equal(line.key, 'ai.status.working');
  assert.equal(line.command, null);
});

test('no session says requests wait, and gives the edit command of this draft', () => {
  assert.deepEqual(statusLine({ state: 'off', since: null }, 'shop'), {
    state: 'off',
    key: 'ai.status.off',
    command: '/kitvas:edit shop',
  });
  assert.equal(commandOf('price-page'), '/kitvas:edit price-page');
});

test('the tab reads again while a session is seen, after the listening grace is over', () => {
  assert.equal(recheckLater({ state: 'listening', since: SINCE }), true);
  assert.equal(recheckLater({ state: 'working', since: SINCE }), true);
  assert.equal(recheckLater({ state: 'off', since: null }), false);
  assert.ok(LISTEN_RECHECK_MS > LISTEN_GRACE_MS);
});
