import assert from 'node:assert/strict';
import { test } from 'node:test';
import { differs, diffRows } from '../../../../../client/studio/edit/diff/line-diff.ts';

const lines = (...each: string[]): string => each.join('\n');

test('equal sources are rows of the same line on both sides', () => {
  const source = lines('<Card>', '  <Text>One</Text>', '</Card>');
  assert.deepEqual(diffRows(source, source), [
    { old: '<Card>', current: '<Card>', same: true },
    { old: '  <Text>One</Text>', current: '  <Text>One</Text>', same: true },
    { old: '</Card>', current: '</Card>', same: true },
  ]);
  assert.equal(differs(source, source), false);
});

test('a changed line stands beside the line that took its place', () => {
  const old = lines('<Card>', '  <Text>One</Text>', '</Card>');
  const current = lines('<Card>', '  <Text>Two</Text>', '</Card>');
  assert.deepEqual(diffRows(old, current)[1], {
    old: '  <Text>One</Text>',
    current: '  <Text>Two</Text>',
    same: false,
  });
  assert.equal(differs(old, current), true);
});

test('a line only one side has leaves the other side of its row empty', () => {
  const old = lines('<Card>', '  <Text>One</Text>', '  <Badge>New</Badge>', '</Card>');
  const current = lines('<Card>', '  <Text>One</Text>', '</Card>');
  assert.deepEqual(diffRows(old, current)[2], {
    old: '  <Badge>New</Badge>',
    current: null,
    same: false,
  });
  assert.deepEqual(diffRows(current, old)[2], {
    old: null,
    current: '  <Badge>New</Badge>',
    same: false,
  });
  assert.equal(diffRows(old, current).length, 4);
});

test('runs of different lengths pair up from their first lines', () => {
  const rows = diffRows(lines('a', 'x', 'y', 'z', 'b'), lines('a', 'p', 'b'));
  assert.deepEqual(rows, [
    { old: 'a', current: 'a', same: true },
    { old: 'x', current: 'p', same: false },
    { old: 'y', current: null, same: false },
    { old: 'z', current: null, same: false },
    { old: 'b', current: 'b', same: true },
  ]);
});

test('how the lines end is not a difference', () => {
  assert.equal(differs('<a>\r\n</a>', '<a>\n</a>'), false);
});
