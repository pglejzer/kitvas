import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  addsToSelection,
  MAX_NODES,
  MAX_SELECTED,
  textEditOf,
} from '../../../client/channel/edit-protocol.ts';
import { parseFrameMessage, parseStudioMessage } from '../../../client/channel/protocol.ts';

const CHANNEL = 'abcdefghijklmnop';
const sent = (fields: Record<string, unknown>) => ({ kitvas: 1, channel: CHANNEL, ...fields });
const id = 'sections/Hero:section/Button.2';
const node = (name: string) => ({ id, parent: null, name, count: 1 });

test('the frame may report picks, hovers, keys, trees, styles and inline text', () => {
  const good = [
    { type: 'pick', id, add: true, double: false },
    { type: 'pick', id: null, add: false, double: false },
    { type: 'hovered', id: null },
    { type: 'key', key: 'parent' },
    { type: 'tree', request: 2, nodes: [{ id, parent: null, name: 'Buy', count: 3 }] },
    {
      type: 'inspected',
      request: 4,
      id,
      found: true,
      styles: { gap: '12px', color: 'rgb(0, 0, 0)' },
    },
    { type: 'text', id, value: "Don't wait" },
    { type: 'text', id, value: null },
    { type: 'text', id, value: 'Go', before: "Don't wait" },
    { type: 'copy-located', request: 3, id, path: [1, 0], text: 'SSO' },
    { type: 'copy-located', request: 3, id, path: [], text: '' },
    { type: 'copy-located', request: 3, id, path: null, text: null },
  ];
  for (const fields of good) {
    assert.deepEqual(parseFrameMessage(sent(fields), CHANNEL), sent(fields));
  }
});

test('the frame cannot say a copy is where no list could put it', () => {
  const bad = [
    { type: 'text', id, value: 'Go', before: 3 },
    { type: 'text', id, value: 'Go', before: 'x'.repeat(2001) },
    { type: 'copy-located', request: 3, id, path: [-1], text: 'SSO' },
    { type: 'copy-located', request: 3, id, path: [0.5], text: 'SSO' },
    { type: 'copy-located', request: 3, id, path: Array.from({ length: 9 }, () => 0), text: '' },
    { type: 'copy-located', request: 3, id, path: [0], text: 'x'.repeat(2001) },
    { type: 'copy-located', request: 3, id, text: 'SSO' },
  ];
  for (const fields of bad) {
    assert.equal(parseFrameMessage(sent(fields), CHANNEL), undefined, JSON.stringify(fields));
  }
});

test('Shift, Ctrl and Cmd add; a double click with one held edits no text', () => {
  const keys = { shiftKey: false, ctrlKey: false, metaKey: false };
  assert.equal(addsToSelection(keys), false);
  assert.equal(addsToSelection({ ...keys, ctrlKey: true }), true);
  assert.equal(addsToSelection({ ...keys, metaKey: true }), true);
  assert.equal(addsToSelection({ ...keys, shiftKey: true }), true);
  assert.equal(textEditOf({ id, add: false, double: true }), id);
  assert.equal(textEditOf({ id, add: true, double: true }), null);
  assert.equal(textEditOf({ id, add: false, double: false }), null);
  assert.equal(textEditOf({ id: null, add: false, double: true }), null);
});

test('the frame cannot send a bad edit message', () => {
  const bad = [
    { type: 'pick', id: '<b>', add: true, double: false },
    { type: 'pick', id, add: 'yes', double: false },
    { type: 'key', key: 'explode' },
    { type: 'tree', request: 1, nodes: Array.from({ length: MAX_NODES + 1 }, () => node('')) },
    { type: 'tree', request: 1, nodes: [node('x'.repeat(81))] },
    { type: 'inspected', request: 1, id, found: true, styles: { '--x': '1' } },
    { type: 'text', id, value: 'x'.repeat(2001) },
  ];
  for (const fields of bad) {
    assert.equal(parseFrameMessage(sent(fields), CHANNEL), undefined, String(fields.type));
  }
});

test('the page may tell the frame to edit, select, hover, read and preview', () => {
  const good = [
    { type: 'edit', on: true },
    { type: 'select', ids: [id] },
    { type: 'hover', id },
    { type: 'tree', request: 1 },
    { type: 'inspect', request: 2, id },
    { type: 'edit-text', id },
    { type: 'edit-text', id, item: 2 },
    { type: 'locate-copy', request: 5, id, roots: [] },
    { type: 'locate-copy', request: 5, id, item: 4, roots: ['sections/Plans:section/Card', id] },
    { type: 'text-back', id },
    {
      type: 'preview',
      changes: [
        { id, kind: 'style', property: 'gap', value: 'var(--kit-space-md)' },
        { id, kind: 'class', className: 'card', on: true },
        { id, kind: 'text', value: 'Hi' },
      ],
    },
    { type: 'unpreview' },
  ];
  for (const fields of good) {
    assert.deepEqual(parseStudioMessage(sent(fields), CHANNEL), sent(fields));
  }
});

test('the page cannot send a bad edit message', () => {
  const bad = [
    { type: 'edit', on: 1 },
    { type: 'select', ids: Array.from({ length: MAX_SELECTED + 1 }, () => id) },
    {
      type: 'preview',
      changes: [{ id, kind: 'style', property: 'gap', value: '1px; background: url(x)' }],
    },
    { type: 'preview', changes: [{ id, kind: 'class', className: 'Bad Class', on: true }] },
    { type: 'preview', changes: [{ id, kind: 'script' }] },
    { type: 'edit-text', id, item: -1 },
    { type: 'locate-copy', request: 5, id, roots: ['<b>'] },
    { type: 'locate-copy', request: 5, id, roots: Array.from({ length: 9 }, () => id) },
    { type: 'locate-copy', request: 5, id, item: 'one', roots: [] },
    { type: 'locate-copy', request: 5, id },
    { type: 'text-back', id: null },
  ];
  for (const fields of bad) {
    assert.equal(parseStudioMessage(sent(fields), CHANNEL), undefined, String(fields.type));
  }
});

test('an edit message on another channel is not ours', () => {
  const other = { ...sent({ type: 'hovered', id }), channel: 'ponmlkjihgfedcba' };
  assert.equal(parseFrameMessage(other, CHANNEL), undefined);
});
