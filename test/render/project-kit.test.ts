import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createNodeBuildFs } from '../../src/render/adapters/node-build-fs.ts';
import { importPath, joinSheets, sameFiles } from '../../src/render/app/project-kit.ts';
import { tempProject } from './helpers/temp-project.ts';

const fs = createNodeBuildFs();

test('a project path that names a module becomes its absolute path with forward slashes', () => {
  const project = tempProject([], {
    'src/theme.ts': 'export const theme = {};\n',
    'src/ui/index.tsx': 'export {};\n',
    'lib/tokens.css': ':root {}\n',
  });
  const absolute = (relPath: string): string => `${project.split('\\').join('/')}/${relPath}`;
  assert.equal(importPath(fs, project, 'src/theme'), absolute('src/theme'));
  assert.equal(importPath(fs, project, 'src/ui'), absolute('src/ui'));
  assert.equal(importPath(fs, project, 'lib/tokens.css'), absolute('lib/tokens.css'));
});

test('kit aliases, packages and paths that are no module of the project stay as they are', () => {
  const project = tempProject([], { 'src/theme.ts': 'export const theme = {};\n' });
  for (const from of ['@kit', '@acme/ui', '@acme/ui/theme', 'src/missing', '../src/theme']) {
    assert.equal(importPath(fs, project, from), from, from);
  }
  // A built-in kit has no project: nothing is read as a project path.
  assert.equal(importPath(fs, undefined, 'src/theme'), 'src/theme');
});

test('sheets join in order without empty ones; file lists compare in order', () => {
  assert.equal(
    joinSheets([':root {}\n', '', '  \n', '.a {}', '.b {}']),
    ':root {}\n\n.a {}\n.b {}',
  );
  assert.equal(joinSheets([]), '');
  assert.equal(sameFiles(['/a', '/b'], ['/a', '/b']), true);
  assert.equal(sameFiles(['/a', '/b'], ['/b', '/a']), false);
  assert.equal(sameFiles([], ['/a']), false);
});
