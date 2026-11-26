import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { mkdirSync, symlinkSync } from 'node:fs';
import { join } from 'node:path';
import { test } from 'node:test';
import { listProject } from '../../../src/handoff/app/code/list-project.ts';
import { readTarget } from '../../../src/handoff/app/code/read-target.ts';
import { TARGET_FILE_CAP, TARGET_READ_MAX } from '../../../src/handoff/domain/code/target.ts';
import { createProjectFiles } from '../../../src/kit/adapters/project-files.ts';
import type { ProjectSetup } from '../../../src/kit/index.ts';
import { KitvasError, PLUGIN_ROOT } from '../../../src/shared/index.ts';
import { tempDir } from '../../helpers/tmp.ts';
import { tempProject, writeText } from '../../kit/helpers/project-kit.ts';

const FIXTURES = join(PLUGIN_ROOT, 'test', 'fixtures', 'handoff');

/** A project held in memory, with a record of every file whose bytes were read. */
function fakeProject(files: Record<string, string>): ProjectSetup & { reads: string[] } {
  const reads: string[] = [];
  const paths = Object.keys(files).sort();
  const has = (rel: string): boolean => rel in files || paths.some((p) => p.startsWith(`${rel}/`));
  return {
    reads,
    exists: has,
    realInside: has,
    packageVersion: () => undefined,
    packageDependencies: () => [],
    listFiles: () => [],
    size: (rel) => (rel in files ? Buffer.byteLength(files[rel] ?? '') : undefined),
    readBytes(rel) {
      reads.push(rel);
      return rel in files ? new TextEncoder().encode(files[rel]) : undefined;
    },
    walk(rel, { skip, cap }) {
      const prefix = rel === '' ? '' : `${rel}/`;
      const inside = paths
        .filter((p) => p.startsWith(prefix))
        .map((p) => p.slice(prefix.length))
        .filter((p) =>
          p
            .split('/')
            .slice(0, -1)
            .every(
              (part) => !skip.includes(part) && !(skip.includes('.*') && part.startsWith('.')),
            ),
        );
      return inside.slice(0, cap);
    },
  };
}

const outcome = (run: () => unknown): { code: string; params: unknown } | undefined => {
  try {
    run();
  } catch (error) {
    if (error instanceof KitvasError) return { code: error.code, params: error.params };
    throw error;
  }
  return undefined;
};

test('the first fixture: a package, its scripts, the tokens file and the rule file', () => {
  const facts = readTarget({ files: createProjectFiles(join(FIXTURES, 'app-a')) }, { base: '' });
  assert.equal(facts.base, '');
  assert.equal(facts.packages.length, 1);
  assert.equal(facts.packages[0]?.path, 'package.json');
  assert.equal(facts.packages[0]?.scripts.build, 'tsc --noEmit && vite build');
  assert.equal(facts.packages[0]?.dependencies.react, '18.3.1');
  assert.deepEqual(facts.tokens, [{ path: 'src/styles/tokens.css', declares: 9 }]);
  assert.deepEqual(facts.conventions, ['AGENTS.md']);
  assert.ok(facts.root.includes('src/'));
  assert.equal(
    facts.folders.some((folder) => folder.path === 'src/components'),
    true,
  );
  assert.equal(facts.git, false);
  assert.equal(facts.capped, false);
});

test('the second fixture: no package.json, no tokens file, plain CSS and templates', () => {
  const facts = readTarget({ files: createProjectFiles(join(FIXTURES, 'app-b')) }, { base: '' });
  assert.deepEqual(facts.packages, []);
  assert.deepEqual(facts.tokens, []);
  assert.deepEqual(facts.root, ['app.py', 'static/', 'templates/']);
  assert.deepEqual(
    facts.extensions.map((entry) => entry.ext),
    ['.html', '.css', '.py'],
  );
});

test('a monorepo: the application two folders down is read with --in, the root rules come along', () => {
  const dir = tempProject(
    {
      'AGENTS.md': 'root rules',
      'package.json': '{"scripts":{"root":"x"}}',
      'apps/web/package.json': '{"scripts":{"dev":"vite"}}',
      'apps/web/src/Page.tsx': '',
      'apps/web/src/Card.tsx': '',
      'apps/api/main.go': '',
      'libs/shared/index.ts': '',
    },
    {},
    false,
  );
  const facts = readTarget({ files: createProjectFiles(dir) }, { base: 'apps/web' });
  assert.equal(facts.base, 'apps/web');
  assert.deepEqual(facts.root, ['package.json', 'src/']);
  assert.deepEqual(
    facts.packages.map((entry) => entry.path),
    ['apps/web/package.json'],
  );
  assert.deepEqual(facts.conventions, ['AGENTS.md']);
  assert.deepEqual(facts.extensions[0], { ext: '.tsx', count: 2 });
  // The folder `--in` does not name is not read at all.
  assert.equal(JSON.stringify(facts).includes('main.go'), false);
});

test('a folder that leaves the project, or is not there, ends with its own code', () => {
  const dir = tempProject({ 'src/a.ts': '' }, {}, false);
  const outside = tempDir();
  writeText(join(outside, 'x.ts'), '');
  mkdirSync(join(dir, 'src'), { recursive: true });
  symlinkSync(outside, join(dir, 'link'), process.platform === 'win32' ? 'junction' : 'dir');
  const files = createProjectFiles(dir);
  assert.deepEqual(
    outcome(() => readTarget({ files }, { base: '../elsewhere' })),
    { code: 'HANDOFF_OUTSIDE', params: { path: '../elsewhere' } },
  );
  assert.equal(outcome(() => readTarget({ files }, { base: '/etc' }))?.code, 'HANDOFF_OUTSIDE');
  assert.equal(outcome(() => readTarget({ files }, { base: 'link' }))?.code, 'HANDOFF_OUTSIDE');
  assert.equal(outcome(() => listProject({ files }, { base: 'link' }))?.code, 'HANDOFF_OUTSIDE');
  assert.equal(outcome(() => readTarget({ files }, { base: 'nope' }))?.code, 'HANDOFF_INVALID');
});

test('a .gitignore hides its folders and node_modules is never entered', () => {
  const dir = tempProject(
    {
      '.gitignore': 'dist/\n*.log\n!keep\n',
      'dist/bundle.js': '',
      'keep/a.txt': '',
      'run.log': '',
      'src/a.ts': '',
    },
    { react: { version: '18.3.1' } },
    false,
  );
  const files = createProjectFiles(dir);
  const facts = readTarget({ files }, { base: '' });
  assert.deepEqual(facts.root, ['.gitignore', 'keep/', 'run.log', 'src/']);
  const listed = Object.keys(listProject({ files }, { base: '' }).files);
  assert.deepEqual(listed, ['.gitignore', 'keep/a.txt', 'run.log', 'src/a.ts']);
});

test('a root of 600 names answers with 200 and says capped', () => {
  const tree: Record<string, string> = {};
  for (let index = 0; index < 600; index += 1) tree[`n${String(index).padStart(3, '0')}.txt`] = '';
  const dir = tempProject(tree, {}, false);
  const facts = readTarget({ files: createProjectFiles(dir) }, { base: '' });
  assert.equal(facts.root.length, 200);
  assert.equal(facts.capped, true);
});

test('over the file cap the facts say capped and the listing is not taken', () => {
  const tree: Record<string, string> = {};
  for (let index = 0; index < TARGET_FILE_CAP + 5; index += 1) tree[`src/f${index}.ts`] = '';
  const project = fakeProject(tree);
  const facts = readTarget({ files: project }, { base: '' });
  assert.equal(facts.capped, true);
  assert.equal(facts.extensions[0]?.count, TARGET_FILE_CAP);
  project.reads.length = 0;
  assert.deepEqual(listProject({ files: project }, { base: '' }), {
    schemaVersion: 1,
    watched: false,
    files: {},
  });
  assert.deepEqual(
    project.reads.filter((path) => path !== '.gitignore'),
    [],
  );
});

test('a .env file and a lockfile are listed by size and never read, by either command', () => {
  const project = fakeProject({
    '.env.local': 'SECRET=1',
    'apps/web/.env': 'TOKEN=2',
    'package-lock.json': '{}',
    'package.json': '{"scripts":{"dev":"vite"}}',
    'src/a.ts': 'export {};',
  });
  const facts = readTarget({ files: project }, { base: '' });
  const listing = listProject({ files: project }, { base: '' });
  const secret = (path: string): boolean =>
    /(?:^|\/)\.env/.test(path) || path === 'package-lock.json';
  assert.deepEqual(project.reads.filter(secret), []);
  assert.equal(JSON.stringify(facts).includes('SECRET'), false);
  assert.equal(listing.files['.env.local'], '8:');
  assert.equal(listing.files['apps/web/.env'], '7:');
  assert.equal(listing.files['package-lock.json'], '2:');
  assert.equal(facts.root.includes('.env.local'), false);
  assert.equal(facts.root.includes('package-lock.json'), false);
});

test('the listing holds size and sha1; a file over the read limit has a size only', () => {
  const big = 'x'.repeat(TARGET_READ_MAX + 1);
  const dir = tempProject(
    { 'src/a.ts': 'export const a = 1;\n', 'assets/big.txt': big },
    {},
    false,
  );
  const files = createProjectFiles(dir);
  const listing = listProject({ files }, { base: '' });
  const text = 'export const a = 1;\n';
  const sha1 = createHash('sha1').update(text).digest('hex');
  assert.equal(listing.watched, true);
  assert.equal(listing.files['src/a.ts'], `${Buffer.byteLength(text)}:${sha1}`);
  assert.equal(listing.files['assets/big.txt'], `${TARGET_READ_MAX + 1}:`);
  // The facts do not read the big file either, and say so.
  assert.equal(readTarget({ files }, { base: '' }).capped, false);
  writeText(join(dir, 'styles', 'big.css'), big);
  assert.equal(readTarget({ files }, { base: '' }).capped, true);
});

test('a listing taken twice is the same until a file changes', () => {
  const dir = tempProject({ 'src/a.ts': 'one' }, {}, false);
  const files = createProjectFiles(dir);
  const first = listProject({ files }, { base: '' });
  assert.deepEqual(listProject({ files }, { base: '' }), first);
  writeText(join(dir, 'src', 'a.ts'), 'two');
  writeText(join(dir, 'src', 'b.ts'), 'new');
  const second = listProject({ files }, { base: '' });
  assert.notEqual(second.files['src/a.ts'], first.files['src/a.ts']);
  assert.ok(second.files['src/b.ts']);
});
