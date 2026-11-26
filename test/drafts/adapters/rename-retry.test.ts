import assert from 'node:assert/strict';
import { test } from 'node:test';
import { RENAME_WAITS, renameWithRetry } from '../../../src/drafts/adapters/rename-retry.ts';

const held = (code: string): Error => Object.assign(new Error(`${code}: held`), { code });

/** A rename that fails with `errors` in turn and then works, and the waits it was given. */
function fakeIo(errors: Error[]): {
  io: { rename(from: string, to: string): void; wait(ms: number): void };
  calls: string[];
  waits: number[];
} {
  const calls: string[] = [];
  const waits: number[] = [];
  let at = 0;
  return {
    calls,
    waits,
    io: {
      rename(from, to) {
        calls.push(`${from}>${to}`);
        const error = errors[at];
        at += 1;
        if (error) throw error;
      },
      wait(ms) {
        waits.push(ms);
      },
    },
  };
}

test('a rename that works is made once, without a wait', () => {
  const { io, calls, waits } = fakeIo([]);
  renameWithRetry('a.tmp', 'a', io);
  assert.deepEqual(calls, ['a.tmp>a']);
  assert.deepEqual(waits, []);
});

test('a file another process holds for a moment is tried again after a wait', () => {
  const { io, calls, waits } = fakeIo([held('EPERM'), held('EBUSY'), held('EACCES')]);
  renameWithRetry('a.tmp', 'a', io);
  assert.equal(calls.length, 4);
  assert.deepEqual(waits, RENAME_WAITS.slice(0, 3));
});

test('a file held past the last wait fails with the last error', () => {
  const errors = Array.from({ length: RENAME_WAITS.length + 1 }, () => held('EPERM'));
  const { io, calls, waits } = fakeIo(errors);
  assert.throws(() => renameWithRetry('a.tmp', 'a', io), { code: 'EPERM' });
  assert.equal(calls.length, RENAME_WAITS.length + 1);
  assert.deepEqual(waits, RENAME_WAITS);
});

test('any other failure is thrown at once', () => {
  const { io, calls, waits } = fakeIo([held('ENOENT')]);
  assert.throws(() => renameWithRetry('a.tmp', 'a', io), { code: 'ENOENT' });
  assert.equal(calls.length, 1);
  assert.deepEqual(waits, []);
});

test('an error without a code is thrown at once', () => {
  const { io, calls } = fakeIo([new Error('odd')]);
  assert.throws(() => renameWithRetry('a.tmp', 'a', io), /odd/);
  assert.equal(calls.length, 1);
});
