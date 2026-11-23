import assert from 'node:assert/strict';
import { existsSync, mkdirSync, readFileSync, symlinkSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { test } from 'node:test';
import { createFolderKitWriter } from '../../src/kit/adapters/folder-writer.ts';
import { createProjectFiles } from '../../src/kit/adapters/project-files.ts';
import { imageType, type NewKitDeps, newKit } from '../../src/kit/index.ts';
import { KitvasError, projectKitsDir } from '../../src/shared/index.ts';
import { tempDir } from '../helpers/tmp.ts';
import { layeredStore, tempProject } from './helpers/project-kit.ts';

const PNG = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];
const JPEG = [0xff, 0xd8, 0xff, 0xe0];
const WEBP = [0x52, 0x49, 0x46, 0x46, 0, 0, 0, 0, 0x57, 0x45, 0x42, 0x50];
const MB10 = 10 * 1024 * 1024;
const BAD_NAME = 'kits.new.skip.name';
const FIGMA = `https://www.figma.com/design/${'a'.repeat(22)}/Acme?node-id=1-2`;

const deps = (project: string): NewKitDeps => ({
  kits: layeredStore(project),
  kitWriter: createFolderKitWriter(projectKitsDir(project)),
  files: createProjectFiles(project),
  kitsDir: projectKitsDir(project),
});

const fails = (code: string) => (error: unknown) =>
  error instanceof KitvasError && error.code === code;

const kitDir = (project: string, id = 'site') => join(projectKitsDir(project), id);

function readKitJson(project: string, id = 'site'): Record<string, unknown> {
  const text = readFileSync(join(kitDir(project, id), 'kit.json'), 'utf8');
  return JSON.parse(text) as Record<string, unknown>;
}

/** A file of `size` bytes that starts with `head`. */
function bytesOf(head: number[], size = head.length): Uint8Array {
  const bytes = new Uint8Array(size);
  bytes.set(head);
  return bytes;
}

function writeBytes(project: string, path: string, bytes: Uint8Array): void {
  const file = join(project, ...path.split('/'));
  mkdirSync(dirname(file), { recursive: true });
  writeFileSync(file, bytes);
}

const REACT = { react: { version: '19.3.1' }, 'react-dom': { version: '19.3.1' } };

test('imageType reads PNG, JPEG and WebP by their first bytes only', () => {
  assert.equal(imageType(Uint8Array.from(PNG)), 'png');
  assert.equal(imageType(Uint8Array.from(JPEG)), 'jpeg');
  assert.equal(imageType(Uint8Array.from(WEBP)), 'webp');
  for (const bad of [
    [],
    [0x89, 0x50, 0x4e, 0x47],
    [0x52, 0x49, 0x46, 0x46, 0, 0, 0, 0, 0x57, 0x41, 0x56, 0x45], // RIFF WAVE
    [...'GIF89a'].map((c) => c.charCodeAt(0)),
    [...'<svg xmlns="x"/>'].map((c) => c.charCodeAt(0)),
  ]) {
    assert.equal(imageType(Uint8Array.from(bad)), undefined, bad.join(','));
  }
});

test('a figma kit keeps the link and writes the skeleton', () => {
  const project = tempProject({}, REACT);
  const created = newKit(deps(project), 'site', { type: 'figma', value: FIGMA });
  assert.deepEqual(created, {
    id: 'site',
    path: kitDir(project),
    source: { type: 'figma', url: FIGMA },
    skipped: [],
  });
  assert.deepEqual(readKitJson(project), {
    schemaVersion: 1,
    id: 'site',
    name: 'site',
    version: '0.0.0',
    source: { type: 'figma', url: FIGMA },
    framework: 'react',
    runtime: {
      packages: [
        { name: 'react', version: '19.3.1' },
        { name: 'react-dom', version: '19.3.1' },
      ],
      entry: 'generated/kit.ts',
      styles: { files: [], generated: 'none', imports: [] },
      providers: [],
      clientOnly: false,
    },
    tokens: { file: 'json/tokens.json', format: 'dtcg-2025.10' },
    components: [],
    gaps: [],
  });
  assert.equal(readFileSync(join(kitDir(project), 'json', 'tokens.json'), 'utf8'), '{}\n');
  assert.equal(existsSync(join(kitDir(project), 'generated', 'kit.ts')), true);
});

test('a link that is not a Figma design or file is refused', () => {
  const project = tempProject();
  const key = 'a'.repeat(22);
  for (const value of [
    `http://www.figma.com/design/${key}`,
    `https://www.figma.com/proto/${key}/x`,
    'https://www.figma.com/design/short/x',
    `https://figma.com.evil.example/design/${key}`,
    'https://example.com/',
    'figma',
  ]) {
    assert.throws(
      () => newKit(deps(project), 'site', { type: 'figma', value }),
      fails('KIT_SOURCE_INVALID'),
      value,
    );
  }
  assert.equal(existsSync(kitDir(project)), false);
  // The older /file/ links are the same file.
  const old = `https://www.figma.com/file/${'B'.repeat(22)}/Old`;
  assert.equal(newKit(deps(project), 'site', { type: 'figma', value: old }).source.type, 'figma');
});

test('a web kit stores the address as written, and nothing is fetched', () => {
  const project = tempProject();
  const created = newKit(deps(project), 'site', {
    type: 'web',
    value: 'http://127.0.0.1:8080/a?b=1',
  });
  assert.deepEqual(created.source, { type: 'web', urls: ['http://127.0.0.1:8080/a?b=1'] });
  assert.deepEqual(created.skipped, []);
  const kit = readKitJson(project) as { version: string; runtime: { packages: unknown } };
  assert.equal(kit.version, '0.0.0');
  assert.deepEqual(kit.runtime.packages, []);
});

test('an address that is not http or https, or has user info, is refused', () => {
  const project = tempProject();
  for (const value of [
    'ftp://example.com/',
    'example.com',
    'file:///etc/passwd',
    'https://u:p@x.test/',
    'https://',
  ]) {
    assert.throws(
      () => newKit(deps(project), 'site', { type: 'web', value }),
      fails('KIT_SOURCE_INVALID'),
      value,
    );
  }
  assert.equal(existsSync(kitDir(project)), false);
});

test('an images kit copies PNG, JPEG and WebP files, and names every file it skipped', () => {
  const project = tempProject({}, REACT);
  writeBytes(project, 'shots/home.png', bytesOf(PNG, 20));
  writeBytes(project, 'shots/mobile/menu.jpg', bytesOf(JPEG, 12));
  writeBytes(project, 'shots/about.webp', bytesOf(WEBP, 16));
  writeBytes(
    project,
    'shots/notes.md',
    Uint8Array.from([...'# notes'].map((c) => c.charCodeAt(0))),
  );
  writeBytes(
    project,
    'shots/fake.png',
    Uint8Array.from([...'not a png'].map((c) => c.charCodeAt(0))),
  );
  writeBytes(project, 'shots/huge.png', bytesOf(PNG, MB10 + 1));
  writeBytes(project, 'shots/my shot.png', bytesOf(PNG, 20));
  writeBytes(project, 'shots/Upper.PNG', bytesOf(PNG, 20));

  const created = newKit(deps(project), 'site', { type: 'images', value: 'shots' });
  assert.deepEqual(created.source, { type: 'images' });
  assert.deepEqual(created.skipped, [
    { file: 'shots/Upper.PNG', reason: BAD_NAME },
    { file: 'shots/fake.png', reason: 'kits.new.skip.type' },
    { file: 'shots/huge.png', reason: 'kits.new.skip.size' },
    { file: 'shots/my shot.png', reason: BAD_NAME },
    { file: 'shots/notes.md', reason: 'kits.new.skip.type' },
  ]);

  const images = join(kitDir(project), 'source', 'images');
  assert.deepEqual([...readFileSync(join(images, 'home.png'))], [...bytesOf(PNG, 20)]);
  assert.deepEqual([...readFileSync(join(images, 'mobile', 'menu.jpg'))], [...bytesOf(JPEG, 12)]);
  assert.deepEqual([...readFileSync(join(images, 'about.webp'))], [...bytesOf(WEBP, 16)]);
  for (const missing of ['notes.md', 'fake.png', 'huge.png', 'my shot.png', 'Upper.PNG']) {
    assert.equal(existsSync(join(images, missing)), false, missing);
  }
  assert.deepEqual(readKitJson(project).source, { type: 'images' });
});

test('an image of exactly 10 MB is copied', () => {
  const project = tempProject();
  writeBytes(project, 'shots/edge.png', bytesOf(PNG, MB10));
  const created = newKit(deps(project), 'site', { type: 'images', value: 'shots' });
  assert.deepEqual(created.skipped, []);
  assert.equal(existsSync(join(kitDir(project), 'source', 'images', 'edge.png')), true);
});

test('200 images are enough, 201 are refused before anything is written', () => {
  const project = tempProject();
  for (let index = 0; index < 200; index += 1) {
    writeBytes(project, `shots/s${index}.png`, bytesOf(PNG));
  }
  assert.equal(newKit(deps(project), 'ok', { type: 'images', value: 'shots' }).skipped.length, 0);
  writeBytes(project, 'shots/s200.png', bytesOf(PNG));
  assert.throws(
    () => newKit(deps(project), 'site', { type: 'images', value: 'shots' }),
    fails('KIT_SOURCE_INVALID'),
  );
  assert.equal(existsSync(kitDir(project)), false);
});

test('a folder without images, a missing folder or a file is refused', () => {
  const project = tempProject({ 'docs/readme.md': 'text', 'docs/shot.png': 'not an image' });
  for (const value of ['docs', 'nope', 'docs/readme.md']) {
    assert.throws(
      () => newKit(deps(project), 'site', { type: 'images', value }),
      fails('KIT_SOURCE_INVALID'),
      value,
    );
  }
  assert.equal(existsSync(kitDir(project)), false);
});

test('an images path that leaves the project is refused', () => {
  const project = tempProject();
  for (const value of ['../shots', 'a/../../shots', '/abs/shots', 'C:/shots', 'node_modules/x']) {
    assert.throws(
      () => newKit(deps(project), 'site', { type: 'images', value }),
      fails('KIT_SOURCE_INVALID'),
      value,
    );
  }
  const outside = tempDir();
  writeBytes(outside, 'a.png', bytesOf(PNG));
  mkdirSync(join(project, 'src'), { recursive: true });
  symlinkSync(
    outside,
    join(project, 'src', 'link'),
    process.platform === 'win32' ? 'junction' : 'dir',
  );
  assert.throws(
    () => newKit(deps(project), 'site', { type: 'images', value: 'src/link' }),
    fails('KIT_SOURCE_INVALID'),
  );
  assert.equal(existsSync(kitDir(project)), false);
});

test('a written kit is not refused for Tailwind v3, and an npm and repo kit report no skipped files', () => {
  const project = tempProject({ 'src/ds/Button.tsx': '' }, { tailwindcss: { version: '3.4.17' } });
  assert.equal(
    newKit(deps(project), 'site', { type: 'web', value: 'https://example.com/' }).id,
    'site',
  );
  assert.throws(
    () => newKit(deps(project), 'firma', { type: 'repo', value: 'src/ds' }),
    fails('KIT_SOURCE_INVALID'),
  );
  const plain = tempProject({ 'src/ds/Button.tsx': '' });
  assert.deepEqual(newKit(deps(plain), 'firma', { type: 'repo', value: 'src/ds' }).skipped, []);
});

test('an id that is taken is refused for a written kit too', () => {
  const project = tempProject();
  newKit(deps(project), 'site', { type: 'web', value: 'https://example.com/' });
  assert.throws(
    () => newKit(deps(project), 'site', { type: 'figma', value: FIGMA }),
    fails('KIT_EXISTS'),
  );
  assert.throws(
    () => newKit(deps(project), 'tiny', { type: 'figma', value: FIGMA }),
    fails('KIT_EXISTS'),
  );
});
