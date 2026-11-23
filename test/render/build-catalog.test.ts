import assert from 'node:assert/strict';
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { test } from 'node:test';
import { createFolderKitStore } from '../../src/kit/adapters/folder-store.ts';
import { loadKit } from '../../src/kit/index.ts';
import {
  buildCatalog,
  CATALOG_PAGE,
  CATALOG_STAMP,
  type CatalogReport,
  readCatalogStamp,
} from '../../src/render/index.ts';
import { KitvasError } from '../../src/shared/index.ts';
import { builtinKits, copyKit, tinyKitJson } from '../helpers/kits.ts';
import { renderTools } from '../helpers/render.ts';
import { tempDir } from '../helpers/tmp.ts';

type Example = { title: string; code: string; imports: string[]; reference?: string };

/** A copy of the tiny kit whose Button and Icon carry the given examples. */
function kitWith(buttonExamples: Example[], iconExamples: Example[] = []): string {
  const root = copyKit('tiny');
  const json = tinyKitJson() as { components: { name: string; examples?: Example[] }[] };
  for (const component of json.components) {
    if (component.name === 'Button') component.examples = buttonExamples;
    if (component.name === 'Icon') component.examples = iconExamples;
  }
  writeFileSync(join(root, 'tiny', 'kit.json'), JSON.stringify(json, null, 2));
  return root;
}

const button = (title: string, code: string): Example => ({ title, code, imports: ['Button'] });

/** A catalog folder that does not exist yet, and a `build()` that uses the real tools. */
function workshop(kitsRoot: string, kitId = 'tiny') {
  const dir = join(tempDir('kitvas-catalog-'), kitId);
  const tools = renderTools();
  const kits = createFolderKitStore(kitsRoot);
  const build = (): Promise<CatalogReport> => buildCatalog({ kits, ...tools }, kitId, dir);
  const close = async (): Promise<void> => {
    await tools.bundler.dispose();
    await tools.styles.dispose();
  };
  const read = (...parts: string[]): string => readFileSync(join(dir, 'build', ...parts), 'utf8');
  const stamp = () =>
    readCatalogStamp(
      existsSync(join(dir, CATALOG_STAMP))
        ? readFileSync(join(dir, CATALOG_STAMP), 'utf8')
        : undefined,
    );
  return { dir, build, close, read, stamp };
}

test('builds the page, the script, the sheet and the stamp', async () => {
  const shop = workshop(kitWith([button('Solid', '<Button>Save</Button>')]));
  try {
    const report = await shop.build();
    assert.deepEqual(report, {
      id: 'tiny',
      built: true,
      cached: false,
      shown: ['Button.1'],
      skipped: [],
      errors: [],
      path: join(shop.dir, CATALOG_PAGE),
    });
    assert.ok(shop.read('html', 'index.html').includes('<title>Tiny examples</title>'));
    const css = shop.read('css', 'index.css');
    assert.match(css, /^:root \{\n {2}--kit-/);
    assert.ok(css.includes('.tiny-button--plain'));
    assert.ok(css.indexOf('.tiny-button') < css.indexOf('body {'), 'the page rule comes last');
    assert.ok(css.includes('padding: 16px'));
    const js = shop.read('js', 'index.js');
    assert.ok(js.includes('Button.1'));
    assert.ok(js.includes('tiny-button'));

    const stamp = shop.stamp();
    assert.equal(stamp?.schemaVersion, 1);
    assert.equal(stamp?.kit, 'tiny');
    assert.match(stamp?.key ?? '', /^[0-9a-f]{64}$/);
    assert.deepEqual(stamp?.shown, ['Button.1']);
    assert.deepEqual(stamp?.skipped, []);
  } finally {
    await shop.close();
  }
});

test('example keys follow the catalog order, one number per component', async () => {
  const shop = workshop(
    kitWith(
      [
        button('Solid', '<Button>Save</Button>'),
        button('Plain', '<Button variant="plain">No</Button>'),
      ],
      [{ title: 'Check', code: '<Icon name="check" />', imports: ['Icon'] }],
    ),
  );
  try {
    const report = await shop.build();
    assert.deepEqual(report.shown, ['Button.1', 'Button.2', 'Icon.1']);
  } finally {
    await shop.close();
  }
});

test('an example that does not parse is skipped and the rest still builds', async () => {
  const shop = workshop(
    kitWith([
      button('Good', '<Button>One</Button>'),
      button('Broken', '<Button>Never-bundled-text'),
      button('Also good', '<Button>Three</Button>'),
    ]),
  );
  try {
    const report = await shop.build();
    assert.equal(report.built, true);
    assert.deepEqual(report.errors, []);
    assert.deepEqual(report.shown, ['Button.1', 'Button.3']);
    assert.deepEqual(report.skipped, ['Button.2']);
    assert.deepEqual(shop.stamp()?.skipped, ['Button.2']);
    assert.ok(!shop.read('js', 'index.js').includes('Never-bundled-text'));
  } finally {
    await shop.close();
  }
});

test('references of shown examples are copied to build/img/refs; a missing file is skipped', async () => {
  const root = kitWith([
    { ...button('Solid', '<Button>Save</Button>'), reference: 'source/refs/Button.1.png' },
    { ...button('Gone', '<Button>Gone</Button>'), reference: 'source/refs/missing.png' },
    { ...button('Broken', '<Button>Broken'), reference: 'source/refs/Button.3.jpg' },
  ]);
  mkdirSync(join(root, 'tiny', 'source', 'refs'), { recursive: true });
  writeFileSync(join(root, 'tiny', 'source', 'refs', 'Button.1.png'), 'png-bytes');
  writeFileSync(join(root, 'tiny', 'source', 'refs', 'Button.3.jpg'), 'jpg-bytes');
  const shop = workshop(root);
  try {
    const report = await shop.build();
    assert.deepEqual(report.errors, []);
    assert.deepEqual(report.shown, ['Button.1', 'Button.2']);
    assert.equal(shop.read('img', 'refs', 'Button.1.png'), 'png-bytes');
    assert.equal(existsSync(join(shop.dir, 'build', 'img', 'refs', 'Button.2.png')), false);
    assert.equal(existsSync(join(shop.dir, 'build', 'img', 'refs', 'Button.3.jpg')), false);
  } finally {
    await shop.close();
  }
});

test('code that breaks out of its fragment is skipped, not bundled', async () => {
  const shop = workshop(kitWith([button('Escape', '</>); throw new Error("x"); (<>')]));
  try {
    const report = await shop.build();
    assert.equal(report.built, true);
    assert.equal(report.shown.length + report.skipped.length, 1);
    if (report.shown.length === 1) assert.ok(shop.read('js', 'index.js').includes('Button.1'));
  } finally {
    await shop.close();
  }
});

test('nothing changed: the second run is cached and reports the stamp', async () => {
  const shop = workshop(
    kitWith([button('Good', '<Button>One</Button>'), button('Broken', '<Button>Two')]),
  );
  try {
    await shop.build();
    const again = await shop.build();
    assert.equal(again.cached, true);
    assert.equal(again.built, true);
    assert.deepEqual(again.shown, ['Button.1']);
    assert.deepEqual(again.skipped, ['Button.2']);

    rmSync(join(shop.dir, CATALOG_PAGE));
    assert.equal((await shop.build()).cached, false);
  } finally {
    await shop.close();
  }
});

test('a change in the kit builds again', async () => {
  const root = kitWith([button('Good', '<Button>One</Button>')]);
  const shop = workshop(root);
  try {
    await shop.build();
    const sheet = join(root, 'tiny', 'scss', 'index.scss');
    writeFileSync(sheet, `${readFileSync(sheet, 'utf8')}\n.added-by-test { margin: 0; }\n`);
    const changed = await shop.build();
    assert.equal(changed.cached, false);
    assert.ok(shop.read('css', 'index.css').includes('.added-by-test'));

    const json = tinyKitJson() as { components: { name: string; examples?: Example[] }[] };
    const first = json.components[0];
    if (first)
      first.examples = [
        button('Good', '<Button>One</Button>'),
        button('New', '<Button>Two</Button>'),
      ];
    writeFileSync(join(root, 'tiny', 'kit.json'), JSON.stringify(json));
    const more = await shop.build();
    assert.equal(more.cached, false);
    assert.deepEqual(more.shown, ['Button.1', 'Button.2']);
  } finally {
    await shop.close();
  }
});

test('an error in the kit leaves the old output, removes the stamp and builds again once fixed', async () => {
  const root = kitWith([button('Good', '<Button>One</Button>')]);
  const shop = workshop(root);
  try {
    await shop.build();
    const before = shop.read('js', 'index.js');
    const entry = join(root, 'tiny', 'tsx', 'index.ts');
    const original = readFileSync(entry, 'utf8');
    writeFileSync(entry, `${original}\nexport const = ;\n`);

    const broken = await shop.build();
    assert.equal(broken.built, false);
    assert.equal(broken.cached, false);
    assert.equal(broken.errors[0]?.source, 'bundle');
    assert.ok((broken.errors[0]?.message ?? '').length > 0);
    assert.equal(shop.stamp(), undefined);
    assert.equal(shop.read('js', 'index.js'), before);

    writeFileSync(entry, original);
    const fixed = await shop.build();
    assert.equal(fixed.built, true);
    assert.equal(fixed.cached, false);
    assert.ok(shop.stamp());
  } finally {
    await shop.close();
  }
});

test('a missing kit stylesheet is a styles error', async () => {
  const root = kitWith([button('Good', '<Button>One</Button>')]);
  writeFileSync(join(root, 'tiny', 'scss', 'index.scss'), '.a { color: $missing; }\n');
  const shop = workshop(root);
  try {
    const report = await shop.build();
    assert.equal(report.built, false);
    assert.ok(report.errors.some((error) => error.source === 'styles'));
    assert.equal(existsSync(join(shop.dir, CATALOG_PAGE)), false);
  } finally {
    await shop.close();
  }
});

test('a kit with problems is refused before anything is built', async () => {
  const root = copyKit('tiny');
  rmSync(join(root, 'tiny', 'scss', 'index.scss'));
  const shop = workshop(root);
  try {
    await assert.rejects(
      shop.build(),
      (error: unknown) => error instanceof KitvasError && error.code === 'KIT_INVALID',
    );
    assert.equal(existsSync(shop.dir), false);
  } finally {
    await shop.close();
  }
});

test('the Base kit builds: every example is shown or skipped, none fails the bundle', async () => {
  const kits = builtinKits();
  const total = loadKit(kits, 'base').kit.components.reduce(
    (sum, component) => sum + component.examples.length,
    0,
  );
  const dir = join(tempDir('kitvas-catalog-'), 'base');
  const tools = renderTools();
  try {
    const report = await buildCatalog({ kits, ...tools }, 'base', dir);
    assert.deepEqual(report.errors, []);
    assert.equal(report.built, true);
    assert.equal(report.shown.length + report.skipped.length, total);
    assert.ok(report.shown.length >= 12, `shown: ${report.shown.length}`);
    // Dialog.1 uses names it does not define; it parses, so the error boundary deals with it.
    assert.ok(report.shown.includes('Dialog.1'));
    assert.ok(existsSync(join(dir, CATALOG_PAGE)));
  } finally {
    await tools.bundler.dispose();
    await tools.styles.dispose();
  }
});
