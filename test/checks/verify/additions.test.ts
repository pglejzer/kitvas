// `kit verify` over the project's additions (C7): their examples are rendered like the kit's own,
// their files are probed where they are, and the tools get the entry that holds them.

import assert from 'node:assert/strict';
import { existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { test } from 'node:test';
import { createTscChecker } from '../../../src/checks/adapters/tsc-checker.ts';
import { type VerifyDeps, verifyKit } from '../../../src/checks/index.ts';
import { createNodeBuildFs } from '../../../src/render/adapters/node-build-fs.ts';
import { PLUGIN_ROOT } from '../../../src/shared/index.ts';
import { closeRenderTools, renderTools } from '../../helpers/render.ts';
import {
  type AdditionsProject,
  additionsProject,
  slashes,
  star,
  starFile,
} from '../../kit/helpers/additions.ts';
import { fakeBrowser, fakeBundler, fakeChecker } from './support.ts';

const AT = '2026-11-23T10:00:00.000Z';

const noProject = (): never => {
  throw new Error('a built-in kit has no project to look at');
};

/** The deps of `verifyKit` over the project's kits, with fakes for every tool; the disk is real. */
function fakeTools(shop: AdditionsProject) {
  const browser = fakeBrowser();
  const bundler = fakeBundler();
  const types = fakeChecker();
  const deps: VerifyDeps = {
    kits: shop.kits,
    kitWriter: shop.writer,
    projectFiles: noProject,
    render: {
      bundler,
      styles: { compile: async () => ({ css: '', errors: [] }), dispose: async () => {} },
      fs: createNodeBuildFs(),
      runtimeFiles: [],
      utility: {
        build: async () => ({ css: '', unknown: [], errors: [], files: [] }),
        dispose: async () => {},
      },
    },
    types,
    browser,
    now: () => new Date(AT),
  };
  return { deps, browser, bundler, types };
}

test('kit verify renders an addition example like the kit own, from the additions entry', async () => {
  const shop = additionsProject();
  shop.writer.writeAddition('tiny', star(), [starFile()], false);
  const { deps, browser, bundler, types } = fakeTools(shop);
  const file = await verifyKit(deps, 'tiny', shop.project);
  assert.deepEqual(file.issues, []);
  assert.equal(file.valid, true);
  assert.deepEqual(
    browser.asked.map((input) => input.search),
    ['?example=Button.1', '?example=Star.1'],
  );

  // The schema step writes the entry; the probe, tsc and the catalog all use it.
  const entry = join(shop.additionsDir('tiny'), 'generated', 'kit.ts');
  assert.ok(existsSync(entry));
  const [probe, catalog] = bundler.bundles;
  const starModule = slashes(join(shop.additionsDir('tiny'), 'components', 'Star'));
  assert.ok(probe?.entry.source.includes(`import { Star as K2 } from "${starModule}";`));
  assert.equal(probe?.alias['@kit'], entry);
  assert.equal(catalog?.alias['@kit'], entry);
  assert.equal(types.inputs[0]?.kitEntry, entry);
});

test('kit verify of a kit without additions is as it was', async () => {
  const shop = additionsProject();
  const { deps, browser, bundler } = fakeTools(shop);
  const file = await verifyKit(deps, 'tiny', shop.project);
  assert.equal(file.valid, true);
  assert.deepEqual(
    browser.asked.map((input) => input.search),
    ['?example=Button.1'],
  );
  const own = join(PLUGIN_ROOT, 'test', 'fixtures', 'kits', 'tiny', 'tsx', 'index.ts');
  assert.equal(bundler.bundles[0]?.alias['@kit'], own);
  assert.equal(existsSync(shop.additionsDir('tiny')), false);
});

test('a broken additions.json fails the schema step and nothing else runs', async () => {
  const shop = additionsProject();
  mkdirSync(shop.additionsDir('tiny'), { recursive: true });
  writeFileSync(join(shop.additionsDir('tiny'), 'additions.json'), '[]');
  const { deps, browser, bundler } = fakeTools(shop);
  const file = await verifyKit(deps, 'tiny', shop.project);
  assert.equal(file.valid, false);
  assert.deepEqual(
    file.issues.map((issue) => [issue.step, issue.path, issue.key, issue.params.at]),
    [['schema', 'additions', 'kitIssue.additionsInvalid', 'additions.json']],
  );
  assert.deepEqual(bundler.bundles, []);
  assert.equal(browser.opened, 0);
});

test('with the real bundler and tsc, an addition of a built-in kit imports and type-checks', async () => {
  const shop = additionsProject();
  shop.writer.writeAddition('tiny', star(), [starFile()], false);
  const tools = renderTools();
  try {
    const file = await verifyKit(
      {
        kits: shop.kits,
        kitWriter: shop.writer,
        projectFiles: noProject,
        render: tools,
        types: createTscChecker({ roots: [PLUGIN_ROOT] }),
        now: () => new Date(AT),
      },
      'tiny',
      shop.project,
    );
    assert.deepEqual(file.issues, []);
    assert.deepEqual(file.steps, {
      schema: 'passed',
      imports: 'passed',
      types: 'passed',
      render: 'skipped',
      tokens: 'skipped',
      look: 'skipped',
    });
  } finally {
    await closeRenderTools(tools);
  }
});
