import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  readView,
  tonesOf,
  VIEW_START,
  VIEW_VALUES,
  type ViewData,
  withChoice,
  writeView,
} from '../../../../client/studio/ui/view.ts';
import {
  DEFAULT_VIEW,
  VIEW_ACCENTS,
  VIEW_PANELS,
  VIEW_THEMES,
} from '../../../../src/shared/settings/config.ts';

test('the page knows the same words as the settings, and the same start', () => {
  assert.deepEqual([...VIEW_VALUES.theme], [...VIEW_THEMES]);
  assert.deepEqual([...VIEW_VALUES.panels], [...VIEW_PANELS]);
  assert.deepEqual([...VIEW_VALUES.accent], [...VIEW_ACCENTS]);
  assert.deepEqual(VIEW_START, DEFAULT_VIEW);
});

test('the view is read from the attributes; no theme means the system', () => {
  assert.deepEqual(readView({ panels: 'flush', accent: 'teal' }), {
    theme: 'system',
    panels: 'flush',
    accent: 'teal',
  });
  assert.deepEqual(readView({ theme: 'dark', panels: 'cards', accent: 'rose' }), {
    theme: 'dark',
    panels: 'cards',
    accent: 'rose',
  });
});

test('a missing or unknown word is the start value, never passed on', () => {
  assert.deepEqual(readView({}), VIEW_START);
  assert.deepEqual(readView({ theme: 'sepia', panels: '', accent: 'blue' }), VIEW_START);
});

test('writing the view takes the theme off for the system, and reads back the same', () => {
  const data: ViewData = { theme: 'dark', panels: 'cards', accent: 'copper', other: 'kept' };
  writeView(data, { theme: 'system', panels: 'flush', accent: 'coral' });
  assert.deepEqual(data, { panels: 'flush', accent: 'coral', other: 'kept' });
  assert.ok(!('theme' in data));
  for (const theme of VIEW_VALUES.theme) {
    for (const accent of VIEW_VALUES.accent) {
      const view = { theme, panels: 'flush' as const, accent };
      writeView(data, view);
      assert.deepEqual(readView(data), view);
    }
  }
});

test('one choice changes one setting', () => {
  assert.deepEqual(withChoice(VIEW_START, 'theme', 'dark'), { ...VIEW_START, theme: 'dark' });
  assert.deepEqual(withChoice(VIEW_START, 'panels', 'flush'), { ...VIEW_START, panels: 'flush' });
  assert.deepEqual(withChoice(VIEW_START, 'accent', 'rose'), { ...VIEW_START, accent: 'rose' });
});

test('an unknown setting or word changes nothing', () => {
  assert.equal(withChoice(VIEW_START, 'theme', 'flush'), null);
  assert.equal(withChoice(VIEW_START, 'accent', 'blue'), null);
  assert.equal(withChoice(VIEW_START, 'font', 'dark'), null);
  assert.equal(withChoice(VIEW_START, undefined, 'dark'), null);
  assert.equal(withChoice(VIEW_START, 'theme', undefined), null);
});

test('the tones of a prototype overlay follow the theme that shows', () => {
  assert.deepEqual(tonesOf(VIEW_START, false), { theme: 'light', accent: 'copper' });
  assert.deepEqual(tonesOf(VIEW_START, true), { theme: 'dark', accent: 'copper' });
  const light = { ...VIEW_START, theme: 'light' as const, accent: 'teal' as const };
  assert.deepEqual(tonesOf(light, true), { theme: 'light', accent: 'teal' });
});
