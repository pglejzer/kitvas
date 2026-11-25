import assert from 'node:assert/strict';
import { test } from 'node:test';
import { parseFrameMessage, parseStudioMessage } from '../../../client/channel/protocol.ts';
import {
  MAX_HANDLE_PROPERTIES,
  MAX_ITEM,
  MAX_LISTS,
  MAX_PICKS,
  parseStructureFrame,
  parseStructureStudio,
} from '../../../client/channel/structure-protocol.ts';

const CHANNEL = 'abcdefghijklmnop';
const head = { kitvas: 1, channel: CHANNEL };
const id = 'sections/Pricing:section/Stack/Card';
const row = `${id}/ul/li`;
const entry = {
  id,
  movable: false,
  lists: [id],
  item: true,
  accepts: true,
  mixed: false,
  interactive: false,
  root: null,
};

test('the frame may say a list item was dropped at another place', () => {
  const good = [
    { type: 'reorder', id, from: [0], to: [2] },
    { type: 'reorder', id: row, from: [2, MAX_ITEM], to: [0, 0] },
  ];
  for (const fields of good) {
    assert.deepEqual(parseStructureFrame(fields, CHANNEL), { ...head, ...fields });
    // And through the whole channel, as the page hears it.
    assert.deepEqual(parseFrameMessage({ ...head, ...fields }, CHANNEL), { ...head, ...fields });
  }
});

test('a reorder names an element and two paths of one length, nothing else', () => {
  const deep = Array.from({ length: MAX_LISTS + 1 }, () => 0);
  const bad = [
    { type: 'reorder', id: '<b>', from: [0], to: [1] },
    { type: 'reorder', id, from: [-1], to: [1] },
    { type: 'reorder', id, from: [0.5], to: [1] },
    { type: 'reorder', id, from: [0], to: [MAX_ITEM + 1] },
    { type: 'reorder', id, from: ['0'], to: [1] },
    { type: 'reorder', id, from: [0] },
    { type: 'reorder', id, from: [0], to: [Number.NaN] },
    // Two paths of another length name two different lists.
    { type: 'reorder', id, from: [0, 1], to: [1] },
    // A path names a list: an item of no list cannot be reordered.
    { type: 'reorder', id, from: [], to: [] },
    { type: 'reorder', id, from: deep, to: deep },
    // The message before ADR 0065.
    { type: 'reorder', id, item: 0, to: 1 },
  ];
  for (const [index, fields] of bad.entries()) {
    assert.equal(parseStructureFrame(fields, CHANNEL), undefined, `reorder ${index}`);
  }
  // What is not in the message's shape does not go through.
  assert.deepEqual(
    parseStructureFrame({ type: 'reorder', id, from: [1], to: [0], x: 4 }, CHANNEL),
    { ...head, type: 'reorder', id, from: [1], to: [0] },
  );
});

test('a rectangle may take nothing, names copies, and says whether it adds', () => {
  assert.deepEqual(parseStructureFrame({ type: 'rect', picks: [], add: false }, CHANNEL), {
    ...head,
    type: 'rect',
    picks: [],
    add: false,
  });
  const picks = [{ id }, { id: row, item: 4 }, { id: row, item: 5, path: [1, 2] }];
  assert.deepEqual(parseStructureFrame({ type: 'rect', picks, add: true }, CHANNEL), {
    ...head,
    type: 'rect',
    picks,
    add: true,
  });
  // A copy carries its id, its item and its path, nothing else.
  assert.deepEqual(
    parseStructureFrame({ type: 'rect', picks: [{ id, item: 1, x: 4 }], add: false }, CHANNEL),
    { ...head, type: 'rect', picks: [{ id, item: 1 }], add: false },
  );
  const full = Array.from({ length: MAX_PICKS }, (_, item) => ({ id: row, item }));
  const taken = parseStructureFrame({ type: 'rect', picks: full, add: false }, CHANNEL);
  assert.equal(taken?.type, 'rect');
  const many = Array.from({ length: MAX_PICKS + 1 }, (_, item) => ({ id: row, item }));
  const bad = [
    { type: 'rect', picks: many, add: false },
    { type: 'rect', picks: [{ id }] },
    { type: 'rect', picks: [{ id: '<b>' }], add: false },
    { type: 'rect', picks: [{ id }], add: 'yes' },
    { type: 'rect', picks: [id], add: false },
    { type: 'rect', picks: [{ id, item: -1 }], add: false },
    { type: 'rect', picks: [{ id, path: [0.5] }], add: false },
    // The message before ADR 0065 named ids.
    { type: 'rect', ids: [id], add: false },
  ];
  for (const [index, fields] of bad.entries()) {
    assert.equal(parseStructureFrame(fields, CHANNEL), undefined, `rect ${index}`);
  }
});

test('a context menu may name the copy and the box under the pointer', () => {
  const base = { type: 'menu', id: row, x: 5, y: 6 };
  const box = { x: 1, y: 2, width: 30, height: 0 };
  assert.deepEqual(parseStructureFrame(base, CHANNEL), { ...head, ...base });
  assert.deepEqual(parseStructureFrame({ ...base, id: null }, CHANNEL), {
    ...head,
    ...base,
    id: null,
  });
  const full = { ...base, item: 3, path: [1, 3], box };
  assert.deepEqual(parseStructureFrame(full, CHANNEL), { ...head, ...full });
  assert.deepEqual(parseFrameMessage({ ...head, ...full }, CHANNEL), { ...head, ...full });
  // Fields that are absent stay absent.
  const parsed = parseStructureFrame(base, CHANNEL);
  assert.ok(parsed && !('item' in parsed) && !('path' in parsed) && !('box' in parsed));
  const bad = [
    { ...base, box: { ...box, width: -1 } },
    { ...base, box: { ...box, height: -1 } },
    { ...base, box: { x: 1, y: 2, width: 3 } },
    { ...base, box: 'big' },
    { ...base, box: { ...box, x: Number.NaN } },
    { ...base, item: -1 },
    { ...base, item: 1.5 },
    { ...base, path: [0.5] },
    { ...base, path: 'a' },
    { ...base, path: Array.from({ length: MAX_LISTS + 1 }, () => 0) },
  ];
  for (const [index, fields] of bad.entries()) {
    assert.equal(parseStructureFrame(fields, CHANNEL), undefined, `menu ${index}`);
  }
});

test('the page may pass on a release it heard over the frame', () => {
  const good = [
    { type: 'release', x: 40, y: 60.5, shift: false, alt: false },
    { type: 'release', x: 0, y: 0, shift: true, alt: true },
  ];
  for (const fields of good) {
    assert.deepEqual(parseStructureStudio(fields, CHANNEL), { ...head, ...fields });
    assert.deepEqual(parseStudioMessage({ ...head, ...fields }, CHANNEL), { ...head, ...fields });
  }
  const bad = [
    { type: 'release', x: 40, y: 60 },
    { type: 'release', x: 40, y: 60, shift: false },
    { type: 'release', x: '40', y: 60, shift: false, alt: false },
    { type: 'release', x: 40, y: Number.NaN, shift: false, alt: false },
    { type: 'release', x: 40, y: 60, shift: 1, alt: false },
  ];
  for (const [index, fields] of bad.entries()) {
    assert.equal(parseStructureStudio(fields, CHANNEL), undefined, `release ${index}`);
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
    lists: [id],
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

test('a structure entry names the lists around the element, or says they cannot be counted', () => {
  const entries = [
    { ...entry, lists: [] },
    { ...entry, id: row, lists: [id, row] },
    { ...entry, lists: null, item: false },
  ];
  const fields = { type: 'structure', entries };
  assert.deepEqual(parseStructureStudio(fields, CHANNEL), { ...head, ...fields });
  const silent = {
    id,
    movable: false,
    item: true,
    accepts: true,
    mixed: false,
    interactive: false,
    root: null,
  };
  const deep = Array.from({ length: MAX_LISTS + 1 }, () => id);
  const bad = [
    silent,
    { ...entry, lists: 'none' },
    { ...entry, lists: ['<b>'] },
    { ...entry, lists: [4] },
    { ...entry, lists: deep },
  ];
  for (const [index, one] of bad.entries()) {
    const message = { type: 'structure', entries: [entry, one] };
    assert.equal(parseStructureStudio(message, CHANNEL), undefined, `lists ${index}`);
  }
});
