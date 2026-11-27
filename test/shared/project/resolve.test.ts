import assert from 'node:assert/strict';
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { test } from 'node:test';
import {
  pathTargets,
  projectResolve,
  type ReadText,
  readProjectResolve,
} from '../../../src/shared/index.ts';
import { tempDir } from '../../helpers/tmp.ts';

const reader =
  (files: Record<string, string>): ReadText =>
  (file) =>
    Object.hasOwn(files, file) ? files[file] : undefined;

const config = (value: unknown): string => JSON.stringify(value);

test('a project with no config and nothing declared has an empty record', () => {
  assert.deepEqual(projectResolve('/p', undefined, reader({})), {
    config: undefined,
    paths: {},
    types: { files: [], include: [], exclude: [] },
  });
});

test('baseUrl is a folder imports start from, beside the paths', () => {
  const read = reader({
    '/p/tsconfig.json': config({
      compilerOptions: { baseUrl: 'src', paths: { '@ui/*': ['ds/*'] } },
      include: ['src'],
    }),
  });
  assert.deepEqual(projectResolve('/p', undefined, read), {
    config: '/p/tsconfig.json',
    paths: { '@ui/*': ['/p/src/ds/*'], '*': ['/p/src/*'] },
    types: { files: [], include: ['/p/src/**/*.d.ts'], exclude: [] },
  });
});

test('only the type files of what the config takes in are read', () => {
  const read = reader({
    '/p/tsconfig.json': config({
      include: [
        'src/**/*',
        'lib/**/*.ts',
        'app/**',
        'env/',
        'types/global.d.ts',
        'ambient/*.d.ts',
        // No type file is among these.
        'pages/**/*.tsx',
        'src/**/*.test.ts',
        'vite.config.ts',
        'data/table.json',
      ],
      files: ['custom.d.ts', 'src/main.tsx'],
      exclude: ['src/legacy'],
    }),
  });
  assert.deepEqual(projectResolve('/p', undefined, read).types, {
    files: ['/p/custom.d.ts'],
    include: [
      '/p/src/**/*.d.ts',
      '/p/lib/**/*.d.ts',
      '/p/app/**/*.d.ts',
      '/p/env/**/*.d.ts',
      '/p/types/global.d.ts',
      '/p/ambient/*.d.ts',
    ],
    exclude: ['/p/src/legacy'],
  });
});

test('a config that names no files takes in its whole folder, without what its build writes', () => {
  const read = reader({
    '/p/tsconfig.json': config({ compilerOptions: { outDir: 'dist' } }),
    // `files` alone is all that config reads.
    '/q/tsconfig.json': config({ files: ['src/index.ts'] }),
  });
  assert.deepEqual(projectResolve('/p', undefined, read).types, {
    files: [],
    include: ['/p/**/*.d.ts'],
    exclude: ['/p/dist'],
  });
  assert.deepEqual(projectResolve('/q', undefined, read).types, {
    files: [],
    include: [],
    exclude: [],
  });
});

test('the configs a tsconfig references add theirs after it', () => {
  const read = reader({
    '/v/tsconfig.json': config({
      files: [],
      references: [{ path: './tsconfig.app.json' }, { path: './tsconfig.node.json' }],
    }),
    '/v/tsconfig.app.json': config({
      compilerOptions: { baseUrl: '.', paths: { '@/*': ['./src/*'] } },
      include: ['src'],
    }),
    '/v/tsconfig.node.json': config({ include: ['vite.config.ts'] }),
  });
  assert.deepEqual(projectResolve('/v', undefined, read), {
    config: '/v/tsconfig.json',
    paths: { '@/*': ['/v/src/*'], '*': ['/v/*'] },
    types: { files: [], include: ['/v/src/**/*.d.ts'], exclude: [] },
  });
});

test('what the kit declares comes first and is said once', () => {
  const read = reader({
    '/p/tsconfig.json': config({
      compilerOptions: { baseUrl: 'src', paths: { '@/*': ['./*'], '~lib': ['lib/index.ts'] } },
      include: ['src'],
    }),
  });
  const declared = {
    roots: ['app', 'src'],
    alias: { '@': 'src', '~lib': 'packages/lib/index.ts' },
    types: ['types/mui.d.ts', 'src/theme/augment.ts', 'typings'],
  };
  assert.deepEqual(projectResolve('/p', declared, read), {
    config: '/p/tsconfig.json',
    paths: {
      '*': ['/p/app/*', '/p/src/*'],
      '@': ['/p/src'],
      '@/*': ['/p/src/*'],
      '~lib': ['/p/packages/lib/index.ts', '/p/src/lib/index.ts'],
      '~lib/*': ['/p/packages/lib/index.ts/*'],
    },
    types: {
      files: ['/p/types/mui.d.ts', '/p/src/theme/augment.ts'],
      include: ['/p/typings/**/*.d.ts', '/p/src/**/*.d.ts'],
      exclude: [],
    },
  });
  // A project that has no config at all is described by its kit alone.
  assert.deepEqual(projectResolve('/bare', { roots: ['src'], alias: {}, types: [] }, reader({})), {
    config: undefined,
    paths: { '*': ['/bare/src/*'] },
    types: { files: [], include: [], exclude: [] },
  });
});

test('a jsconfig.json is read when there is no tsconfig.json', () => {
  const both = reader({
    '/p/tsconfig.json': config({ compilerOptions: { baseUrl: 'ts' } }),
    '/p/jsconfig.json': config({ compilerOptions: { baseUrl: 'js' } }),
  });
  const js = reader({ '/p/jsconfig.json': config({ compilerOptions: { baseUrl: 'js' } }) });
  assert.equal(projectResolve('/p', undefined, both).config, '/p/tsconfig.json');
  assert.deepEqual(projectResolve('/p', undefined, js).paths, { '*': ['/p/js/*'] });
  assert.equal(projectResolve('/p', undefined, js).config, '/p/jsconfig.json');
});

test('the record of a folder on disk has forward slashes', () => {
  const project = tempDir('kitvas-resolve-');
  mkdirSync(join(project, 'src'));
  writeFileSync(
    join(project, 'tsconfig.json'),
    '{\n  // comments are fine\n  "compilerOptions": { "baseUrl": "src" },\n}\n',
  );
  const home = project.split('\\').join('/');
  assert.deepEqual(readProjectResolve(project, undefined), {
    config: `${home}/tsconfig.json`,
    paths: { '*': [`${home}/src/*`] },
    types: { files: [], include: [`${home}/**/*.d.ts`], exclude: [] },
  });
  assert.equal(readProjectResolve(join(project, 'src'), undefined).config, undefined);
});

test('a specifier leads where the pattern that fits it best says', () => {
  const patterns = {
    '*': ['/p/src/*', '/p/app/*'],
    '@/*': ['/p/src/*'],
    '@/ui/*': ['/p/packages/ui/*'],
    '~lib': ['/p/lib/index.ts'],
    '*.svg': ['/p/icons/*.tsx'],
  };
  assert.deepEqual(pathTargets(patterns, '~lib'), ['/p/lib/index.ts']);
  assert.deepEqual(pathTargets(patterns, '@/theme'), ['/p/src/theme']);
  assert.deepEqual(pathTargets(patterns, '@/ui/Button'), ['/p/packages/ui/Button']);
  assert.deepEqual(pathTargets(patterns, 'style/space'), [
    '/p/src/style/space',
    '/p/app/style/space',
  ]);
  assert.deepEqual(pathTargets(patterns, 'logo.svg'), ['/p/src/logo.svg', '/p/app/logo.svg']);
  assert.deepEqual(pathTargets({ '@/*': ['/p/src/*'] }, '@'), []);
  assert.deepEqual(pathTargets({ '@/*': ['/p/src/*'] }, 'react'), []);
  assert.deepEqual(pathTargets({}, 'react'), []);
});
