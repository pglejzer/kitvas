import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  EDIT_LOCKED_CHANGED,
  type ElementNow,
  guidelineFor,
  LOCK_RULE_IDS,
  lockedChangedFindings,
  lockStates,
} from '../../../src/checks/index.ts';

const FILE = 'src/tsx/sections/Hero.tsx';
const BADGE = 'sections/Hero:section/Stack/Badge';
const KEPT = '<Badge tone="info">\n          New\n        </Badge>';

const element = (id: string, source: string, line = 9): ElementNow => ({
  id,
  file: FILE,
  line,
  column: 9,
  source,
});

test('a locked element moved with its parent, so only indented again, is unchanged', () => {
  const now = element(BADGE, '<Badge tone="info">\n            New\n          </Badge>');
  const [state] = lockStates([{ id: BADGE, text: KEPT }], [now]);
  assert.equal(state?.state, 'same');
  assert.deepEqual(lockedChangedFindings(lockStates([{ id: BADGE, text: KEPT }], [now])), []);
});

test('a locked element another writer rewrote is changed, on its element', () => {
  const now = element(BADGE, '<Badge tone="warning">Sale</Badge>', 12);
  const states = lockStates([{ id: BADGE, text: KEPT }], [now]);
  assert.equal(states[0]?.state, 'changed');
  assert.deepEqual(lockedChangedFindings(states), [
    {
      check: 'ds',
      rule: 'edit/locked-changed',
      severity: 'fix',
      file: FILE,
      line: 12,
      column: 9,
      element: BADGE,
      message: { key: 'checkRule.editLockedChanged', params: {} },
      hint: { key: 'checkHint.editLockedChanged', params: {} },
      states: [],
      widths: [],
    },
  ]);
});

test('a locked element another writer moved keeps its lock under its new id', () => {
  const moved = 'sections/Hero:section/Badge';
  const states = lockStates(
    [{ id: BADGE, text: KEPT }],
    [element(moved, KEPT), element('sections/Hero:section/Text', '<Text>Hi</Text>')],
  );
  assert.equal(states[0]?.state, 'same');
  assert.equal(states[0]?.element?.id, moved);
});

test('a lock whose element is nowhere is lost, a finding with no element', () => {
  const states = lockStates(
    [{ id: BADGE, text: KEPT }],
    [element('sections/Hero:section', '<section />')],
  );
  assert.deepEqual(
    states.map((one) => [one.state, one.element]),
    [['lost', null]],
  );
  const [finding] = lockedChangedFindings(states);
  assert.equal(finding?.element, null);
  assert.equal(finding?.file, FILE);
  assert.deepEqual(finding?.message, { key: 'checkRule.editLockedLost', params: { id: BADGE } });
});

test('one element serves one lock: two locks with the same source take two elements', () => {
  const same = '<Text>Hi</Text>';
  const first = 'sections/Hero:section/Text';
  const second = 'sections/Hero:section/Text.2';
  const states = lockStates(
    [
      { id: first, text: same },
      { id: second, text: same },
    ],
    [element(first, same), element(second, same)],
  );
  assert.deepEqual(
    states.map((one) => [one.state, one.element?.id]),
    [
      ['same', first],
      ['same', second],
    ],
  );
});

test('the rule is in the guideline book as an automatic fix of the editor', () => {
  assert.deepEqual(LOCK_RULE_IDS, ['edit/locked-changed']);
  assert.equal(guidelineFor('edit/locked-changed'), EDIT_LOCKED_CHANGED);
  assert.equal(EDIT_LOCKED_CHANGED.severity, 'fix');
  assert.equal(EDIT_LOCKED_CHANGED.mode, 'auto');
});
