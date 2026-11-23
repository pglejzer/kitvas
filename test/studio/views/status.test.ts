import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  findingsFor,
  needsAttention,
  nextStep,
  statusLine,
  studioWidth,
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

test('a width the studio does not show maps to the nearest one, a tie to the wider', () => {
  assert.deepEqual(
    [320, 390, 500, 600, 768, 1024, 1100, 1280, 1440].map(studioWidth),
    [390, 390, 390, 768, 768, 1280, 1280, 1280, 1280],
  );
});

test('a finding seen only at widths the studio lacks shows at the nearest studio width', () => {
  const narrow = finding({ states: ['filled'], widths: [320], line: 1 });
  const deep = finding({ states: ['filled'], widths: [1024, 1440], line: 2 });
  const both = finding({ states: ['filled'], widths: [320, 1440], line: 3 });
  // Seen at a studio width: it shows only there, not at the nearest of its other widths.
  const mixed = finding({ states: ['filled'], widths: [390, 1440], line: 4 });
  const checks = checksOf([narrow, deep, both, mixed]);
  assert.deepEqual(findingsFor(checks, 'filled', 390), {
    shown: [narrow, both, mixed],
    elsewhere: 1,
  });
  assert.deepEqual(findingsFor(checks, 'filled', 768), { shown: [], elsewhere: 4 });
  assert.deepEqual(findingsFor(checks, 'filled', 1280), { shown: [deep, both], elsewhere: 2 });
  assert.deepEqual(findingsFor(checks, 'empty', 390), { shown: [], elsewhere: 4 });
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
