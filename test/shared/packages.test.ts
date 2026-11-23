import assert from 'node:assert/strict';
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { test } from 'node:test';
import { nodeModulesFrom, packageDirFrom } from '../../src/shared/index.ts';
import { tempDir } from '../helpers/tmp.ts';

function install(modules: string, name: string): string {
  const dir = join(modules, ...name.split('/'));
  mkdirSync(dir, { recursive: true });
  writeFileSync(join(dir, 'package.json'), JSON.stringify({ name, version: '1.0.0' }));
  return dir;
}

test('a package of the project is found in its own node_modules first', () => {
  const root = tempDir();
  mkdirSync(join(root, '.git'));
  const app = join(root, 'apps', 'web');
  const own = install(join(app, 'node_modules'), 'react');
  install(join(root, 'node_modules'), 'react');
  assert.equal(packageDirFrom(app, 'react'), own);
});

test('a hoisted package is found in the workspace root', () => {
  const root = tempDir();
  writeFileSync(join(root, 'package.json'), JSON.stringify({ workspaces: ['apps/*'] }));
  const app = join(root, 'apps', 'web');
  mkdirSync(app, { recursive: true });
  const hoisted = install(join(root, 'node_modules'), '@acme/ui');
  assert.equal(packageDirFrom(app, '@acme/ui'), hoisted);
  assert.deepEqual(nodeModulesFrom(app), [
    join(app, 'node_modules'),
    join(root, 'apps', 'node_modules'),
    join(root, 'node_modules'),
  ]);
});

test('the search stops at the workspace root', () => {
  const outer = tempDir();
  install(join(outer, 'node_modules'), 'react');
  const root = join(outer, 'repo');
  mkdirSync(join(root, '.git'), { recursive: true });
  assert.equal(packageDirFrom(root, 'react'), undefined);
});

test('without a workspace root above, only the project is searched', () => {
  const outer = tempDir();
  install(join(outer, 'node_modules'), 'react');
  const project = join(outer, 'plain');
  mkdirSync(project);
  assert.deepEqual(nodeModulesFrom(project), [join(project, 'node_modules')]);
  assert.equal(packageDirFrom(project, 'react'), undefined);
});

test('a package.json that is not JSON does not end the search', () => {
  const root = tempDir();
  mkdirSync(join(root, '.git'));
  const app = join(root, 'app');
  mkdirSync(app);
  writeFileSync(join(app, 'package.json'), '{ not json');
  const hoisted = install(join(root, 'node_modules'), 'clsx');
  assert.equal(packageDirFrom(app, 'clsx'), hoisted);
});
