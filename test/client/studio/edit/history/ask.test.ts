import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  type AskSubject,
  askText,
  elementOf,
  hintKey,
  MAX_NOTE,
  noteOf,
  subjectOf,
} from '../../../../../client/studio/edit/history/ask.ts';
import type { EditOp, Refusal } from '../../../../../src/edit/index.ts';

const ID = 'sections/Hero:section/Stack';

function subject(op: EditOp, reason: AskSubject['reason'] = 'computed'): AskSubject {
  return { gesture: { ops: [op], label: 'x' }, index: 0, reason };
}

test('a prop change reads as "set gap to space.md" with the element', () => {
  const op: EditOp = {
    op: 'setProp',
    id: ID,
    name: 'gap',
    value: { kind: 'string', value: 'md' },
    before: { kind: 'string', value: 'sm' },
    after: null,
  };
  const words = askText(subject(op), null);
  assert.match(words, /element sections\/Hero:section\/Stack/);
  assert.match(words, /set gap to "md"/);
});

test('each op kind is worded', () => {
  const cases: [EditOp, RegExp][] = [
    [
      {
        op: 'removeProp',
        id: ID,
        name: 'tone',
        before: { kind: 'boolean', value: true },
        after: null,
      },
      /remove the tone prop/,
    ],
    [{ op: 'setText', id: ID, value: 'Hello', before: 'Hi' }, /change the text to "Hello"/],
    [
      {
        op: 'setStyle',
        id: ID,
        className: 'hero',
        property: 'gap',
        value: { token: '--kit-space-md' },
        before: null,
        newRule: false,
      },
      /set gap to space\.md in the class "hero"/,
    ],
    [
      {
        op: 'setStyle',
        id: ID,
        className: 'hero',
        property: 'gap',
        value: { raw: '13px' },
        before: null,
        newRule: false,
      },
      /set gap to 13px/,
    ],
    [
      {
        op: 'removeStyle',
        id: ID,
        className: 'hero',
        property: 'gap',
        before: { raw: '1px' },
        dropRule: false,
      },
      /remove gap from the class "hero"/,
    ],
    [{ op: 'addClass', id: ID, className: 'hero' }, /add the class "hero"/],
    [{ op: 'removeClass', id: ID, className: 'hero' }, /remove the class "hero"/],
  ];
  for (const [op, expected] of cases) assert.match(askText(subject(op), null), expected);
});

test('every reason has its own words', () => {
  const reasons: Array<Refusal | 'gone' | 'changed'> = [
    'computed',
    'spread',
    'not-found',
    'ambiguous',
    'no-text',
    'has-class',
    'no-classname',
    'utility',
    'nested',
    'invalid',
    'gone',
    'changed',
  ];
  const op: EditOp = { op: 'addClass', id: ID, className: 'hero' };
  const seen = new Set(reasons.map((reason) => askText(subject(op, reason), null)));
  assert.equal(seen.size, reasons.length);
});

test('a text written through its source says which copy of which lists it is', () => {
  const base = { op: 'setItemText' as const, id: ID, item: 0, before: 'SSO' };
  const nested = askText(subject({ ...base, item: 1, path: [1, 1], value: 'SAML' }), null);
  assert.match(nested, /change the text "SSO" in item 2 > 2 of the nested lists to "SAML"/);
  const one = askText(subject({ ...base, path: [0], value: 'SSO' }), null);
  // The text as it is, when no new text was typed yet.
  assert.match(one, /change the text "SSO" in item 1 of the list(?! to)/);
  assert.match(askText(subject({ ...base, path: [], value: 'Go' }), null), /"SSO" to "Go"/);
  // Without a path it is the list op of before.
  const old = askText(subject({ ...base, value: 'Go' }), null);
  assert.match(old, /change the text of item 1 of the list to "Go"/);
});

test('a text that cannot be typed in place is told why, other refusals keep the hint', () => {
  const text: EditOp = { op: 'setItemText', id: ID, item: 0, path: [0], value: 'a', before: 'a' };
  assert.equal(hintKey(subject(text, 'computed')), 'ask.text.computed');
  assert.equal(hintKey(subject(text, 'ambiguous')), 'ask.text.ambiguous');
  assert.equal(hintKey(subject(text, 'list-item-gone')), 'ask.text.list-item-gone');
  const plain: EditOp = { op: 'setText', id: ID, value: 'b', before: 'a' };
  assert.equal(hintKey(subject(plain, 'no-text')), 'ask.text.no-text');
  assert.equal(hintKey(subject(text, 'locked')), 'ask.hint');
  const style: EditOp = { op: 'addClass', id: ID, className: 'a' };
  assert.equal(hintKey(subject(style, 'computed')), 'ask.hint');
});

test('the note stays under the inbox limit', () => {
  const op: EditOp = { op: 'setText', id: ID, value: 'x'.repeat(2_000), before: 'y' };
  const long = {
    gesture: { ops: [op, op, op, op], label: 'x' },
    index: 0,
    reason: 'invalid' as const,
  };
  assert.ok(askText(long, null).length <= MAX_NOTE);
});

test('the note points at the element of the refused op', () => {
  const first: EditOp = { op: 'addClass', id: ID, className: 'a' };
  const second: EditOp = { op: 'addClass', id: 'sections/Hero:section/Text', className: 'b' };
  const picked: AskSubject = {
    gesture: { ops: [first, second], label: 'x' },
    index: 1,
    reason: 'invalid',
  };
  assert.equal(elementOf(picked), 'sections/Hero:section/Text');
  const note = noteOf('shop', picked, null);
  assert.equal(note.kind, 'note');
  assert.equal(note.slug, 'shop');
  assert.equal(note.element, 'sections/Hero:section/Text');
});

test('only a refusal or a conflict with a gone place is asked about', () => {
  const gesture = { ops: [{ op: 'addClass', id: ID, className: 'a' } as const], label: 'x' };
  assert.equal(subjectOf(null, null), null);
  assert.equal(subjectOf({ gesture, index: 0, reason: 'computed' }, null)?.reason, 'computed');
  const outcome = {
    outcome: 'conflict',
    version: 2,
    index: 0,
    reason: 'gone',
    file: 'src/tsx/sections/Hero.tsx',
    text: '',
    etag: '"AAAAAAAAAAAAAAAAAAAAAAAAAAA"',
  } as const;
  assert.equal(subjectOf(null, { gesture, outcome })?.reason, 'gone');
  assert.equal(subjectOf(null, { gesture, outcome: { ...outcome, reason: 'changed' } }), null);
});
