import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  inWriteSet,
  isInsideProject,
  isProtectedPath,
  isUnder,
  normalizeFolder,
} from '../../../src/handoff/domain/code/scope.ts';

test('a project path is relative, forward-slashed and has no dot segments', () => {
  for (const good of ['a', 'src/App.tsx', 'src/[id]/page.tsx', '.github/workflows/ci.yml']) {
    assert.equal(isInsideProject(good), true, good);
  }
  for (const bad of ['', '/a', 'a/', '../a', 'a/../b', './a', 'a//b', 'a\\b', 'C:/a', 'a/.']) {
    assert.equal(isInsideProject(bad), false, bad);
  }
});

test('protected paths: .git, .env files and lockfiles', () => {
  for (const path of [
    '.git/HEAD',
    'x/.git/config',
    '.env',
    '.env.production',
    'package-lock.json',
    'a/Gemfile.lock',
    'bun.lockb',
    'go.sum',
  ]) {
    assert.equal(isProtectedPath(path), true, path);
  }
  for (const path of ['src/environment.ts', '.envrc.md', 'lockfile.ts', 'src/gitignore.ts']) {
    assert.equal(isProtectedPath(path), false, path);
  }
});

test('folders are normalised and the root holds every path', () => {
  assert.equal(normalizeFolder('./src/pages/'), 'src/pages');
  assert.equal(normalizeFolder('.'), '');
  assert.equal(isUnder('src/a.ts', ''), true);
  assert.equal(isUnder('src/pages/a.ts', 'src/pages/'), true);
  assert.equal(isUnder('src/pages', 'src/pages'), true);
  assert.equal(isUnder('src/pages-old/a.ts', 'src/pages'), false);
});

test('the write set: new and named stay under the folder, named adds its files, open is free', () => {
  const to = 'src/pages/pricing';
  assert.equal(inWriteSet('src/pages/pricing/A.tsx', { to, scope: 'new', files: [] }), true);
  assert.equal(inWriteSet('src/App.tsx', { to, scope: 'new', files: ['src/App.tsx'] }), false);
  assert.equal(inWriteSet('src/App.tsx', { to, scope: 'named', files: ['src/App.tsx'] }), true);
  assert.equal(inWriteSet('src/other.ts', { to, scope: 'named', files: ['src/App.tsx'] }), false);
  assert.equal(inWriteSet('anywhere/x.ts', { to, scope: 'open', files: [] }), true);
});
