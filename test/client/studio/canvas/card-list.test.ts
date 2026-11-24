import assert from 'node:assert/strict';
import { test } from 'node:test';
import { cardsOf, createCardList, frameWidth } from '../../../../client/studio/canvas/card-list.ts';
import type { Frame } from '../../../../client/studio/frames.ts';

/** A card's frame: only its channel and its width attribute are read. */
const frameOf = (channel: string, width: number): Frame => ({
  role: 'current',
  channel,
  element: { width: String(width) } as unknown as HTMLIFrameElement,
  ready: false,
});

test('the card of the width shown is the edit card until another is used', () => {
  const lead = frameOf('a'.repeat(20), 390);
  const tablet = frameOf('b'.repeat(20), 768);
  const list = createCardList(lead);
  list.add(tablet);
  assert.equal(list.edit(), lead);
  assert.deepEqual(list.frames(), [lead, tablet]);
  list.setEdit(tablet);
  assert.equal(list.edit(), tablet);
  assert.deepEqual(list.frames(), [tablet, lead], 'the edit card comes first');
});

test('a card that goes takes the edits back to the card of the width shown', () => {
  const lead = frameOf('a'.repeat(20), 390);
  const desk = frameOf('c'.repeat(20), 1280);
  const list = createCardList(lead);
  list.add(desk);
  list.setEdit(desk);
  list.remove(desk);
  assert.equal(list.edit(), lead);
  assert.deepEqual(list.frames(), [lead]);
  list.remove(lead);
  assert.deepEqual(list.frames(), [lead], 'the card of the width shown always stays');
});

test('a frame that is no card never becomes the edit card', () => {
  const lead = frameOf('a'.repeat(20), 390);
  const list = createCardList(lead);
  list.setEdit(frameOf('z'.repeat(20), 768));
  assert.equal(list.edit(), lead);
});

test('the listeners hear cards come and go, another edit card and widths; not a no-op', () => {
  const lead = frameOf('a'.repeat(20), 390);
  const tablet = frameOf('b'.repeat(20), 768);
  const list = createCardList(lead);
  let heard = 0;
  const stop = list.onChange(() => {
    heard += 1;
  });
  list.add(tablet);
  list.add(tablet);
  list.setEdit(tablet);
  list.setEdit(tablet);
  list.changed();
  assert.equal(heard, 3);
  stop();
  list.remove(tablet);
  assert.equal(heard, 3);
});

test('cards are found by the channel their messages carry, and measured by their width', () => {
  const lead = frameOf('a'.repeat(20), 390);
  const tablet = frameOf('b'.repeat(20), 768);
  const list = createCardList(lead);
  list.add(tablet);
  assert.equal(list.byChannel('b'.repeat(20)), tablet);
  assert.equal(list.byChannel('q'.repeat(20)), undefined);
  assert.equal(list.widthOf(tablet), 768);
  assert.equal(frameWidth(frameOf('d'.repeat(20), Number.NaN)), 0);
});

test('the editor finds the list the page made by its frame, else a list of that frame', () => {
  const lead = frameOf('a'.repeat(20), 390);
  const made = createCardList(lead);
  assert.equal(cardsOf(lead), made);
  const alone = frameOf('e'.repeat(20), 768);
  assert.deepEqual(cardsOf(alone).frames(), [alone]);
});
