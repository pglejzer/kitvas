import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  FORM_GAP,
  menuAnchor,
  placeBeside,
  placeBesidePanel,
  savesNote,
} from '../../../../../client/studio/edit/notes/place.ts';

const view = { width: 1200, height: 800 };
const size = { width: 400, height: 300 };

test('Ctrl+Enter and Cmd+Enter save, Enter alone does not', () => {
  assert.equal(savesNote({ key: 'Enter', ctrlKey: true, metaKey: false }), true);
  assert.equal(savesNote({ key: 'Enter', ctrlKey: false, metaKey: true }), true);
  assert.equal(savesNote({ key: 'Enter', ctrlKey: false, metaKey: false }), false);
  assert.equal(savesNote({ key: 'a', ctrlKey: true, metaKey: false }), false);
  assert.equal(
    savesNote({ key: 'Enter', ctrlKey: true, metaKey: false, isComposing: true }),
    false,
  );
});

test('a form opened from a menu stands beside the element, else at the click', () => {
  const box = { x: 10, y: 20, width: 300, height: 40 };
  assert.deepEqual(menuAnchor({ x: 50, y: 30, box }), box);
  assert.deepEqual(menuAnchor({ x: 50, y: 30 }), { x: 50, y: 30, width: 0, height: 0 });
});

test('the form stands to the right of the element when it fits', () => {
  const at = placeBeside({ x: 100, y: 100, width: 200, height: 50 }, size, view);
  assert.deepEqual(at, { left: 300 + FORM_GAP, top: 100 });
});

test('the form stands to the left when the right has no room', () => {
  const at = placeBeside({ x: 800, y: 100, width: 300, height: 50 }, size, view);
  assert.deepEqual(at, { left: 800 - FORM_GAP - 400, top: 100 });
});

test('the form stands under the element when neither side has room', () => {
  const at = placeBeside({ x: 100, y: 50, width: 1000, height: 50 }, size, view);
  assert.deepEqual(at, { left: 100, top: 50 + 50 + FORM_GAP });
});

test('the form stays inside the window', () => {
  const at = placeBeside({ x: 100, y: 790, width: 10, height: 10 }, size, view);
  assert.equal(at.top, view.height - size.height - FORM_GAP);
});

test('with no element the form stands at the notes panel side of the canvas', () => {
  const right = placeBesidePanel({ x: 900, y: 0, width: 300, height: 800 }, size, view);
  assert.deepEqual(right, { left: 900 - FORM_GAP - 400, top: 250 });
  const left = placeBesidePanel({ x: 0, y: 0, width: 300, height: 800 }, size, view);
  assert.deepEqual(left, { left: 300 + FORM_GAP, top: 250 });
});
