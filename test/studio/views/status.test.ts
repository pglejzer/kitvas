import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  findingsFor,
  needsAttention,
  nextStep,
  statusLine,
  versionStatus,
} from '../../../src/studio/views/status.ts';
import { checksOf, finding } from '../../helpers/findings.ts';

test('a version is not built, not checked, or checked with its counts', () => {
  const checks = checksOf([finding(), finding({ severity: 'review', line: 20 })]);
  assert.deepEqual(versionStatus(false, undefined), { kind: 'notBuilt' });
  assert.deepEqual(versionStatus(false, checks), { kind: 'notBuilt' });
  assert.deepEqual(versionStatus(true, undefined), { kind: 'notChecked' });
  assert.deepEqual(versionStatus(true, checks), { kind: 'checked', fix: 1, review: 1 });
});

test('the status in words: what to fix first, then what to review', () => {
  assert.deepEqual(statusLine({ kind: 'checked', fix: 2, review: 1 }), {
    key: 'studio.status.fix',
    params: { count: 2 },
    tone: 'fix',
  });
  assert.deepEqual(statusLine({ kind: 'checked', fix: 0, review: 3 }), {
    key: 'studio.status.review',
    params: { count: 3 },
    tone: 'review',
  });
  assert.deepEqual(statusLine({ kind: 'checked', fix: 0, review: 0 }), {
    key: 'studio.status.good',
    params: {},
    tone: 'quiet',
  });
  assert.deepEqual(statusLine({ kind: 'unreadable' }), {
    key: 'studio.status.unreadable',
    params: {},
    tone: 'fix',
  });
  assert.equal(statusLine({ kind: 'notBuilt' }).key, 'studio.status.notBuilt');
  assert.equal(statusLine({ kind: 'notChecked' }).key, 'studio.status.notChecked');
});

test('a draft needs attention when it cannot be read, is not built or has something to fix', () => {
  assert.equal(needsAttention({ kind: 'unreadable' }), true);
  assert.equal(needsAttention({ kind: 'notBuilt' }), true);
  assert.equal(needsAttention({ kind: 'checked', fix: 1, review: 0 }), true);
  assert.equal(needsAttention({ kind: 'checked', fix: 0, review: 4 }), false);
  assert.equal(needsAttention({ kind: 'notChecked' }), false);
});

test('findings of this state and width, and of files, are shown in order; the rest are counted', () => {
  assert.deepEqual(findingsFor(undefined, 'filled', 390), { shown: [], elsewhere: 0 });
  const file = finding({ severity: 'review', check: 'ds', line: 4 });
  const here = finding({ states: ['filled'], widths: [390, 1280] });
  const wide = finding({ states: ['filled'], widths: [1280], line: 30 });
  const empty = finding({ states: ['empty'], widths: [390], line: 40 });
  const checks = checksOf([file, here, wide, empty]);
  assert.deepEqual(findingsFor(checks, 'filled', 390), { shown: [here, file], elsewhere: 2 });
  assert.deepEqual(findingsFor(checks, 'filled', 1280), {
    shown: [here, wide, file],
    elsewhere: 1,
  });
});

test('the next step follows the status', () => {
  const build = { key: 'studio.next.build', params: { slug: 'shop' } };
  assert.deepEqual(nextStep({ kind: 'notBuilt' }, 'shop', 1), build);
  assert.deepEqual(nextStep({ kind: 'unreadable' }, 'shop', 1), build);
  assert.deepEqual(nextStep({ kind: 'notChecked' }, 'shop', 1), {
    key: 'studio.next.check',
    params: { slug: 'shop' },
  });
  assert.deepEqual(nextStep({ kind: 'checked', fix: 1, review: 2 }, 'shop', 1), {
    key: 'studio.next.fix',
    params: { slug: 'shop' },
  });
  assert.deepEqual(nextStep({ kind: 'checked', fix: 0, review: 2 }, 'shop', 1), {
    key: 'studio.next.review',
    params: {},
  });
  assert.deepEqual(nextStep({ kind: 'checked', fix: 0, review: 0 }, 'shop', 3), {
    key: 'studio.next.good',
    params: { next: 4 },
  });
});
