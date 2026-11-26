import assert from 'node:assert/strict';
import { test } from 'node:test';
import { clickedFilter } from '../../../client/studio/edit/live/filter.ts';
import { type ChecksFile, GUIDELINES } from '../../../src/checks/index.ts';
import { passedCount } from '../../../src/studio/views/status.ts';
import { finding } from '../../helpers/studio/findings.ts';

const file = (over: Partial<ChecksFile>): ChecksFile => ({
  schemaVersion: 1,
  slug: 'shop',
  version: 1,
  checks: {
    build: 'ran',
    types: 'ran',
    ds: 'ran',
    a11y: 'ran',
    ui: 'ran',
    ux: 'ran',
    runtime: 'ran',
  },
  summary: { fix: 0, review: 0 },
  browser: null,
  notes: [],
  shots: [],
  findings: [],
  ...over,
});

const auto = (check: string): number =>
  GUIDELINES.filter((rule) => rule.mode === 'auto' && rule.check === check).length;

test('passed is the automatic rules of the checks that ran, less the ones with a finding', () => {
  const all = auto('a11y') + auto('ui') + auto('ux');
  assert.equal(passedCount(file({})), all);
  const some = GUIDELINES.find((rule) => rule.mode === 'auto' && rule.check === 'ui');
  assert.ok(some);
  const found = finding({ check: 'ui', rule: some.id });
  assert.equal(passedCount(file({ findings: [found] })), all - 1);
  assert.equal(passedCount(file({ waived: [{ ...found, reason: 'ok' }] })), all - 1);
});

test('a check that did not run passes nothing', () => {
  const skipped = file({}).checks;
  const none = { ...skipped, a11y: 'skipped', ui: 'skipped', ux: 'skipped' } as const;
  assert.equal(passedCount(file({ checks: none })), 0);
});

test('a pressed tile is let go, which shows every finding again', () => {
  assert.equal(clickedFilter('fix', 'fix'), 'all');
  assert.equal(clickedFilter('all', 'fix'), 'fix');
  assert.equal(clickedFilter('fix', 'review'), 'review');
});
