// Builds with the project's additions (C7), with the real tools: a built-in kit and the npm
// fixture kit each take a crafted component into their catalog and their `@kit` entry, and the
// npm package is never touched.

import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { existsSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join, relative } from 'node:path';
import { test } from 'node:test';
import { createFolderKitStore } from '../../src/kit/adapters/folder-store.ts';
import { createFolderKitWriter } from '../../src/kit/adapters/folder-writer.ts';
import { createLayeredKitStore } from '../../src/kit/adapters/layered-store.ts';
import { buildCatalog, buildDraft } from '../../src/render/index.ts';
import { catalogDir, projectKitsDir } from '../../src/shared/index.ts';
import { shopDraft } from '../helpers/drafts.ts';
import { builtinKits } from '../helpers/kits.ts';
import { fixtureProject, removeFixture } from '../helpers/projects.ts';
import { closeRenderTools, HERO_TSX, renderTools, writeShopSections } from '../helpers/render.ts';
import { additionsProject, STAR_PATH, star, starFile } from '../kit/helpers/additions.ts';

/** sha256 of every file under `dir`, by its path from `dir`. */
function treeHash(dir: string): string {
  const hash = createHash('sha256');
  const files = readdirSync(dir, { recursive: true, withFileTypes: true })
    .filter((entry) => entry.isFile())
    .map((entry) => join(entry.parentPath, entry.name))
    .sort();
  for (const file of files) hash.update(relative(dir, file)).update(readFileSync(file));
  return hash.digest('hex');
}

test('a built-in kit with an addition: the catalog shows it and a draft imports it from @kit', async () => {
  const shop = additionsProject();
  shop.writer.writeAddition('tiny', star(), [starFile()], false);
  const tools = renderTools();
  try {
    const dir = catalogDir(shop.project, 'tiny');
    const deps = { kits: shop.kits, ...tools, kitWriter: shop.writer };
    const catalog = await buildCatalog(deps, 'tiny', dir);
    assert.deepEqual(catalog.errors, []);
    assert.deepEqual(catalog.shown, ['Button.1', 'Star.1']);
    assert.ok(readFileSync(join(dir, 'build', 'js', 'index.js'), 'utf8').includes(STAR_PATH));
    // The entry that adds the star to the built-in kit lives in the project, not in the kit.
    assert.ok(existsSync(join(shop.additionsDir('tiny'), 'generated', 'kit.ts')));
    assert.equal((await buildCatalog(deps, 'tiny', dir)).cached, true);

    const { store, root } = shopDraft();
    const draftDir = join(root, 'shop');
    writeShopSections(draftDir);
    writeFileSync(
      join(draftDir, 'v1', 'src', 'tsx', 'sections', 'Hero.tsx'),
      HERO_TSX.replace(
        "import { Button } from '@kit';",
        "import { Button, Star } from '@kit';",
      ).replace('<h1>Shop</h1>', '<h1>Shop <Star size={16} /></h1>'),
    );
    const report = await buildDraft({ drafts: store, ...deps }, 'shop');
    assert.deepEqual(report.errors, []);
    assert.equal(report.built, true);
    const js = readFileSync(join(draftDir, 'v1', 'build', 'js', 'index.js'), 'utf8');
    assert.ok(js.includes(STAR_PATH));

    // A changed addition builds again.
    shop.writer.writeAddition(
      'tiny',
      star(),
      [starFile(starFile().text.replace('24', '20'))],
      true,
    );
    assert.equal((await buildDraft({ drafts: store, ...deps }, 'shop')).cached, false);
  } finally {
    await closeRenderTools(tools);
  }
});

test('the npm fixture kit with an addition: catalog and entry have it, the package is untouched', async () => {
  const { dir, kitId } = fixtureProject('acme-npm');
  const kits = createLayeredKitStore(builtinKits(), {
    dir,
    store: createFolderKitStore(projectKitsDir(dir)),
  });
  const writer = createFolderKitWriter(projectKitsDir(dir), { kits });
  const pkg = join(dir, 'node_modules', '@acme', 'ui');
  const before = treeHash(pkg);
  const tools = renderTools();
  try {
    writer.writeAddition(kitId, star(), [starFile()], false);
    const catalogFolder = catalogDir(dir, kitId);
    const catalog = await buildCatalog({ kits, ...tools, kitWriter: writer }, kitId, catalogFolder);
    assert.deepEqual(catalog.errors, []);
    assert.deepEqual(catalog.shown, ['Button.1', 'Button.2', 'TextField.1', 'Badge.1', 'Star.1']);
    const entry = readFileSync(join(projectKitsDir(dir), kitId, 'generated', 'kit.ts'), 'utf8');
    assert.equal(
      entry.split('\n').at(-2),
      'export { Star } from "../../../additions/acme/components/Star";',
    );
    const js = readFileSync(join(catalogFolder, 'build', 'js', 'index.js'), 'utf8');
    assert.ok(js.includes(STAR_PATH));
    assert.ok(js.includes('acme-root'), 'the package still renders the kit own components');
    assert.equal(treeHash(pkg), before);
  } finally {
    await closeRenderTools(tools);
    removeFixture(dir);
  }
});
