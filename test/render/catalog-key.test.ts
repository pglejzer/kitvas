import assert from 'node:assert/strict';
import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { test } from 'node:test';
import { createFolderKitStore } from '../../src/kit/adapters/folder-store.ts';
import { createNodeBuildFs } from '../../src/render/adapters/node-build-fs.ts';
import {
  buildCatalog,
  CATALOG_STAMP,
  currentCatalogKey,
  readCatalogStamp,
} from '../../src/render/index.ts';
import { KitvasError } from '../../src/shared/index.ts';
import { closeRenderTools, renderTools } from '../helpers/draft/render.ts';
import { copyKit, tinyKitJson } from '../helpers/kit/kits.ts';
import { tempDir } from '../helpers/tmp.ts';

test('the current key is the stamp key after a build and another one once the kit changes', async () => {
  const root = copyKit('tiny');
  const kits = createFolderKitStore(root);
  const tools = renderTools();
  const dir = join(tempDir('kitvas-catalog-'), 'tiny');
  try {
    await buildCatalog({ kits, ...tools }, 'tiny', dir);
    const text = readFileSync(join(dir, CATALOG_STAMP), 'utf8');
    const key = currentCatalogKey({ kits, ...tools }, 'tiny', dir);
    assert.equal(key, readCatalogStamp(text)?.key);
    assert.equal(readFileSync(join(dir, CATALOG_STAMP), 'utf8'), text, 'nothing is written');

    const json = tinyKitJson();
    json.icons = { source: 'component', component: 'Icon', names: ['check'] };
    writeFileSync(join(root, 'tiny', 'kit.json'), JSON.stringify(json, null, 2));
    assert.notEqual(currentCatalogKey({ kits, ...tools }, 'tiny', dir), key);
  } finally {
    await closeRenderTools(tools);
  }
});

test('the current key of a kit that is not there throws as a build does', () => {
  const kits = createFolderKitStore(copyKit('tiny'));
  const deps = { kits, fs: createNodeBuildFs(), runtimeFiles: [] };
  assert.throws(
    () => currentCatalogKey(deps, 'nokit', tempDir()),
    (error: unknown) => error instanceof KitvasError && error.code === 'KIT_NOT_FOUND',
  );
});
