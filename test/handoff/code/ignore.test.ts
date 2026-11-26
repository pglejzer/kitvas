import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  ignoredNames,
  isIgnoredName,
  isIgnoredPath,
} from '../../../src/handoff/domain/code/ignore.ts';

test('with no .gitignore only node_modules and the dot folders are skipped', () => {
  assert.deepEqual(ignoredNames(undefined), ['node_modules', '.*']);
  assert.deepEqual(ignoredNames(''), ['node_modules', '.*']);
});

test('a .gitignore adds its plain folder names and nothing else', () => {
  const text = [
    '# build output',
    'dist/',
    '*.log',
    '!keep',
    '/coverage',
    'apps/web/build',
    'tmp?',
    '.cache/',
    'node_modules/',
    '',
  ].join('\r\n');
  assert.deepEqual(ignoredNames(text), ['node_modules', '.*', 'coverage', 'dist']);
});

test('a negation takes an earlier name back', () => {
  assert.deepEqual(ignoredNames('out\nbuild/\n!out\n'), ['node_modules', '.*', 'build']);
});

test('names are tested as folders: a dot folder, a listed name, and never the file itself', () => {
  const names = ignoredNames('dist/');
  assert.equal(isIgnoredName('.storybook', names), true);
  assert.equal(isIgnoredName('dist', names), true);
  assert.equal(isIgnoredName('src', names), false);
  assert.equal(isIgnoredPath('dist/a.js', names), true);
  assert.equal(isIgnoredPath('src/.hidden/a.ts', names), true);
  assert.equal(isIgnoredPath('src/a.ts', names), false);
  // The last segment is a file's own name: a file called `dist` or `.env` is not a folder.
  assert.equal(isIgnoredPath('dist', names), false);
  assert.equal(isIgnoredPath('.prettierrc', names), false);
});
