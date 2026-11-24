import assert from 'node:assert/strict';
import { test } from 'node:test';
import { MAX_NODES, MAX_SELECTED } from '../../../client/channel/edit-protocol.ts';
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
  ];
  for (const fields of good) {
    assert.deepEqual(parseFrameMessage(sent(fields), CHANNEL), sent(fields));
  }
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
  ];
  for (const fields of bad) {
    assert.equal(parseStudioMessage(sent(fields), CHANNEL), undefined, String(fields.type));
  }
});

test('an edit message on another channel is not ours', () => {
  const other = { ...sent({ type: 'hovered', id }), channel: 'ponmlkjihgfedcba' };
  assert.equal(parseFrameMessage(other, CHANNEL), undefined);
});
