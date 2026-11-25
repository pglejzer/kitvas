// The marks a draft page sends (plan 19, task 1): compare's outlines alone, in every lens. The
// findings' numbered dots are the Checks lens's pins now (`test/client/studio/lens/send.test.ts`).

import assert from 'node:assert/strict';
import { test } from 'node:test';
import { MAX_ITEMS, parseStudioMessage } from '../../../../client/channel/protocol.ts';
import { pageMarks } from '../../../../client/studio/draft/marks.ts';

test('compare marks ~ on changed and + on added elements, and nothing on removed ones', () => {
  const diff = { changed: ['a:main', 'a:main/p'], added: ['a:main/new'], removed: ['a:old'] };
  assert.deepEqual(pageMarks(diff), [
    { id: 'a:main', label: '~', tone: 'changed' },
    { id: 'a:main/p', label: '~', tone: 'changed' },
    { id: 'a:main/new', label: '+', tone: 'added' },
  ]);
  const message = { kitvas: 1, channel: 'mark-check', type: 'marks', marks: pageMarks(diff) };
  assert.ok(parseStudioMessage(message, 'mark-check'), 'a frame takes them');
});

test('without compare the page sends no marks: no finding gets a numbered dot', () => {
  assert.deepEqual(pageMarks(undefined), []);
  assert.deepEqual(pageMarks({ changed: [], added: [], removed: [] }), []);
});

test('marks stop at the protocol limit, the changed ones first', () => {
  const many = Array.from({ length: MAX_ITEMS + 5 }, (_, index) => `a:item-${index}`);
  const marks = pageMarks({ changed: many, added: ['a:late'], removed: [] });
  assert.equal(marks.length, MAX_ITEMS);
  assert.equal(
    marks.some((mark) => mark.id === 'a:late'),
    false,
  );
});
