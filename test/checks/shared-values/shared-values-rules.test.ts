import assert from 'node:assert/strict';
import { test } from 'node:test';
import { SHARED_RULE_IDS, sharedUnusedFindings } from '../../../src/checks/index.ts';
import type { SharedValue } from '../../../src/shared/index.ts';

const pick = (id: string): SharedValue => ({
  id,
  label: id,
  default: 'a',
  values: [
    { id: 'a', label: 'A' },
    { id: 'b', label: 'B' },
  ],
});
const text = (id: string): SharedValue => ({ id, label: id, default: '', values: null });

const file = (name: string, source: string) => ({
  file: `src/tsx/sections/${name}.tsx`,
  text: source,
});
const keys = (found: ReturnType<typeof sharedUnusedFindings>): string[] =>
  found.map((one) => `${one.message.key}:${one.message.params.id}`);

test('the rule id is the one of the contract', () => {
  assert.deepEqual(SHARED_RULE_IDS, ['ux/shared-unused']);
});

test('a value that one section sets and another reads gives nothing', () => {
  const found = sharedUnusedFindings(
    [
      file('Filter', 'onClick={() => setShared({ range: "b" })}'),
      file('Chart', '<p>{shared.range}</p>'),
    ],
    [pick('range')],
  );
  assert.deepEqual(found, []);
});

test('read only is unset, set only is unread, neither is both', () => {
  const read = file('A', '<p>{shared.range}</p>');
  const set = file('B', 'setShared({ range: "b" })');
  assert.deepEqual(keys(sharedUnusedFindings([read], [pick('range')])), [
    'checkRule.uxSharedUnused:range',
  ]);
  assert.deepEqual(keys(sharedUnusedFindings([set], [pick('range')])), [
    'checkRule.uxSharedUnread:range',
  ]);
  assert.deepEqual(keys(sharedUnusedFindings([file('C', '<p/>')], [pick('range')])), [
    'checkRule.uxSharedUnused:range',
    'checkRule.uxSharedUnread:range',
  ]);
});

test('a finding is a fix in the ux check, filed on the shared file', () => {
  const [one] = sharedUnusedFindings([], [pick('range')]);
  assert.equal(one?.check, 'ux');
  assert.equal(one?.rule, 'ux/shared-unused');
  assert.equal(one?.severity, 'fix');
  assert.equal(one?.file, 'src/json/shared.json');
  assert.equal(one?.line, 0);
  assert.equal(one?.column, 0);
  assert.equal(one?.hint.key, 'checkHint.uxSharedUnused');
});

test('a mention only inside a comment does not count', () => {
  const found = sharedUnusedFindings(
    [file('A', '// setShared({ range: "b" })\n/* shared.range */\n<p/>')],
    [pick('range')],
  );
  assert.equal(found.length, 2);
});

test('a shorthand key and a quoted key count as set; the bracket forms count as read', () => {
  const found = sharedUnusedFindings(
    [
      file('A', 'setShared({ range })'),
      file('B', 'setShared({ \'plan-kind\': next, "query": q })'),
      file('C', 'shared[\'plan-kind\'] + shared["query"] + shared.range'),
    ],
    [pick('range'), pick('plan-kind'), text('query')],
  );
  assert.deepEqual(found, []);
});

test('an id that is a prefix of another is not mixed up with it', () => {
  const set = file('A', 'setShared({ rangeEnd: "b" }); setShared({ "plan-kind": "b" })');
  const read = file('B', "shared.rangeEnd; shared['plan-kind']");
  assert.deepEqual(
    keys(
      sharedUnusedFindings(
        [set, read],
        [pick('range'), pick('rangeEnd'), pick('plan'), pick('plan-kind')],
      ),
    ),
    [
      'checkRule.uxSharedUnused:range',
      'checkRule.uxSharedUnread:range',
      'checkRule.uxSharedUnused:plan',
      'checkRule.uxSharedUnread:plan',
    ],
  );
});

test('the entry and the generated type are not read, and no shared values gives nothing', () => {
  const entry = { file: 'src/tsx/index.tsx', text: 'setShared({ range }); shared.range' };
  const generated = { file: 'src/tsx/shared.ts', text: 'shared.range setShared({ range })' };
  assert.equal(sharedUnusedFindings([entry, generated], [pick('range')]).length, 2);
  assert.deepEqual(sharedUnusedFindings([file('A', 'shared.range')], []), []);
});
