import assert from 'node:assert/strict';
import { mkdirSync, symlinkSync } from 'node:fs';
import { join } from 'node:path';
import { test } from 'node:test';
import { createProjectFiles } from '../../src/kit/adapters/project-files.ts';
import { tempDir } from '../helpers/tmp.ts';
import { tempProject, writeText } from './helpers/project-kit.ts';

function project(): string {
  return tempProject(
    {
      'src/ds/index.ts': 'export {};',
      'src/ds/Button.tsx': 'export {};',
      'src/ds/tokens.css': ':root {}',
      'src/ui/button.tsx': 'export {};',
      'src/theme/fonts.scss': '',
      'src/plain/notes.md': 'no index here',
      'src/app/globals.css': '@import "tailwindcss";',
    },
    {
      '@acme/ui': {
        version: '1.2.0',
        dependencies: { clsx: '2.1.1' },
        peerDependencies: { react: '>=18', clsx: '2' },
      },
      react: { version: '18.3.1' },
      empty: { version: '' },
    },
    false,
  );
}

test('a project path resolves like a module: file, extension, index, then the folder', () => {
  const files = createProjectFiles(project());
  for (const path of [
    'src/ds/tokens.css',
    'src/ds/Button',
    'src/ui/button',
    'src/theme/fonts',
    'src/ds',
    'src/plain',
    'src/app/globals.css',
  ]) {
    assert.equal(files.exists(path), true, path);
    assert.equal(files.realInside(path), true, path);
  }
  for (const path of ['src/nope', 'src/ds/Card', 'src/ds/tokens.css/x', '../outside', '/abs']) {
    assert.equal(files.exists(path), false, path);
    assert.equal(files.realInside(path), false, path);
  }
  // Packages are not project paths, even when the folder is there.
  assert.equal(files.exists('node_modules/@acme/ui'), false);
});

test('a link that leads out of the project exists but is not inside it', () => {
  const dir = project();
  const outside = tempDir();
  writeText(join(outside, 'secret.ts'), 'export {};');
  mkdirSync(join(dir, 'src'), { recursive: true });
  symlinkSync(outside, join(dir, 'src', 'link'), process.platform === 'win32' ? 'junction' : 'dir');
  const files = createProjectFiles(dir);
  assert.equal(files.exists('src/link/secret'), true);
  assert.equal(files.realInside('src/link/secret'), false);
  assert.equal(files.realInside('src/link'), false);
});

test('installed packages: version and the names they depend on', () => {
  const files = createProjectFiles(project());
  assert.equal(files.packageVersion('@acme/ui'), '1.2.0');
  assert.equal(files.packageVersion('react'), '18.3.1');
  assert.equal(files.packageVersion('react-dom'), undefined);
  assert.equal(files.packageVersion('empty'), undefined);
  // Only package names: a subpath or a path never reads another package.json.
  assert.equal(files.packageVersion('@acme/ui/styles.css'), undefined);
  assert.equal(files.packageVersion('../react'), undefined);
  assert.deepEqual(files.packageDependencies('@acme/ui'), ['clsx', 'react']);
  assert.deepEqual(files.packageDependencies('react'), []);
  assert.deepEqual(files.packageDependencies('nope'), []);
});

test('listFiles, size and readBytes stay inside the project', () => {
  const dir = tempProject({
    'shots/b.png': 'bb',
    'shots/a.png': 'a',
    'shots/deep/c.jpg': 'ccc',
    'other.txt': 'x',
  });
  const files = createProjectFiles(dir);
  assert.deepEqual(files.listFiles('shots'), ['a.png', 'b.png', 'deep/c.jpg']);
  assert.deepEqual(files.listFiles('shots/deep'), ['c.jpg']);
  // A file, a missing folder and paths that are not project paths list nothing.
  for (const path of ['other.txt', 'nope', '../x', '/abs', 'node_modules']) {
    assert.deepEqual(files.listFiles(path), [], path);
  }
  assert.equal(files.size('shots/b.png'), 2);
  assert.deepEqual([...(files.readBytes('shots/deep/c.jpg') ?? [])], [...Buffer.from('ccc')]);
  // Exactly the file: no extension or index lookup, no folders.
  for (const path of ['shots', 'shots/a', 'nope.png', '../x', '/abs']) {
    assert.equal(files.size(path), undefined, path);
    assert.equal(files.readBytes(path), undefined, path);
  }
});

test('listFiles, size and readBytes do not follow a link out of the project', () => {
  const dir = project();
  const outside = tempDir();
  writeText(join(outside, 'secret.png'), 'secret');
  writeText(join(dir, 'shots', 'ok.png'), 'ok');
  symlinkSync(
    outside,
    join(dir, 'shots', 'link'),
    process.platform === 'win32' ? 'junction' : 'dir',
  );
  const files = createProjectFiles(dir);
  assert.deepEqual(files.listFiles('shots'), ['ok.png']);
  assert.deepEqual(files.listFiles('shots/link'), []);
  assert.equal(files.size('shots/link/secret.png'), undefined);
  assert.equal(files.readBytes('shots/link/secret.png'), undefined);
});

test('a package hoisted into the workspace root is found from a package inside it', () => {
  const root = tempProject(
    { 'package.json': '{"name":"root","workspaces":["packages/*"]}' },
    { react: { version: '18.3.1' }, '@acme/ui': { version: '1.2.0', dependencies: { clsx: '2' } } },
  );
  const app = join(root, 'packages', 'app');
  writeText(join(app, 'package.json'), '{"name":"app"}');
  const files = createProjectFiles(app);
  assert.equal(files.packageVersion('react'), '18.3.1');
  assert.equal(files.packageVersion('@acme/ui'), '1.2.0');
  assert.deepEqual(files.packageDependencies('@acme/ui'), ['clsx']);
  // The nearest node_modules wins over the hoisted one.
  writeText(join(app, 'node_modules', 'react', 'package.json'), '{"version":"19.0.0"}');
  assert.equal(createProjectFiles(app).packageVersion('react'), '19.0.0');
});

test('a node_modules above a folder that is no workspace is not searched', () => {
  const above = tempProject({}, { react: { version: '18.3.1' } });
  const app = join(above, 'packages', 'app');
  writeText(join(app, 'package.json'), '{"name":"app"}');
  assert.equal(createProjectFiles(app).packageVersion('react'), undefined);
});

test('a package.json that is not JSON counts as not installed', () => {
  const dir = project();
  writeText(join(dir, 'node_modules', 'broken', 'package.json'), '{not json');
  assert.equal(createProjectFiles(dir).packageVersion('broken'), undefined);
});
