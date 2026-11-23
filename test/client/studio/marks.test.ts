import assert from 'node:assert/strict';
import { test } from 'node:test';
import { MAX_ITEMS, type Mark } from '../../../client/channel/protocol.ts';
import { marksFromNotes, type NoteInfo, pageMarks } from '../../../client/studio/marks.ts';

function note(element: string | undefined, label: string, tone: string | undefined): NoteInfo {
  return { element, label, tone };
}

test('each note on an element gives a mark with its number and tone', () => {
  const notes = [
    note('a:main/Button', '1', 'fix'),
    note(undefined, '2', 'fix'),
    note('a:main/h1', ' 3 ', 'review'),
  ];
  assert.deepEqual(marksFromNotes(notes), [
    { id: 'a:main/Button', label: '1', tone: 'fix' },
    { id: 'a:main/h1', label: '3', tone: 'review' },
  ]);
});

test('no notes give no marks', () => {
  assert.deepEqual(marksFromNotes([]), []);
});

test('a note the frame would refuse gives no mark', () => {
  const notes = [
    note('a:main', '1', 'changed'),
    note('a:main', '2', undefined),
    note('a main', '3', 'fix'),
    note('', '4', 'fix'),
    note('a:main', '123456789', 'fix'),
    note('a:main', '5', 'review'),
  ];
  assert.deepEqual(marksFromNotes(notes), [{ id: 'a:main', label: '5', tone: 'review' }]);
});

test('compare adds ~ on changed and + on added elements after the findings', () => {
  const findings: Mark[] = [{ id: 'a:main', label: '1', tone: 'fix' }];
  const diff = { changed: ['a:main', 'a:main/p'], added: ['a:main/new'], removed: ['a:old'] };
  assert.deepEqual(pageMarks(findings, diff), [
    { id: 'a:main', label: '1', tone: 'fix' },
    { id: 'a:main', label: '~', tone: 'changed' },
    { id: 'a:main/p', label: '~', tone: 'changed' },
    { id: 'a:main/new', label: '+', tone: 'added' },
  ]);
  assert.deepEqual(pageMarks(findings, undefined), findings);
});

test('marks stop at the protocol limit, findings first', () => {
  const findings: Mark[] = [{ id: 'a:main', label: '1', tone: 'fix' }];
  const many = Array.from({ length: MAX_ITEMS + 5 }, (_, index) => `a:item-${index}`);
  const marks = pageMarks(findings, { changed: many, added: ['a:late'], removed: [] });
  assert.equal(marks.length, MAX_ITEMS);
  assert.deepEqual(marks[0], findings[0]);
  assert.equal(
    marks.some((mark) => mark.id === 'a:late'),
    false,
  );
});
