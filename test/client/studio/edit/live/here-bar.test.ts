// The line above the Properties pane and the pane's steady scroll: the words of the line for a
// group, the choice kept in the viewer's storage, and where the pane scrolls to when the block
// above it changes its height by itself.

import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  barWords,
  HERE_KEY,
  readOpen,
  writeOpen,
} from '../../../../../client/studio/edit/live/here-bar.ts';
import type { LiveGroup, LiveRow } from '../../../../../client/studio/edit/live/items.ts';
import { steadyScroll } from '../../../../../client/studio/edit/live/steady.ts';

const row = (fields: Partial<LiveRow> = {}): LiveRow => ({
  rule: 'ds/raw-color',
  severity: 'review',
  message: '"#7b8c35" is a colour written by hand. (info.scss:4)',
  source: 'code',
  widths: [],
  waived: false,
  evidence: { kind: 'message', message: 'A colour written by hand.' },
  values: null,
  ...fields,
});
const group = (rows: LiveRow[], tone: LiveGroup['tone'] = 'review'): LiveGroup => ({
  id: 'info:0',
  label: 'L1',
  tone,
  rows,
});

test('the line names the findings still standing, with the first one in short words', () => {
  assert.deepEqual(barWords(undefined), {
    key: 'live.here.none',
    count: 0,
    tone: 'good',
    first: null,
    cards: false,
  });
  const one = barWords(group([row()]));
  assert.equal(one.key, 'live.here.one');
  assert.equal(one.count, 1);
  assert.equal(one.tone, 'review');
  assert.equal(one.cards, true);
  assert.ok(one.first !== null && 'key' in one.first, 'a known rule has a short name');
  const two = barWords(group([row({ waived: true }), row(), row({ rule: 'ds/raw-size' })], 'fix'));
  assert.equal(two.key, 'live.here.many');
  assert.equal(two.count, 2);
  assert.equal(two.tone, 'fix');
});

test('a rule with no short name gives its own words, dismissed findings are only counted', () => {
  const plain = barWords(group([row({ rule: 'x/unknown', message: 'Something is off.' })]));
  assert.deepEqual(plain.first, { words: 'Something is off.' });
  assert.deepEqual(barWords(group([row({ waived: true }), row({ waived: true })])), {
    key: 'live.here.dismissed',
    count: 2,
    tone: 'good',
    first: null,
    cards: true,
  });
});

test('the cards start folded and the choice is kept, also when the storage fails', () => {
  const held = new Map<string, string>();
  const storage = {
    getItem: (key: string) => held.get(key) ?? null,
    setItem: (key: string, value: string) => void held.set(key, value),
  };
  assert.equal(readOpen(storage), false);
  writeOpen(storage, true);
  assert.equal(held.get(HERE_KEY), 'open');
  assert.equal(readOpen(storage), true);
  writeOpen(storage, false);
  assert.equal(readOpen(storage), false);
  assert.equal(readOpen(null), false);
  const broken = {
    getItem: (): string | null => {
      throw new Error('blocked');
    },
    setItem: (): void => {
      throw new Error('blocked');
    },
  };
  assert.equal(readOpen(broken), false);
  assert.doesNotThrow(() => writeOpen(broken, true));
});

test('the pane scrolls on by what the block above it grew or shrank', () => {
  // A second finding came while the cards were open: the rows stay where they were.
  assert.equal(steadyScroll(904, 210, 385), 1079);
  assert.equal(steadyScroll(0, 210, 385), 175);
  // A finding left: back by the same amount, never under the top.
  assert.equal(steadyScroll(1079, 385, 210), 904);
  assert.equal(steadyScroll(100, 385, 210), 0);
  // The block came or left whole (another selection, Edit off): the pane is left alone.
  assert.equal(steadyScroll(300, 0, 34), 300);
  assert.equal(steadyScroll(300, 34, 0), 300);
  assert.equal(steadyScroll(300, 34, 34), 300);
});
