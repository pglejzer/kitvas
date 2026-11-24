import assert from 'node:assert/strict';
import { test } from 'node:test';
import type { A11yCard } from '../../../../../client/channel/live-protocol.ts';
import {
  type CardRow,
  cardRows,
  problemCount,
} from '../../../../../client/studio/edit/live/card.ts';

const card = (patch: Partial<A11yCard> = {}): A11yCard => ({
  role: 'button',
  name: 'Buy now',
  nameFrom: 'text',
  focusable: true,
  tabIndex: 3,
  contrast: { ratio: 7.2, large: false },
  target: { width: 120, height: 40 },
  alt: null,
  heading: null,
  color: 'rgb(255, 255, 255)',
  background: 'rgb(29, 32, 37)',
  ...patch,
});

const summary = (rows: CardRow[]): [string, boolean, string | null][] =>
  rows.map((row) => [row.key, row.problem, row.rule]);

test('a good button shows its role, name, place in the tab order, contrast and target', () => {
  const rows = cardRows(card());
  assert.deepEqual(summary(rows), [
    ['role', false, null],
    ['name', false, null],
    ['focus', false, null],
    ['contrast', false, 'a11y/color-contrast'],
    ['target', false, 'a11y/target-size'],
  ]);
  assert.equal(rows[0]?.value, 'button');
  assert.equal(problemCount(rows), 0);
});

test('a nameless, unreachable, faint and small button has four problems', () => {
  const rows = cardRows(
    card({
      name: '',
      nameFrom: 'none',
      focusable: false,
      tabIndex: null,
      contrast: { ratio: 3.1, large: false },
      target: { width: 20, height: 40 },
    }),
  );
  assert.deepEqual(
    rows.filter((row) => row.problem).map((row) => row.key),
    ['name', 'focus', 'contrast', 'target'],
  );
  assert.equal(problemCount(rows), 4);
});

test('large text passes AA at 3:1; text without a name of its own needs none', () => {
  const heading = card({
    role: 'heading',
    name: '',
    nameFrom: 'none',
    focusable: false,
    tabIndex: null,
    contrast: { ratio: 3.2, large: true },
    target: null,
    heading: 2,
  });
  const rows = cardRows(heading);
  assert.deepEqual(summary(rows), [
    ['role', false, null],
    ['name', false, null],
    ['focus', false, null],
    ['contrast', false, 'a11y/color-contrast'],
    ['heading', false, null],
  ]);
});

test('an image shows its alt text: none is a problem, an empty one is decorative', () => {
  const image = { role: 'img', focusable: false, tabIndex: null, contrast: null, target: null };
  const missing = cardRows(card({ ...image, name: '', nameFrom: 'none', alt: null }));
  assert.deepEqual(
    missing.filter((row) => row.problem).map((row) => row.key),
    ['name', 'alt'],
  );
  const decorative = cardRows(
    card({ ...image, role: 'presentation', name: '', nameFrom: 'none', alt: '' }),
  );
  assert.equal(problemCount(decorative), 0);
  assert.equal(decorative.find((row) => row.key === 'alt')?.value, 'a11y.decorative');
});
