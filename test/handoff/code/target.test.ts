import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  TARGET_FILE_CAP,
  TARGET_READ_MAX,
  TARGET_ROOT_CAP,
  TOKEN_FILE_MIN,
  targetFacts,
} from '../../../src/handoff/domain/code/target.ts';

type Tree = Record<string, string>;

/** `targetFacts` over an in-memory project; `reads` records every path it asked for. */
function facts(
  tree: Tree,
  options: { base?: string; capped?: boolean; rootFiles?: string[]; extra?: string[] } = {},
) {
  const reads: string[] = [];
  const result = targetFacts({
    base: options.base ?? '',
    files: [...Object.keys(tree), ...(options.extra ?? [])],
    read: (path) => {
      reads.push(path);
      return tree[path];
    },
    git: false,
    capped: options.capped ?? false,
    ...(options.rootFiles ? { rootFiles: options.rootFiles } : {}),
  });
  return { result, reads };
}

const declarations = (count: number, prefix = '--c'): string => {
  const lines = Array.from({ length: count }, (_, index) => `  ${prefix}-${index}: ${index};`);
  return `:root {\n${lines.join('\n')}\n}\n`;
};

const PACKAGE = JSON.stringify({
  name: 'app',
  scripts: { dev: 'vite', build: 'tsc && vite build', broken: 3 },
  dependencies: { react: '18.3.1' },
  devDependencies: { vite: '5.4.2', typescript: '5.5.4' },
});

test('a project with a package, tokens and rule files', () => {
  const { result } = facts({
    'package.json': PACKAGE,
    'AGENTS.md': 'rules',
    '.prettierrc': '{}',
    'src/App.tsx': '',
    'src/components/Button.tsx': '',
    'src/components/Button.module.css': '.a{}',
    'src/components/Card.tsx': '',
    'src/styles/tokens.css': declarations(TOKEN_FILE_MIN),
    'src/styles/small.scss': declarations(TOKEN_FILE_MIN - 1, '$s'),
  });
  assert.equal(result.schemaVersion, 1);
  assert.equal(result.base, '');
  assert.deepEqual(result.root, ['.prettierrc', 'AGENTS.md', 'package.json', 'src/']);
  assert.deepEqual(result.packages, [
    {
      path: 'package.json',
      dependencies: { react: '18.3.1', typescript: '5.5.4', vite: '5.4.2' },
      scripts: { build: 'tsc && vite build', dev: 'vite' },
    },
  ]);
  assert.deepEqual(result.tokens, [{ path: 'src/styles/tokens.css', declares: TOKEN_FILE_MIN }]);
  assert.deepEqual(result.conventions, ['.prettierrc', 'AGENTS.md']);
  assert.equal(result.extensions[0]?.ext, '.tsx');
  assert.equal(result.extensions[0]?.count, 3);
  assert.deepEqual(result.folders[0], {
    path: 'src/components',
    files: 3,
    samples: [
      'src/components/Button.module.css',
      'src/components/Button.tsx',
      'src/components/Card.tsx',
    ],
  });
  assert.equal(result.capped, false);
});

test('SCSS variables count like custom properties', () => {
  const { result } = facts({ 'styles/_vars.scss': declarations(TOKEN_FILE_MIN + 2, '$gap') });
  assert.deepEqual(result.tokens, [{ path: 'styles/_vars.scss', declares: TOKEN_FILE_MIN + 2 }]);
});

test('a project with no package.json says so and names no framework', () => {
  const { result } = facts({
    'app.py': 'print(1)',
    'templates/base.html': '<html></html>',
    'templates/home.html': '{% extends "base.html" %}',
    'static/css/site.css': 'body { margin: 0; }',
  });
  assert.deepEqual(result.packages, []);
  assert.deepEqual(result.root, ['app.py', 'static/', 'templates/']);
  assert.deepEqual(
    result.extensions.map((entry) => entry.ext),
    ['.html', '.css', '.py'],
  );
  // The only names in the answer are the project's own files'.
  const text = JSON.stringify(result).toLowerCase();
  for (const word of ['flask', 'django', 'jinja', 'react', 'vue']) {
    assert.equal(text.includes(word), false, word);
  }
});

test('a package.json that is not JSON is skipped and nothing is capped', () => {
  const { result } = facts({
    'package.json': '{ "name": ',
    'web/package.json': '[1, 2]',
    'web/src/a.ts': '',
  });
  assert.deepEqual(result.packages, []);
  assert.equal(result.capped, false);
});

test('a package one folder down is read; two folders down is not', () => {
  const { result } = facts({
    'web/package.json': '{"scripts":{"dev":"x"}}',
    'web/deep/package.json': '{"scripts":{"dev":"y"}}',
  });
  assert.deepEqual(
    result.packages.map((entry) => entry.path),
    ['web/package.json'],
  );
});

test('a root of 600 names is cut to the cap and says capped', () => {
  const tree: Tree = {};
  for (let index = 0; index < 600; index += 1) {
    tree[`f${String(index).padStart(3, '0')}.txt`] = '';
  }
  const { result } = facts(tree);
  assert.equal(result.root.length, TARGET_ROOT_CAP);
  assert.equal(result.root[0], 'f000.txt');
  assert.equal(result.capped, true);
});

test('40,000 generated paths are cut to the file cap and say capped', () => {
  const files = Array.from({ length: 40_000 }, (_, index) => `src/d${index % 400}/f${index}.ts`);
  const result = targetFacts({
    base: '',
    files,
    read: () => undefined,
    git: true,
    capped: false,
  });
  assert.equal(result.capped, true);
  assert.equal(result.git, true);
  assert.equal(result.extensions[0]?.count, TARGET_FILE_CAP);
  assert.equal(result.folders.length, 15);
  assert.deepEqual(result.root, ['src/']);
});

test('a .gitignore hides its plain folders; wildcards and negations are not folders', () => {
  const { result } = facts({
    '.gitignore': 'dist/\n*.log\n!keep\n',
    'dist/bundle.js': '',
    'keep/a.txt': '',
    'build.log': '',
    'src/a.ts': '',
  });
  assert.deepEqual(result.root, ['.gitignore', 'build.log', 'keep/', 'src/']);
  assert.equal(
    result.folders.some((folder) => folder.path === 'dist'),
    false,
  );
});

test('node_modules and dot folders never count', () => {
  const { result } = facts({
    'node_modules/react/index.js': '',
    '.git/config': '',
    '.storybook/main.ts': '',
    'src/a.ts': '',
  });
  assert.deepEqual(result.root, ['src/']);
  assert.deepEqual(result.extensions, [{ ext: '.ts', count: 1 }]);
});

test('a .env file and a lockfile are never read and never listed', () => {
  const { result, reads } = facts(
    { 'package.json': PACKAGE, 'src/a.ts': '' },
    {
      extra: [
        '.env',
        '.env.local',
        'apps/web/.env.production',
        'package-lock.json',
        'yarn.lock',
        'pnpm-lock.yaml',
        'styles/Cargo.lock',
      ],
    },
  );
  const forbidden = reads.filter(
    (path) => /(?:^|\/)\.env/.test(path) || /lock/.test(path) || path.startsWith('.git/'),
  );
  assert.deepEqual(forbidden, []);
  assert.deepEqual(result.root, ['package.json', 'src/']);
});

test('a file over the read limit is not read into the facts and sets capped', () => {
  const { result } = facts({
    'styles/big.css': declarations(TOKEN_FILE_MIN) + ' '.repeat(TARGET_READ_MAX),
    'styles/ok.css': declarations(TOKEN_FILE_MIN),
  });
  assert.deepEqual(
    result.tokens.map((entry) => entry.path),
    ['styles/ok.css'],
  );
  assert.equal(result.capped, true);
});

test('the capped flag of the walk is kept', () => {
  assert.equal(facts({ 'a.ts': '' }, { capped: true }).result.capped, true);
});

test('a folder below the root: paths stay project paths, the root names are the folder own', () => {
  const { result } = facts(
    {
      'apps/web/package.json': PACKAGE,
      'apps/web/AGENTS.md': 'rules',
      'apps/web/src/a.tsx': '',
      'apps/web/src/b.tsx': '',
      'apps/api/main.go': '',
      'AGENTS.md': 'root rules',
    },
    { base: 'apps/web', rootFiles: ['AGENTS.md', 'CLAUDE.md', 'src/not-a-root-file.md'] },
  );
  assert.equal(result.base, 'apps/web');
  assert.deepEqual(result.root, ['AGENTS.md', 'package.json', 'src/']);
  assert.deepEqual(
    result.packages.map((entry) => entry.path),
    ['apps/web/package.json'],
  );
  assert.deepEqual(result.folders, [
    { path: 'apps/web/src', files: 2, samples: ['apps/web/src/a.tsx', 'apps/web/src/b.tsx'] },
  ]);
  assert.deepEqual(result.conventions, ['AGENTS.md', 'CLAUDE.md', 'apps/web/AGENTS.md']);
  assert.deepEqual(result.extensions, [
    { ext: '.tsx', count: 2 },
    { ext: '.json', count: 1 },
    { ext: '.md', count: 1 },
  ]);
});
