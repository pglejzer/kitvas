import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createChoices } from '../../../../client/frame/page/options.ts';
import { createThemeBody, type ThemeAttributes } from '../../../../client/frame/page/theme-body.ts';
import type { DraftOption } from '../../../../src/shared/values/options.ts';

const THEME: DraftOption = {
  id: 'theme',
  label: 'Theme',
  default: 'light',
  values: [
    { id: 'light', label: 'Light' },
    { id: 'dark', label: 'Dark' },
    { id: 'night', label: 'Night' },
  ],
};

const THEMES: ThemeAttributes = {
  dark: { 'data-mui-color-scheme': 'dark', class: 'is-dark dim' },
  night: { 'data-mui-color-scheme': 'night', class: 'dim' },
};

/** An element that keeps its attributes and its classes. */
function fakeElement() {
  const attributes = new Map<string, string>();
  const classes = new Set<string>();
  return {
    attributes,
    classes,
    setAttribute: (name: string, value: string) => void attributes.set(name, value),
    removeAttribute: (name: string) => void attributes.delete(name),
    classList: {
      add: (...names: string[]) => {
        for (const name of names) classes.add(name);
      },
      remove: (...names: string[]) => {
        for (const name of names) classes.delete(name);
      },
    },
  };
}

/** A page whose body holds a class of its own, with the choices of `options`. */
function page(options: DraftOption[], first: Record<string, string>) {
  const root = fakeElement();
  const body = fakeElement();
  body.classes.add('page');
  const themes = createThemeBody(body, THEMES);
  const choices = createChoices(root, options, first, themes);
  return { root, body, themes, choices };
}

test("a theme's attributes are on the body while it shows, never on the root", () => {
  const view = page([THEME], { theme: 'dark' });
  assert.deepEqual([...view.body.attributes], [['data-mui-color-scheme', 'dark']]);
  assert.deepEqual([...view.body.classes], ['page', 'is-dark', 'dim']);
  assert.deepEqual([...view.root.attributes], [['data-opt-theme', 'dark']]);
});

test('another theme takes the first one off; the default theme has none', () => {
  const view = page([THEME], { theme: 'dark' });
  view.choices.set({ theme: 'night' });
  assert.deepEqual([...view.body.attributes], [['data-mui-color-scheme', 'night']]);
  // A class both themes name stays; the body's own class is never touched.
  assert.deepEqual([...view.body.classes].sort(), ['dim', 'page']);
  view.choices.set({ theme: 'light' });
  assert.deepEqual([...view.body.attributes], []);
  assert.deepEqual([...view.body.classes], ['page']);
});

test('a build without the option theme takes the attributes off, a new build brings its own', () => {
  const view = page([THEME], { theme: 'dark' });
  view.choices.swap([]);
  assert.deepEqual([...view.body.attributes], []);
  assert.deepEqual([...view.body.classes], ['page']);

  const next = page([THEME], { theme: 'dark' });
  next.themes.use({ dark: { 'data-scheme': 'dark' } });
  next.choices.swap([THEME]);
  assert.deepEqual([...next.body.attributes], [['data-scheme', 'dark']]);
  assert.deepEqual([...next.body.classes], ['page']);
});

test('options without a theme leave the body alone', () => {
  const columns: DraftOption = {
    id: 'columns',
    label: 'Columns',
    default: '3',
    values: [
      { id: '3', label: 'Three' },
      { id: '2', label: 'Two' },
    ],
  };
  const view = page([columns], { columns: '2' });
  assert.deepEqual([...view.body.attributes], []);
  assert.deepEqual([...view.body.classes], ['page']);
});
