import assert from 'node:assert/strict';
import { test } from 'node:test';
import { parseFrameMessage, parseStudioMessage } from '../../../client/channel/protocol.ts';
import {
  MAX_HANDLE_PROPERTIES,
  MAX_IDS,
  MAX_ITEM,
  parseStructureFrame,
  parseStructureStudio,
} from '../../../client/channel/structure-protocol.ts';

const CHANNEL = 'abcdefghijklmnop';
const head = { kitvas: 1, channel: CHANNEL };
const id = 'sections/Pricing:section/Stack/Card';
const entry = {
  id,
  movable: false,
  item: true,
  accepts: true,
  mixed: false,
  interactive: false,
  root: null,
};

test('the frame may say a list item was dropped at another place', () => {
  const good = [
    { type: 'reorder', id, item: 0, to: 2 },
    { type: 'reorder', id, item: MAX_ITEM, to: 0 },
  ];
  for (const fields of good) {
    assert.deepEqual(parseStructureFrame(fields, CHANNEL), { ...head, ...fields });
    // And through the whole channel, as the page hears it.
    assert.deepEqual(parseFrameMessage({ ...head, ...fields }, CHANNEL), { ...head, ...fields });
  }
});

test('a reorder names an element and two places in the list, nothing else', () => {
  const bad = [
    { type: 'reorder', id: '<b>', item: 0, to: 1 },
    { type: 'reorder', id, item: -1, to: 1 },
    { type: 'reorder', id, item: 0.5, to: 1 },
    { type: 'reorder', id, item: 0, to: MAX_ITEM + 1 },
    { type: 'reorder', id, item: '0', to: 1 },
    { type: 'reorder', id, item: 0 },
    { type: 'reorder', id, item: 0, to: Number.NaN },
  ];
  for (const [index, fields] of bad.entries()) {
    assert.equal(parseStructureFrame(fields, CHANNEL), undefined, `reorder ${index}`);
  }
  // What is not in the message's shape does not go through.
  assert.deepEqual(parseStructureFrame({ type: 'reorder', id, item: 1, to: 0, x: 4 }, CHANNEL), {
    ...head,
    type: 'reorder',
    id,
    item: 1,
    to: 0,
  });
});

test('a rectangle may take nothing, and says whether it adds', () => {
  assert.deepEqual(parseStructureFrame({ type: 'rect', ids: [], add: false }, CHANNEL), {
    ...head,
    type: 'rect',
    ids: [],
    add: false,
  });
  assert.deepEqual(parseStructureFrame({ type: 'rect', ids: [id], add: true }, CHANNEL), {
    ...head,
    type: 'rect',
    ids: [id],
    add: true,
  });
  const many = Array.from({ length: MAX_IDS + 1 }, (_, index) => `${id}.${index}`);
  const bad = [
    { type: 'rect', ids: many, add: false },
    { type: 'rect', ids: [id] },
    { type: 'rect', ids: ['<b>'], add: false },
    { type: 'rect', ids: [id], add: 'yes' },
  ];
  for (const [index, fields] of bad.entries()) {
    assert.equal(parseStructureFrame(fields, CHANNEL), undefined, `rect ${index}`);
  }
});

test('the page says which handles an element cannot take and which take steps only', () => {
  const good = [
    { type: 'handles', on: true, blocked: [], stepped: [] },
    { type: 'handles', on: true, blocked: ['width', 'height'], stepped: ['gap'] },
    { type: 'handles', on: false, blocked: ['padding-top'], stepped: [] },
  ];
  for (const fields of good) {
    assert.deepEqual(parseStructureStudio(fields, CHANNEL), { ...head, ...fields });
    assert.deepEqual(parseStudioMessage({ ...head, ...fields }, CHANNEL), { ...head, ...fields });
  }
});

test('a handles message without its two lists of property names is refused', () => {
  const names = Array.from({ length: MAX_HANDLE_PROPERTIES + 1 }, () => 'gap');
  const bad = [
    { type: 'handles', on: true },
    { type: 'handles', on: true, blocked: [] },
    { type: 'handles', on: true, stepped: [] },
    { type: 'handles', on: 'yes', blocked: [], stepped: [] },
    { type: 'handles', on: true, blocked: 'width', stepped: [] },
    { type: 'handles', on: true, blocked: [4], stepped: [] },
    { type: 'handles', on: true, blocked: ['--kit-space-md'], stepped: [] },
    { type: 'handles', on: true, blocked: ['width;color'], stepped: [] },
    { type: 'handles', on: true, blocked: ['Width'], stepped: [] },
    { type: 'handles', on: true, blocked: [], stepped: names },
  ];
  for (const [index, fields] of bad.entries()) {
    assert.equal(parseStructureStudio(fields, CHANNEL), undefined, `handles ${index}`);
  }
});

test('a structure entry says whether the element is a list item', () => {
  const fields = { type: 'structure', entries: [entry, { ...entry, item: false }] };
  assert.deepEqual(parseStructureStudio(fields, CHANNEL), { ...head, ...fields });
  // An entry that leaves it out is a bad entry: the whole message is refused.
  const silent = {
    id,
    movable: false,
    accepts: true,
    mixed: false,
    interactive: false,
    root: null,
  };
  const bad = [silent, { ...entry, item: 'yes' }, { ...entry, item: 1 }];
  for (const [index, one] of bad.entries()) {
    const message = { type: 'structure', entries: [entry, one] };
    assert.equal(parseStructureStudio(message, CHANNEL), undefined, `entry ${index}`);
  }
});
