import assert from 'node:assert/strict';
import { test } from 'node:test';
import { answeredIds, claudeMarks } from '../../../../../client/studio/edit/ai/marks.ts';
import type { RequestStatus } from '../../../../../src/studio/api/requests/request-schemas.ts';

const base = {
  shown: true,
  editing: true,
  selection: [] as string[],
  copies: [] as { id: string; item?: number }[],
  requests: [] as { elements: string[]; status: RequestStatus }[],
  known: new Set(['a', 'b']),
};

const request = (status: RequestStatus, ...elements: string[]) => ({ elements, status });

test('while writing, the selected copies are looked at', () => {
  const marks = claudeMarks({
    ...base,
    selection: ['a'],
    copies: [{ id: 'a', item: 1 }],
  });
  assert.deepEqual(marks, [{ id: 'a', item: 1, motion: false }]);
});

test('a selected element with no chosen copy is looked at on every copy', () => {
  assert.deepEqual(claudeMarks({ ...base, selection: ['a'] }), [{ id: 'a', motion: false }]);
});

test('the tab hidden or Edit off marks nothing while writing', () => {
  const input = { ...base, selection: ['a'], copies: [{ id: 'a', item: 1 }] };
  assert.deepEqual(claudeMarks({ ...input, shown: false }), []);
  assert.deepEqual(claudeMarks({ ...input, editing: false }), []);
});

test('a waiting request marks every copy of its elements, still', () => {
  const marks = claudeMarks({ ...base, requests: [request('waiting', 'b')] });
  assert.deepEqual(marks, [{ id: 'b', motion: false }]);
});

test('a taken request moves', () => {
  const marks = claudeMarks({ ...base, requests: [request('taken', 'b')] });
  assert.deepEqual(marks, [{ id: 'b', motion: true }]);
});

test('answered, failed and dropped requests mark nothing', () => {
  const requests = [request('answered', 'a'), request('failed', 'b'), request('dropped', 'a')];
  assert.deepEqual(claudeMarks({ ...base, requests }), []);
});

test('one id once, moving wins', () => {
  const marks = claudeMarks({
    ...base,
    selection: ['b'],
    requests: [request('taken', 'b')],
  });
  assert.deepEqual(marks, [{ id: 'b', motion: true }]);
});

test('several requests mark the union of their elements', () => {
  const marks = claudeMarks({
    ...base,
    requests: [request('waiting', 'a'), request('taken', 'b', 'a')],
  });
  assert.deepEqual(marks, [
    { id: 'a', motion: true },
    { id: 'b', motion: true },
  ]);
});

test('a mark on every copy covers a still mark on one copy of it', () => {
  const marks = claudeMarks({
    ...base,
    selection: ['a'],
    copies: [{ id: 'a', item: 2 }],
    requests: [request('waiting', 'a')],
  });
  assert.deepEqual(marks, [{ id: 'a', motion: false }]);
});

test('an id the tree no longer has gets no mark', () => {
  const marks = claudeMarks({
    ...base,
    known: new Set(['a']),
    selection: ['b'],
    requests: [request('taken', 'b')],
  });
  assert.deepEqual(marks, []);
});

test('the elements of a request that was just answered flash', () => {
  const listed = (status: RequestStatus) => [{ id: 'r', status, elements: ['b'] }];
  assert.deepEqual(answeredIds(listed('taken'), listed('answered')), ['b']);
  assert.deepEqual(answeredIds(listed('waiting'), listed('answered')), ['b']);
  assert.deepEqual(answeredIds(listed('taken'), listed('failed')), []);
  assert.deepEqual(answeredIds(listed('taken'), listed('dropped')), []);
});

test('a request first seen answered, or answered before, does not flash again', () => {
  const answered = [{ id: 'r', status: 'answered' as const, elements: ['b'] }];
  assert.deepEqual(answeredIds([], answered), []);
  assert.deepEqual(answeredIds(answered, answered), []);
});
