// The ask bar's model and the rules of what is typed (redesign spec goal 10; plan 19, task T3;
// Review Focus 4): the modes, the chip, what is sent, and what Enter does.

import assert from 'node:assert/strict';
import { test } from 'node:test';
import { MAX_REQUEST_TEXT } from '../../../../../client/studio/edit/ai/requests.ts';
import { askModel, isSendKey, wordsToSend } from '../../../../../client/studio/edit/ask/model.ts';
import { initialState } from '../../../../../client/studio/edit/store.ts';

const say = (key: string, params?: Record<string, string | number>): string =>
  params ? `${key}:${JSON.stringify(params)}` : key;

const tree = [
  { id: 'hero', parent: null, name: 'Hero', count: 1 },
  { id: 'hero/btn', parent: 'hero', name: 'Button', count: 1 },
  { id: 'hero/h1', parent: 'hero', name: '', count: 1 },
];

function state(patch: Partial<ReturnType<typeof initialState>>) {
  return { ...initialState('shop'), tree, ...patch };
}

test('outside Edit the bar is off', () => {
  assert.equal(askModel(state({ on: false, selection: ['hero'] }), say).mode, 'off');
});

test('an older version being viewed hides the bar', () => {
  assert.equal(askModel(state({ on: true, viewing: 2, selection: ['hero'] }), say).mode, 'viewing');
});

test('nothing selected: select mode, no chip, and the placeholder says to select', () => {
  const model = askModel(state({ on: true }), say);
  assert.equal(model.mode, 'select');
  assert.equal(model.chip, null);
  assert.equal(model.placeholder, 'ask.placeholder.select');
});

test('one selected element: ready, the chip is its layer name', () => {
  const model = askModel(state({ on: true, selection: ['hero/btn'] }), say);
  assert.equal(model.mode, 'ready');
  assert.equal(model.chip, 'Button');
  assert.equal(model.placeholder, 'ask.placeholder.ready');
});

test('several selected elements: the chip counts them', () => {
  const model = askModel(state({ on: true, selection: ['hero', 'hero/btn', 'hero/h1'] }), say);
  assert.equal(model.mode, 'ready');
  assert.equal(model.chip, 'ask.chip.many:{"n":3}');
});

test('listening is any state but off', () => {
  const on = (listening: { state: 'off' | 'listening' | 'working'; since: string | null }) =>
    askModel(state({ on: true, listening }), say).listening;
  assert.equal(on({ state: 'off', since: null }), false);
  assert.equal(on({ state: 'listening', since: 'x' }), true);
  assert.equal(on({ state: 'working', since: 'x' }), true);
});

test('only spaces sends nothing', () => {
  assert.equal(wordsToSend(''), null);
  assert.equal(wordsToSend('   \n\t '), null);
});

test('words are trimmed and sent as they are', () => {
  assert.deepEqual(wordsToSend('  make it bigger  '), { words: 'make it bigger', cut: false });
});

test('1,200 pasted characters are cut at the request limit and say so', () => {
  const prepared = wordsToSend('a'.repeat(1_200));
  assert.equal(MAX_REQUEST_TEXT, 1_000);
  assert.equal(prepared?.words.length, 1_000);
  assert.equal(prepared?.cut, true);
});

test('exactly the limit is not cut', () => {
  assert.equal(wordsToSend('b'.repeat(1_000))?.cut, false);
});

test('Enter sends, except during an IME composition', () => {
  assert.equal(isSendKey({ key: 'Enter' }), true);
  assert.equal(isSendKey({ key: 'Enter', isComposing: true }), false);
  assert.equal(isSendKey({ key: 'Enter', keyCode: 229 }), false);
  assert.equal(isSendKey({ key: 'a' }), false);
});
