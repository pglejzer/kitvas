import assert from 'node:assert/strict';
import { existsSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { test } from 'node:test';
import { createFolderKitStore } from '../../src/kit/adapters/folder-store.ts';
import { type BuildReport, buildDraft } from '../../src/render/index.ts';
import { KitvasError } from '../../src/shared/index.ts';
import { shopDraft } from '../helpers/draft/drafts.ts';
import { HERO_TSX, renderTools, writeShopSections } from '../helpers/draft/render.ts';
import { FIXTURE_KITS } from '../helpers/kit/kits.ts';
import { at, keysAt, parseJson } from './helpers/json.ts';

const kits = createFolderKitStore(FIXTURE_KITS);

/** A `shop` draft with its sections written, and a `build()` that uses the real tools. */
function workshop() {
  const { store, root } = shopDraft();
  const dir = join(root, 'shop');
  writeShopSections(dir);
  const tools = renderTools();
  const build = (): Promise<BuildReport> => buildDraft({ drafts: store, kits, ...tools }, 'shop');
  const close = async (): Promise<void> => {
    await tools.bundler.dispose();
    await tools.styles.dispose();
  };
  const read = (...parts: string[]): string => readFileSync(join(dir, 'v1', ...parts), 'utf8');
  return { store, dir, build, close, read };
}

test('builds the page, the script, the sheet and the id map', async () => {
  const shop = workshop();
  try {
    shop.store.writeText(
      'shop',
      'v1/src/img/logo.svg',
      '<svg xmlns="http://www.w3.org/2000/svg"/>',
    );
    const report = await shop.build();
    assert.deepEqual(report, {
      slug: 'shop',
      version: 1,
      built: true,
      cached: false,
      errors: [],
      warnings: [],
      elements: 10,
      files: {
        html: 'v1/build/html/index.html',
        js: 'v1/build/js/index.js',
        css: 'v1/build/css/index.css',
        ids: 'v1/build/json/ids.json',
      },
      path: join(shop.dir, 'v1', 'build', 'html', 'index.html'),
    });

    assert.ok(shop.read('build', 'html', 'index.html').includes('<title>Shop</title>'));
    const css = shop.read('build', 'css', 'index.css');
    assert.match(css, /^:root \{\n {2}--kit-/);
    for (const part of ['--kit-color-ink:', '.tiny-button--plain', '.hero {', '.order-summary {']) {
      assert.ok(css.includes(part), part);
    }
    assert.ok(css.indexOf('.tiny-button') < css.indexOf('.hero {'), 'kit styles come first');

    const js = shop.read('build', 'js', 'index.js');
    assert.ok(js.includes('"sections/Hero:section/Button.2"'));
    assert.ok(js.includes('tiny-button'));

    const ids = parseJson(shop.read('build', 'json', 'ids.json'));
    assert.deepEqual(keysAt(ids, 'ids'), [
      'index:Hero',
      'index:OrderSummary',
      'sections/Hero:section',
      'sections/Hero:section/h1',
      'sections/Hero:section/p',
      'sections/Hero:section/Button',
      'sections/Hero:section/Button.2',
      'sections/OrderSummary:aside',
      'sections/OrderSummary:aside/Icon',
      'sections/OrderSummary:aside/Button',
    ]);
    assert.deepEqual(at(ids, 'ids', 'sections/Hero:section/Button.2'), {
      file: 'src/tsx/sections/Hero.tsx',
      line: 9,
      column: 7,
      tag: 'Button',
    });
    assert.ok(existsSync(join(shop.dir, 'v1', 'build', 'img', 'logo.svg')));
    // Only a Tailwind kit leaves the classes it could not explain.
    assert.equal(existsSync(join(shop.dir, 'v1', 'build', 'json', 'tailwind.json')), false);
    const stamp = parseJson(shop.read('build', 'json', 'build.json'));
    assert.deepEqual(keysAt(stamp), ['schemaVersion', 'key', 'elements', 'utility']);
    assert.deepEqual(
      [at(stamp, 'schemaVersion'), at(stamp, 'elements'), at(stamp, 'utility')],
      [1, 10, []],
    );
  } finally {
    await shop.close();
  }
});

test('nothing changed: the build is skipped; a change builds again', async () => {
  const shop = workshop();
  try {
    await shop.build();
    const again = await shop.build();
    assert.equal(again.cached, true);
    assert.equal(again.built, true);
    assert.equal(again.elements, 10);

    shop.store.writeText('shop', 'v1/src/scss/sections/hero.scss', '.hero {\n  margin: 0;\n}\n');
    const changed = await shop.build();
    assert.equal(changed.cached, false);
    assert.ok(shop.read('build', 'css', 'index.css').includes('margin: 0'));

    rmSync(join(shop.dir, 'v1', 'build', 'html', 'index.html'));
    assert.equal((await shop.build()).cached, false);
  } finally {
    await shop.close();
  }
});

test('the options of the version go into the bundle; none leaves the bundle without them', async () => {
  const shop = workshop();
  try {
    await shop.build();
    assert.ok(!shop.read('build', 'js', 'index.js').includes('"columns"'));

    const options = [
      {
        id: 'columns',
        label: 'Columns',
        default: '3',
        values: [
          { id: '3', label: 'Three' },
          { id: '2', label: 'Two' },
        ],
      },
    ];
    shop.store.writeText(
      'shop',
      'v1/src/json/options.json',
      JSON.stringify({ schemaVersion: 1, options }),
    );
    const report = await shop.build();
    assert.equal(report.cached, false, 'a new options file builds again');
    assert.ok(shop.read('build', 'js', 'index.js').includes('"columns"'));
    assert.ok(existsSync(join(shop.dir, 'v1', 'src', 'tsx', 'options.ts')));
  } finally {
    await shop.close();
  }
});

test('a syntax error is reported with file and line and leaves the last build alone', async () => {
  const shop = workshop();
  try {
    await shop.build();
    const before = shop.read('build', 'js', 'index.js');
    const file = join(shop.dir, 'v1', 'src', 'tsx', 'sections', 'Hero.tsx');
    writeFileSync(file, HERO_TSX.replace('</section>', ''));
    const broken = await shop.build();
    assert.equal(broken.built, false);
    assert.equal(broken.cached, false);
    assert.equal(broken.errors[0]?.source, 'bundle');
    assert.equal(broken.errors[0]?.file, 'src/tsx/sections/Hero.tsx');
    assert.ok((broken.errors[0]?.line ?? 0) > 0);
    assert.ok((broken.errors[0]?.message ?? '').length > 0);
    assert.equal(shop.read('build', 'js', 'index.js'), before);

    writeFileSync(file, HERO_TSX);
    const fixed = await shop.build();
    assert.equal(fixed.built, true);
    assert.equal(fixed.cached, false);
  } finally {
    await shop.close();
  }
});

test('a missing section sheet is a styles error', async () => {
  const shop = workshop();
  try {
    rmSync(join(shop.dir, 'v1', 'src', 'scss', 'sections', 'hero.scss'));
    const report = await shop.build();
    assert.equal(report.built, false);
    const error = report.errors.find((candidate) => candidate.source === 'styles');
    assert.equal(error?.file, 'src/scss/index.scss');
    assert.ok((error?.line ?? 0) > 0);
  } finally {
    await shop.close();
  }
});

test('a section file that is not written yet is a bundle error', async () => {
  const shop = workshop();
  try {
    rmSync(join(shop.dir, 'v1', 'src', 'tsx', 'sections', 'OrderSummary.tsx'));
    const report = await shop.build();
    assert.equal(report.built, false);
    assert.equal(report.errors[0]?.file, 'src/tsx/index.tsx');
  } finally {
    await shop.close();
  }
});

test('a layout with problems is refused before anything is built', async () => {
  const shop = workshop();
  try {
    shop.store.writeText('shop', 'v1/md/layout.md', '# Layout: Shop\n');
    await assert.rejects(
      shop.build(),
      (error: unknown) =>
        error instanceof KitvasError &&
        error.code === 'DRAFT_INVALID' &&
        error.params.detail === 'layout',
    );
    assert.equal(existsSync(join(shop.dir, 'v1', 'build')), false);
  } finally {
    await shop.close();
  }
});
