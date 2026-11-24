import assert from 'node:assert/strict';
import { test } from 'node:test';
import type { A11yCard } from '../../../../../client/channel/live-protocol.ts';
import { pickerWarning } from '../../../../../client/studio/edit/live/warn.ts';

const card = (patch: Partial<A11yCard> = {}): A11yCard => ({
  role: 'paragraph',
  name: '',
  nameFrom: 'none',
  focusable: false,
  tabIndex: null,
  contrast: { ratio: 15.9, large: false },
  target: null,
  alt: null,
  heading: null,
  color: 'rgb(29, 32, 37)',
  background: 'rgb(255, 255, 255)',
  ...patch,
});

const colour = (value: string, on: A11yCard = card()): ReturnType<typeof pickerWarning> =>
  pickerWarning({ property: 'color', value, card: on });

test('a text colour that would fall below AA on what is behind it warns', () => {
  assert.equal(colour('rgb(119, 119, 119)'), 'contrast');
  assert.equal(colour('rgb(118, 118, 118)'), null);
});

test('large text needs 3:1 only', () => {
  const large = card({ contrast: { ratio: 15.9, large: true } });
  assert.equal(colour('rgb(119, 119, 119)', large), null);
  assert.equal(colour('rgb(170, 170, 170)', large), 'contrast');
});

test('a background is held against the text on it, painted over what shows through it', () => {
  const warn = (value: string, background: string | null): ReturnType<typeof pickerWarning> =>
    pickerWarning({ property: 'background-color', value, card: card({ background }) });
  assert.equal(warn('rgb(60, 60, 60)', 'rgb(255, 255, 255)'), 'contrast');
  assert.equal(warn('rgb(250, 250, 250)', 'rgb(255, 255, 255)'), null);
  // A faint see-through layer over white stays light enough for the dark text.
  assert.equal(warn('rgba(0, 0, 0, 0.1)', 'rgb(255, 255, 255)'), null);
  // Nothing known behind it: the candidate alone.
  assert.equal(warn('rgb(60, 60, 60)', null), 'contrast');
});

test('no warning without text, without a card, or for a value the row could not resolve', () => {
  assert.equal(colour('rgb(250, 250, 250)', card({ contrast: null })), null);
  assert.equal(pickerWarning({ property: 'color', value: 'rgb(250, 250, 250)', card: null }), null);
  assert.equal(pickerWarning({ property: 'color', value: null, card: card() }), null);
  assert.equal(colour('var(--kit-x)'), null);
});

test('a width or height under 24 px warns for an interactive element only', () => {
  const button = card({ role: 'button', target: { width: 40, height: 40 } });
  assert.equal(pickerWarning({ property: 'height', value: '20px', card: button }), 'target');
  assert.equal(pickerWarning({ property: 'width', value: '24px', card: button }), null);
  assert.equal(pickerWarning({ property: 'width', value: '1.5rem', card: button }), null);
  assert.equal(pickerWarning({ property: 'height', value: '20px', card: card() }), null);
  assert.equal(pickerWarning({ property: 'gap', value: '2px', card: button }), null);
});
