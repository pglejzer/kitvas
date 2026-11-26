// Sending a request to Claude through the Claude tab's control (redesign spec, goal 10; plan 19,
// task 4): a `say` with the words or an `improve`, about the selection, never about an older
// version; each says whether it went, and a sent one has the tab read the requests again.

import assert from 'node:assert/strict';
import { test } from 'node:test';
import { MAX_REQUEST_TEXT } from '../../../../../client/studio/edit/ai/requests.ts';
import { createSender } from '../../../../../client/studio/edit/ai/send.ts';
import type { EditorState } from '../../../../../client/studio/edit/store.ts';
import type { NewRequest } from '../../../../../src/studio/api/requests/request-schemas.ts';

const ID = 'sections/Hero:section/Stack/Button';
/** The edit context goes with the request whole: the card's width and the bar's option value. */
const CONTEXT = { width: 768, state: null, option: { id: 'theme', value: 'dark' } };

function harness(answer = true) {
  const state: Pick<EditorState, 'selection' | 'context' | 'viewing'> = {
    selection: [ID],
    context: CONTEXT,
    viewing: null,
  };
  const posted: NewRequest[] = [];
  let reads = 0;
  const sender = createSender({
    state: () => state,
    post: async (body) => {
      posted.push(body);
      return answer;
    },
    sent: () => {
      reads += 1;
    },
  });
  return { sender, state, posted, reads: () => reads };
}

test('words go as a `say` request about the selection, with the edit context', async () => {
  const h = harness();
  assert.equal(await h.sender.send('  Make it bolder  '), true);
  assert.deepEqual(h.posted, [
    { kind: 'say', elements: [ID], context: CONTEXT, text: 'Make it bolder' },
  ]);
  assert.equal(h.reads(), 1);
});

test('Improve goes as an `improve` request with no words', async () => {
  const h = harness();
  assert.equal(await h.sender.improve(), true);
  assert.equal(h.posted[0]?.kind, 'improve');
  assert.equal(h.posted[0]?.text, '');
});

test('only spaces, no selection or an older version shown: nothing is sent', async () => {
  const h = harness();
  assert.equal(await h.sender.send('   '), false);
  h.state.selection = [];
  assert.equal(await h.sender.send('Bolder'), false);
  assert.equal(await h.sender.improve(), false);
  h.state.selection = [ID];
  h.state.viewing = 2;
  assert.equal(await h.sender.send('Bolder'), false);
  assert.equal(await h.sender.improve(), false);
  assert.deepEqual(h.posted, []);
  assert.equal(h.reads(), 0);
});

test('long words are cut at the limit', async () => {
  const h = harness();
  await h.sender.send('x'.repeat(MAX_REQUEST_TEXT + 200));
  assert.equal(h.posted[0]?.text.length, MAX_REQUEST_TEXT);
});

test('a request the studio refused says so, and nothing is read again', async () => {
  const h = harness(false);
  assert.equal(await h.sender.send('Bolder'), false);
  assert.equal(h.posted.length, 1);
  assert.equal(h.reads(), 0);
});
