import assert from 'node:assert/strict';
import { test } from 'node:test';
import type { DraftOption } from '../../../src/shared/index.ts';
import { pageWithChoice } from '../../../src/studio/frame/frame-page.ts';

const PAGE =
  '<!doctype html>\n<html lang="en">\n<head>\n</head>\n<body>\n<div id="root"></div>\n</body>\n</html>\n';

const THEME: DraftOption = {
  id: 'theme',
  label: 'Theme',
  default: 'light',
  values: [
    { id: 'light', label: 'Light' },
    { id: 'dark', label: 'Dark' },
  ],
};
const COLUMNS: DraftOption = {
  id: 'columns',
  label: 'Columns',
  default: '2',
  values: [
    { id: '2', label: 'Two' },
    { id: '3', label: 'Three' },
  ],
};

const query = (text: string): URLSearchParams => new URLSearchParams(text);

test('the root carries the value the address asks for, as the frame script would write it', () => {
  assert.equal(
    pageWithChoice(PAGE, [THEME], query('state=filled&opt-theme=dark')),
    PAGE.replace('<html lang="en">', '<html data-opt-theme="dark" lang="en">'),
  );
});

test('every option is written, with its default when the address names none', () => {
  const html = pageWithChoice(PAGE, [THEME, COLUMNS], query('opt-columns=3'));
  assert.ok(html.includes('<html data-opt-theme="light" data-opt-columns="3" lang="en">'));
});

test('a value or an option the version lacks is not written: the default shows', () => {
  const html = pageWithChoice(PAGE, [THEME], query('opt-theme=%22%3E%3Cscript%3E&opt-bogus=1'));
  assert.ok(html.includes('<html data-opt-theme="light" lang="en">'));
  assert.ok(!html.includes('script>'));
  assert.ok(!html.includes('bogus'));
});

test('a version without options gets its page as built', () => {
  assert.equal(pageWithChoice(PAGE, [], query('opt-theme=dark')), PAGE);
});

test('only the first root tag is written to', () => {
  const twice = `${PAGE}<html lang="en">`;
  const html = pageWithChoice(twice, [THEME], query('opt-theme=dark'));
  assert.equal(html.split('data-opt-theme').length - 1, 1);
});
