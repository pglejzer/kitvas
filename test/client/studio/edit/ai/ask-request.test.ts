// Ask Claude as a request (spec 4d, goal 1; plan 17, task B): a refused edit goes to Claude as an
// `ask` request of the draft, with the ops the person wanted, their words and the edit context,
// within the request's limits, so the AI tab shows it and its answer.

import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  MAX_REQUEST_TEXT,
  MAX_VARIANT_CHANGES,
} from '../../../../../client/studio/edit/ai/requests.ts';
import {
  type AskSubject,
  askRequestOf,
  askText,
} from '../../../../../client/studio/edit/history/ask.ts';
import type { EditOp } from '../../../../../src/edit/index.ts';
import { NewRequestSchema } from '../../../../../src/studio/api/requests/request-schemas.ts';

const ID = 'sections/Hero:section/Stack';
const OTHER = 'sections/Hero:section/Stack/Text';

const addClass = (id: string, className = 'hero'): EditOp => ({ op: 'addClass', id, className });

test('Ask Claude sends an `ask` request with the refused ops, their words and the context', () => {
  const op: EditOp = {
    op: 'setStyle',
    id: ID,
    className: 'hero',
    property: 'gap',
    value: { token: '--kit-space-md' },
    before: null,
    newRule: false,
  };
  const subject: AskSubject = { gesture: { ops: [op], label: 'Gap' }, index: 0, reason: 'nested' };
  const context = { width: 768, state: null };
  const body = askRequestOf(subject, null, context);
  assert.equal(body.kind, 'ask');
  assert.deepEqual(body.elements, [ID]);
  assert.deepEqual(body.context, context);
  assert.notEqual(body.context, context);
  assert.deepEqual(body.ops, [op]);
  assert.match(body.text, /set gap to space\.md in the class "hero"/);
  assert.match(body.text, /nested block/);
  assert.equal(NewRequestSchema.safeParse(body).success, true);
});

test('the element of the refused op comes first, and every element is named once', () => {
  const subject: AskSubject = {
    gesture: { ops: [addClass(OTHER), addClass(ID), addClass(OTHER, 'lead')], label: 'x' },
    index: 1,
    reason: 'invalid',
  };
  const body = askRequestOf(subject, null, { width: null, state: null });
  assert.deepEqual(body.elements, [ID, OTHER]);
});

test('a long change is cut short, so the reason reaches Claude within the limit', () => {
  const op: EditOp = { op: 'setText', id: ID, value: 'x'.repeat(2_000), before: 'y' };
  const subject: AskSubject = { gesture: { ops: [op, op], label: 'x' }, index: 0, reason: 'mixed' };
  const body = askRequestOf(subject, null, { width: null, state: null });
  assert.ok(body.text.length <= MAX_REQUEST_TEXT);
  assert.match(body.text, /could not write it itself because the target mixes text and elements/);
  assert.equal(NewRequestSchema.safeParse(body).success, true);
  // The inbox note keeps its own, larger limit.
  assert.ok(askText(subject, null).length > MAX_REQUEST_TEXT);
});

test('a gesture of more ops than a request carries sends the first ones', () => {
  const ops = Array.from({ length: 45 }, (_, n) => addClass(`${ID}.${n}`));
  const subject: AskSubject = { gesture: { ops, label: 'x' }, index: 0, reason: 'invalid' };
  const body = askRequestOf(subject, null, { width: null, state: null });
  assert.equal(body.ops?.length, MAX_VARIANT_CHANGES);
  assert.equal(NewRequestSchema.safeParse(body).success, true);
});
