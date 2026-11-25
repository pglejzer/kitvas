import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  checkLine,
  clockOf,
  factsOf,
  shotAddress,
  versionLine,
} from '../../../../../client/studio/edit/timeline/facts.ts';

const facts = (over: Record<string, unknown> = {}) =>
  factsOf({
    number: 2,
    createdAt: '2026-11-25T11:40:00.000Z',
    shot: 'shots/filled-1280.png',
    check: { fix: 0, review: 0 },
    ...over,
  });

test('a version without a shot or a check says Not checked and has no picture', () => {
  const bare = factsOf({
    number: 3,
    createdAt: '2026-11-25T11:40:00.000Z',
    shot: null,
    check: null,
  });
  assert.ok(bare);
  assert.equal(bare.shot, null);
  assert.deepEqual(versionLine(bare, false, 0, 0), {
    kind: 'saved',
    time: '11:40',
    check: { kind: 'none' },
  });
  assert.equal(
    shotAddress('http://kitvas.localhost:1/f/key/pricing/v4/html/index.html', 3, null),
    null,
  );
  // A version the studio could not read at all is the same: no time, no check, no picture.
  assert.deepEqual(versionLine(undefined, false, 0), {
    kind: 'saved',
    time: null,
    check: { kind: 'none' },
  });
});

test('now with changes says how many are not saved, and none says No changes', () => {
  assert.deepEqual(versionLine(facts() ?? undefined, true, 3), { kind: 'now', changes: 3 });
  assert.deepEqual(versionLine(undefined, true, 0), { kind: 'now', changes: 0 });
});

test('a saved version says when it was saved and what its check found', () => {
  assert.deepEqual(versionLine(facts() ?? undefined, false, 0, 0), {
    kind: 'saved',
    time: '11:40',
    check: { kind: 'good' },
  });
  assert.deepEqual(checkLine({ fix: 2, review: 5 }), { kind: 'fix', count: 2 });
  assert.deepEqual(checkLine({ fix: 0, review: 4 }), { kind: 'review', count: 4 });
  assert.deepEqual(checkLine(null), { kind: 'none' });
});

test('the clock is the person’s: minutes behind UTC move the time, a bad date has none', () => {
  assert.equal(clockOf('2026-11-25T11:40:00.000Z', -60), '12:40');
  assert.equal(clockOf('2026-11-25T00:05:00.000Z', 120), '22:05');
  assert.equal(clockOf('not a date'), null);
});

test('the answer is read from unknown: a wrong shape is refused, a odd shot path is dropped', () => {
  assert.equal(factsOf('x'), null);
  assert.equal(factsOf({ number: 0, createdAt: 'x' }), null);
  assert.equal(facts({ shot: '../../etc/passwd.png' })?.shot, null);
  assert.equal(facts({ shot: 'shots/filled-1280.png' })?.shot, 'shots/filled-1280.png');
  assert.equal(facts({ check: { fix: -1, review: 0 } })?.check, null);
});

test("a shot's address is the card's origin and key with the version's own folder", () => {
  const frame = 'http://kitvas.localhost:4001/f/KEY/pricing/v4/html/index.html?state=filled#abc';
  assert.equal(
    shotAddress(frame, 2, 'shots/filled-1280.png'),
    'http://kitvas.localhost:4001/f/KEY/pricing/v2/shots/filled-1280.png',
  );
  assert.equal(shotAddress(undefined, 2, 'shots/filled-1280.png'), null);
  assert.equal(shotAddress('http://kitvas.localhost:4001/other', 2, 'shots/a.png'), null);
  assert.equal(shotAddress('not a url', 2, 'shots/a.png'), null);
});
