import assert from 'node:assert/strict';
import { test } from 'node:test';
import { nativeVariable, themePathOf, themeVariable } from '../../src/shared/values/theme-path.ts';

test('a theme path is read from theme(…) and nothing else', () => {
  assert.equal(themePathOf('theme(colors.primary)'), 'colors.primary');
  assert.equal(themePathOf('theme(colors.primary.DEFAULT)'), 'colors.primary.DEFAULT');
  assert.equal(themePathOf('theme(spacing.4)'), 'spacing.4');
  for (const other of [
    '--primary',
    'theme()',
    'theme(colors..x)',
    "theme('colors.x')",
    'theme(1x)',
  ]) {
    assert.equal(themePathOf(other), undefined, other);
  }
});

test('a theme path has one variable; a custom property stands for itself', () => {
  assert.equal(themeVariable('colors.primary'), '--kitvas-theme-colors-primary');
  assert.equal(nativeVariable('theme(borderRadius.md)'), '--kitvas-theme-borderRadius-md');
  assert.equal(nativeVariable('--acme-ink'), '--acme-ink');
});
