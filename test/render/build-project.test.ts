// Drafts and catalogs of project kits, built with the real tools on the fixture projects of
// test/fixtures/projects (C8): an npm package, a folder of the project's own components with CSS
// Modules and SCSS, and a shadcn-style folder with Tailwind v4.

import assert from 'node:assert/strict';
import {
  appendFileSync,
  cpSync,
  existsSync,
  mkdirSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { dirname, join } from 'node:path';
import { test } from 'node:test';
import { createFsDraftStore } from '../../src/drafts/adapters/fs-draft-store.ts';
import { createDraft } from '../../src/drafts/index.ts';
import { GENERATED_ENTRY, type KitWriter, loadKit } from '../../src/kit/index.ts';
import { buildCatalog, buildDraft, type CatalogReport } from '../../src/render/index.ts';
import { catalogDir, PLUGIN_ROOT, projectKitsDir, workspaceDir } from '../../src/shared/index.ts';
import { NOW } from '../helpers/drafts.ts';
import { type FixtureName, fixtureProject } from '../helpers/projects.ts';
import { closeRenderTools, projectKitStore, renderTools } from '../helpers/render.ts';
import { parseJson } from './helpers/json.ts';

const FIXTURES = join(PLUGIN_ROOT, 'test', 'fixtures', 'projects');

/** A KitWriter over the project's kit folders that notes what it wrote. */
function folderWriter(project: string): KitWriter & { written: string[] } {
  const root = projectKitsDir(project);
  const written: string[] = [];
  return {
    written,
    readText(id, relPath) {
      const file = join(root, id, ...relPath.split('/'));
      return existsSync(file) ? readFileSync(file, 'utf8') : undefined;
    },
    writeText(id, relPath, text) {
      const file = join(root, id, ...relPath.split('/'));
      mkdirSync(dirname(file), { recursive: true });
      writeFileSync(file, text);
      written.push(`${id}/${relPath}`);
    },
    writeBytes(id, relPath, bytes) {
      const file = join(root, id, ...relPath.split('/'));
      mkdirSync(dirname(file), { recursive: true });
      writeFileSync(file, bytes);
      written.push(`${id}/${relPath}`);
    },
    remove(id, relPath) {
      rmSync(join(root, id, ...relPath.split('/')), { recursive: true, force: true });
    },
    writeAddition() {
      throw new Error('these builds add nothing');
    },
    exportFiles() {
      throw new Error('these builds export nothing');
    },
  };
}

/** A fixture project with the fixture's draft as `page`, version 1, and the real tools. */
function projectDraft(name: FixtureName) {
  const project = fixtureProject(name);
  const kits = projectKitStore(project.dir);
  const loaded = loadKit(kits, project.kitId);
  const root = join(workspaceDir(project.dir), 'drafts');
  const store = createFsDraftStore(root);
  const kit = { id: project.kitId, version: loaded.kit.version, hash: loaded.hash };
  createDraft(store, { slug: 'page', title: 'Page', kit, now: NOW });
  const versionDir = join(root, 'page', 'v1');
  cpSync(join(FIXTURES, name, 'draft'), versionDir, { recursive: true });
  const tools = renderTools();
  const writer = folderWriter(project.dir);
  const build = (withWriter = false) =>
    buildDraft(
      { drafts: store, kits, ...tools, ...(withWriter ? { kitWriter: writer } : {}) },
      'page',
    );
  const catalog = (probe?: string[]): Promise<CatalogReport> =>
    buildCatalog(
      { kits, ...tools },
      project.kitId,
      catalogDir(project.dir, project.kitId),
      probe ? { probe } : {},
    );
  const read = (...parts: string[]): string => readFileSync(join(versionDir, ...parts), 'utf8');
  return {
    ...project,
    versionDir,
    writer,
    build,
    catalog,
    read,
    close: () => closeRenderTools(tools),
  };
}

test('a Tailwind draft: tokens onto the theme, utilities of the draft and the kit, unknown classes', async () => {
  const shad = projectDraft('acme-tailwind');
  try {
    const report = await shad.build();
    assert.deepEqual(report.errors, []);
    assert.equal(report.built, true);
    const css = shad.read('build', 'css', 'index.css');
    assert.match(css, /^:root \{\n {2}--kit-/);
    for (const part of [
      '--kit-color-primary: var(--primary);',
      '--primary: oklch(0.21 0.006 285.885)',
      // Mapped theme variables are always there, even when no class uses them.
      '--radius-md: 8px',
      '--color-primary-foreground: #f8fafc',
      '.gap-4',
      '.text-2xl',
      // Classes written in the kit's own components.
      '.bg-primary',
      '.rounded-md',
    ]) {
      assert.ok(css.includes(part), part);
    }
    assert.ok(!css.includes('--color-red-500'));
    assert.ok(css.indexOf('.gap-4') < css.lastIndexOf('color: var(--kit-color-primary)'));
    assert.deepEqual(parseJson(shad.read('build', 'json', 'tailwind.json')), {
      schemaVersion: 1,
      unknown: [],
    });

    const hero = join(shad.versionDir, 'src', 'tsx', 'sections', 'Hero.tsx');
    writeFileSync(hero, readFileSync(hero, 'utf8').replace('gap-4 p-6', 'gap-4 p-6 not-a-class'));
    assert.equal((await shad.build()).cached, false);
    assert.deepEqual(parseJson(shad.read('build', 'json', 'tailwind.json')), {
      schemaVersion: 1,
      unknown: ['not-a-class'],
    });
    assert.equal((await shad.build()).cached, true);

    // The Tailwind entry is outside the kit's folder: its change still builds again.
    appendFileSync(
      join(shad.dir, 'src', 'app', 'globals.css'),
      '\n.added-by-test {\n  margin: 0;\n}\n',
    );
    assert.equal((await shad.build()).cached, false);
    assert.ok(shad.read('build', 'css', 'index.css').includes('.added-by-test'));
  } finally {
    await shad.close();
  }
});

test('a Tailwind catalog: examples as sources, probed variables, verify.json kept', async () => {
  const shad = projectDraft('acme-tailwind');
  const dir = catalogDir(shad.dir, shad.kitId);
  mkdirSync(dir, { recursive: true });
  writeFileSync(join(dir, 'verify.json'), '{"kept":true}\n');
  try {
    const report = await shad.catalog(['--color-red-500']);
    assert.deepEqual(report.errors, []);
    assert.deepEqual(report.shown, ['Button.1', 'Button.2', 'Card.1']);
    const css = readFileSync(join(dir, 'build', 'css', 'index.css'), 'utf8');
    for (const part of ['--color-red-500:', '--radius-md: 8px', '.bg-primary', '.border-primary']) {
      assert.ok(css.includes(part), part);
    }
    const examples = readFileSync(join(dir, 'build', 'json', 'examples.tsx'), 'utf8');
    assert.ok(examples.includes('<Button variant="outline" size="sm">Cancel</Button>'));
    assert.equal(readFileSync(join(dir, 'verify.json'), 'utf8'), '{"kept":true}\n');
    assert.equal(existsSync(join(dir, 'build', 'json', 'tailwind.json')), false);

    assert.equal((await shad.catalog(['--color-red-500'])).cached, true);
    assert.equal((await shad.catalog()).cached, false);
    assert.ok(
      !readFileSync(join(dir, 'build', 'css', 'index.css'), 'utf8').includes('--color-red-500'),
    );
  } finally {
    await shad.close();
  }
});

test('a repo kit: CSS Modules, an SCSS module and global tokens enter the bundle CSS', async () => {
  const firma = projectDraft('acme-repo');
  try {
    // The generated entry is written by the build when a writer is given.
    rmSync(join(projectKitsDir(firma.dir), firma.kitId, ...GENERATED_ENTRY.split('/')));
    const report = await firma.build(true);
    assert.deepEqual(report.errors, []);
    assert.deepEqual(firma.writer.written, [`${firma.kitId}/${GENERATED_ENTRY}`]);
    const css = firma.read('build', 'css', 'index.css');
    for (const part of [
      '--kit-color-ink: var(--ds-ink);',
      '--ds-ink: #222222',
      '.Button_button',
      '.Card_module_card',
    ]) {
      assert.ok(css.includes(part), part);
    }
    // Tokens, then the kit's CSS from the bundle, then the draft's own sheets.
    assert.ok(css.indexOf('--kit-color-ink') < css.indexOf('.Button_button'));
    assert.ok(css.indexOf('.Button_button') < css.indexOf('.intro {'));
    assert.equal(existsSync(join(firma.versionDir, 'build', 'json', 'tailwind.json')), false);

    assert.equal((await firma.build(true)).cached, true);
    // The kit's components live in the project: a change there builds again.
    appendFileSync(
      join(firma.dir, 'src', 'ds', 'Button.module.css'),
      '\n.wide {\n  width: 100%;\n}\n',
    );
    assert.equal((await firma.build(true)).cached, false);
    assert.ok(firma.read('build', 'css', 'index.css').includes('.Button_wide'));
  } finally {
    await firma.close();
  }
});

test('an npm kit: the package, its stylesheet and its provider from the project', async () => {
  const acme = projectDraft('acme-npm');
  try {
    const report = await acme.build();
    assert.deepEqual(report.errors, []);
    const css = acme.read('build', 'css', 'index.css');
    assert.ok(css.includes('--kit-color-ink: var(--acme-color-ink);'));
    assert.ok(css.includes('.acme-button--solid'));
    const js = acme.read('build', 'js', 'index.js');
    assert.ok(js.includes('acme-root'));
    assert.ok(js.includes('"sections/Signup:div/Button"'));

    const catalog = await acme.catalog();
    assert.deepEqual(catalog.errors, []);
    assert.deepEqual(catalog.shown, ['Button.1', 'Button.2', 'TextField.1', 'Badge.1']);
  } finally {
    await acme.close();
  }
});
