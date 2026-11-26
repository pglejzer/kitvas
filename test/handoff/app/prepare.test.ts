import assert from 'node:assert/strict';
import { readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { test } from 'node:test';
import type { MeasuredLayers } from '../../../src/checks/index.ts';
import { createNodeHandoffFiles } from '../../../src/handoff/adapters/node-handoff-files.ts';
import { type PrepareFigmaDeps, prepareFigma } from '../../../src/handoff/app/figma/prepare.ts';
import { createFolderKitStore } from '../../../src/kit/adapters/folder-store.ts';
import { KitvasError } from '../../../src/shared/index.ts';
import { shopDraft } from '../../helpers/draft/drafts.ts';
import {
  fakeBundler,
  PNG,
  shopFacts,
  writeShopBuild,
} from '../../helpers/handoff/handoff-fixtures.ts';
import { FIXTURE_KITS } from '../../helpers/kit/kits.ts';

function setup(options: { image?: string; truncated?: boolean; built?: boolean } = {}) {
  const { store, root } = shopDraft();
  const draft = store.dir('shop');
  writeShopBuild(store);
  writeFileSync(join(root, 'outside.png'), PNG);
  const measured: string[] = [];
  const deps: PrepareFigmaDeps = {
    drafts: store,
    kits: createFolderKitStore(FIXTURE_KITS),
    files: createNodeHandoffFiles(),
    async measure(input) {
      measured.push(`${input.state}:${input.widths.join(',')}`);
      const result: MeasuredLayers = {
        version: 1,
        built: options.built ?? true,
        errors: options.built === false ? ['broken'] : [],
        frames: input.widths.map((width) => ({
          width,
          facts: shopFacts(options.image, options.truncated === true),
        })),
      };
      return result;
    },
    bundler: fakeBundler,
    newSendId: () => 'k7x2m9qa',
    t: (key, params) => `${key} ${JSON.stringify(params ?? {})}`,
  };
  const input = { slug: 'shop', widths: [1280, 390], state: '', sections: null, resume: false };
  return { store, root, draft, deps, input, measured };
}

function packageFiles(dir: string, base = dir): { path: string; bytes: Buffer }[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const full = join(dir, entry.name);
    if (entry.isDirectory()) return packageFiles(full, base);
    return [{ path: full.slice(base.length + 1).replace(/\\/g, '/'), bytes: readFileSync(full) }];
  });
}

async function failure(run: Promise<unknown>): Promise<KitvasError> {
  try {
    await run;
  } catch (error) {
    if (error instanceof KitvasError) return error;
    throw error;
  }
  throw new Error('expected a KitvasError');
}

test('a package has its five parts, and nothing of the machine or the source in it', async () => {
  const { deps, input, draft, root } = setup();
  const answer = await prepareFigma(deps, input);
  assert.equal(answer.sendId, 'k7x2m9qa');
  assert.deepEqual(answer.widths, [1280, 390]);
  assert.equal(answer.slug, 'shop');
  assert.equal(answer.version, 1);
  assert.equal(answer.checks.state, 'none');
  assert.deepEqual(answer.leftOut, []);

  const files = packageFiles(answer.dir);
  const paths = files.map((file) => file.path);
  for (const part of ['tree.json', 'variables.json', 'manifest.json']) {
    assert.ok(paths.includes(part), part);
  }
  assert.ok(paths.some((path) => /^scripts\/.+\.js$/.test(path)));
  const assets = paths.filter((path) => path.startsWith('assets/'));
  assert.equal(assets.length, 1);
  assert.match(assets[0] ?? '', /^assets\/[0-9a-f]{24}\.png$/);

  const forbidden = [
    draft,
    root,
    draft.replace(/\\/g, '/'),
    JSON.stringify(draft).slice(1, -1),
    '.tsx',
    '.scss',
    'sections/Hero:section',
    'sections/OrderSummary:aside',
    'logo.png',
  ];
  for (const file of files.filter((entry) => !entry.path.startsWith('assets/'))) {
    const text = file.bytes.toString('utf8');
    for (const needle of forbidden) {
      assert.ok(!text.includes(needle), `${file.path} holds ${needle}`);
    }
  }
});

test('the manifest names the page, the frames and the send id', async () => {
  const { deps, input } = setup();
  const answer = await prepareFigma(deps, input);
  const manifest = JSON.parse(readFileSync(answer.manifest, 'utf8')) as {
    sendId: string;
    page: string;
    frames: { width: number; name: string }[];
  };
  assert.equal(manifest.sendId, 'k7x2m9qa');
  assert.equal(manifest.page, 'kitvas · shop');
  assert.deepEqual(manifest.frames, [
    { width: 1280, name: 'shop v1 · 1280 · k7x2m9qa' },
    { width: 390, name: 'shop v1 · 390 · k7x2m9qa' },
  ]);
});

test('--resume answers with the package on disk and its send id, and measures nothing', async () => {
  const { deps, input, measured } = setup();
  const first = await prepareFigma(deps, input);
  const calls = measured.length;
  const again = await prepareFigma(
    { ...deps, newSendId: () => 'other999' },
    { ...input, resume: true },
  );
  assert.equal(again.sendId, first.sendId);
  assert.equal(measured.length, calls);
  assert.deepEqual(again.widths, first.widths);
  assert.deepEqual(again.counts, first.counts);
});

test('--resume with no package is HANDOFF_INVALID', async () => {
  const { deps, input } = setup();
  const error = await failure(prepareFigma(deps, { ...input, resume: true }));
  assert.equal(error.code, 'HANDOFF_INVALID');
  assert.equal(error.params.at, 'resume');
});

test('a draft that does not build is HANDOFF_BUILD_FAILED', async () => {
  const { deps, input } = setup({ built: false });
  const error = await failure(prepareFigma(deps, input));
  assert.equal(error.code, 'HANDOFF_BUILD_FAILED');
  assert.equal(error.params.slug, 'shop');
});

test('a width that hit the layer cap is HANDOFF_TOO_LARGE and names the largest sections', async () => {
  const { deps, input } = setup({ truncated: true });
  const error = await failure(prepareFigma(deps, input));
  assert.equal(error.code, 'HANDOFF_TOO_LARGE');
  assert.match(String(error.params.detail), /hero/);
});

test('an unknown state or section is HANDOFF_INVALID before anything is measured', async () => {
  const { deps, input, measured } = setup();
  const state = await failure(prepareFigma(deps, { ...input, state: 'nope' }));
  assert.deepEqual([state.code, state.params.at], ['HANDOFF_INVALID', 'state']);
  const section = await failure(prepareFigma(deps, { ...input, sections: ['nope'] }));
  assert.deepEqual([section.code, section.params.at], ['HANDOFF_INVALID', 'sections']);
  assert.deepEqual(measured, []);
});

test('an image outside the draft is left out and listed by name, not by path', async () => {
  const { deps, input, root } = setup({ image: '../../../../outside.png' });
  const answer = await prepareFigma(deps, input);
  assert.deepEqual(answer.leftOut, [{ what: 'outside.png', reason: 'outside' }]);
  const paths = packageFiles(answer.dir).map((file) => file.path);
  assert.equal(paths.filter((path) => path.startsWith('assets/')).length, 0);
  assert.ok(!JSON.stringify(answer.leftOut).includes(root));
});

test('an address on the network is left out and listed by its host', async () => {
  const { deps, input } = setup({ image: 'https://cdn.example.com/hero.png' });
  const answer = await prepareFigma(deps, input);
  assert.deepEqual(answer.leftOut, [{ what: 'cdn.example.com', reason: 'outside' }]);
});
