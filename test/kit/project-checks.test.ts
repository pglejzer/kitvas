import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  type Kit,
  type LoadedKit,
  type ProjectFiles,
  parseKit,
  projectIssues,
} from '../../src/kit/index.ts';
import { tinyKitJson } from '../helpers/kit/kits.ts';
import { type Json, npmKitJson, repoKitJson } from './helpers/project-kit.ts';

type Disk = {
  /** Project paths and where they really are. */
  paths?: Record<string, 'inside' | 'outside'>;
  packages?: Record<string, string>;
};

function fakeFiles({ paths = {}, packages = {} }: Disk): ProjectFiles {
  return {
    exists: (relPath) => Object.hasOwn(paths, relPath),
    realInside: (relPath) => paths[relPath] === 'inside',
    packageVersion: (name) => packages[name],
  };
}

const loadedOf = (raw: Json): LoadedKit => {
  const kit: Kit = parseKit(raw, String(raw.id));
  return {
    kit,
    dir: 'kit',
    tokens: [],
    issues: [],
    hash: 'hash',
    project: 'project',
    cssVarMap: {},
    additions: [],
    additionsDir: undefined,
    entry: 'kit/generated/kit.ts',
    themes: { default: 'default', list: [] },
    themeTokens: {},
    addedTokens: [],
  };
};

const NPM_DISK: Disk = {
  paths: { 'src/theme': 'inside', 'src/theme/fonts.css': 'inside' },
  packages: { '@acme/ui': '1.2.0', react: '19.3.1' },
};

const REPO_DISK: Disk = {
  paths: {
    'src/ds': 'inside',
    'src/ds/Button': 'inside',
    'src/ds/card': 'inside',
    'src/ds/tokens.css': 'inside',
    'src/app/globals.css': 'inside',
  },
  packages: { 'react-day-picker': '9.0.0', react: '18.3.1' },
};

test('a built-in kit has no project checks', () => {
  assert.deepEqual(projectIssues(fakeFiles({}), loadedOf(tinyKitJson())), []);
});

test('a project kit whose paths and packages are all there passes', () => {
  assert.deepEqual(projectIssues(fakeFiles(NPM_DISK), loadedOf(npmKitJson())), []);
  assert.deepEqual(projectIssues(fakeFiles(REPO_DISK), loadedOf(repoKitJson())), []);
});

test('a missing package is reported once, at the first place that names it', () => {
  const disk = { ...NPM_DISK, packages: { react: '19.3.1' } };
  assert.deepEqual(projectIssues(fakeFiles(disk), loadedOf(npmKitJson())), [
    { path: 'source.package', key: 'kitIssue.packageMissing', params: { name: '@acme/ui' } },
  ]);
});

test('project paths must exist and stay inside the project', () => {
  const disk: Disk = { ...NPM_DISK, paths: { 'src/theme': 'outside' } };
  assert.deepEqual(projectIssues(fakeFiles(disk), loadedOf(npmKitJson())), [
    {
      path: 'runtime.providers.0.bindings.theme.from',
      key: 'kitIssue.pathOutside',
      params: { path: 'src/theme' },
    },
    {
      path: 'runtime.styles.imports.1',
      key: 'kitIssue.fileMissing',
      params: { file: 'src/theme/fonts.css' },
    },
  ]);
});

test('a repo kit checks its folder, its Tailwind entry and its component files', () => {
  const disk: Disk = { ...REPO_DISK, paths: { 'src/ds/Button': 'inside' }, packages: {} };
  assert.deepEqual(projectIssues(fakeFiles(disk), loadedOf(repoKitJson())), [
    { path: 'source.path', key: 'kitIssue.fileMissing', params: { file: 'src/ds' } },
    {
      path: 'runtime.styles.tailwind.entry',
      key: 'kitIssue.fileMissing',
      params: { file: 'src/app/globals.css' },
    },
    {
      path: 'components.Card.import.from',
      key: 'kitIssue.fileMissing',
      params: { file: 'src/ds/card' },
    },
    {
      path: 'runtime.styles.imports.0',
      key: 'kitIssue.fileMissing',
      params: { file: 'src/ds/tokens.css' },
    },
    {
      path: 'runtime.styles.imports.1',
      key: 'kitIssue.packageMissing',
      params: { name: 'react-day-picker' },
    },
  ]);
});

test('the project React must be 18 or later; a project without React is fine', () => {
  const old = { ...NPM_DISK, packages: { '@acme/ui': '1.2.0', react: '17.0.2' } };
  assert.deepEqual(projectIssues(fakeFiles(old), loadedOf(npmKitJson())), [
    { path: 'framework', key: 'kitIssue.reactTooOld', params: { version: '17.0.2' } },
  ]);
  const none = { ...NPM_DISK, packages: { '@acme/ui': '1.2.0' } };
  assert.deepEqual(projectIssues(fakeFiles(none), loadedOf(npmKitJson())), []);
});

test('imports that fit no shape are left to the source rules', () => {
  const raw = npmKitJson();
  (raw.runtime as { styles: { imports: string[] } }).styles.imports = ['../x.css'];
  assert.deepEqual(projectIssues(fakeFiles(NPM_DISK), loadedOf(raw)), []);
});
