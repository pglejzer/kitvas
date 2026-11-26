// The layers of a draft's latest version: the `shop` draft built with the real tools, walked by a
// fake browser that keeps what it was asked.

import assert from 'node:assert/strict';
import { rmSync } from 'node:fs';
import { join } from 'node:path';
import { test } from 'node:test';
import { measureLayers } from '../../../src/checks/app/measure-layers.ts';
import type { LayerFacts } from '../../../src/checks/domain/page/layers.ts';
import type {
  Browser,
  BrowserSession,
  LayerReport,
  LayerVisit,
} from '../../../src/checks/ports/browser.ts';
import { createFolderKitStore } from '../../../src/kit/adapters/folder-store.ts';
import type { RenderDeps } from '../../../src/render/index.ts';
import { shopDraft } from '../../helpers/draft/drafts.ts';
import { closeRenderTools, renderTools, writeShopSections } from '../../helpers/draft/render.ts';
import { FIXTURE_KITS } from '../../helpers/kit/kits.ts';

const BUILD_MS = 120_000;

const factsAt = (width: number): LayerFacts => ({
  viewport: [width, 900],
  page: [width, 1400],
  background: '#ffffffff',
  nodes: [],
  truncated: false,
});

type Fake = { browser: Browser; walks: LayerVisit[]; opened(): number; closed(): number };

/** A browser whose sessions answer `layers` with `answer`, or have no `layers` without one. */
function fakeBrowser(answer?: (visit: LayerVisit) => LayerReport): Fake {
  const walks: LayerVisit[] = [];
  let opened = 0;
  let closed = 0;
  const walking = (reply: (visit: LayerVisit) => LayerReport) => ({
    async layers(visit: LayerVisit): Promise<LayerReport> {
      walks.push(visit);
      return reply(visit);
    },
  });
  const browser: Browser = {
    async open() {
      opened += 1;
      const session: BrowserSession = {
        name: 'fake',
        async visit() {
          throw new Error('the layers make no visit');
        },
        ...(answer === undefined ? {} : walking(answer)),
        async close() {
          closed += 1;
        },
      };
      return session;
    },
  };
  return { browser, walks, opened: () => opened, closed: () => closed };
}

/** The `shop` draft with its sections, and the render deps that build it. */
async function withShop(run: (render: RenderDeps, dir: string) => Promise<void>): Promise<void> {
  const { store, root } = shopDraft();
  const dir = join(root, 'shop');
  writeShopSections(dir);
  const tools = renderTools();
  try {
    await run({ drafts: store, kits: createFolderKitStore(FIXTURE_KITS), ...tools }, dir);
  } finally {
    await closeRenderTools(tools);
  }
}

test('the built page is walked at each width in the order asked, in one browser', {
  timeout: BUILD_MS,
}, async () => {
  await withShop(async (render, dir) => {
    const fake = fakeBrowser((visit) => ({ state: 'walked', facts: factsAt(visit.width) }));
    const measured = await measureLayers(
      { render, browser: fake.browser },
      { slug: 'shop', state: 'filled', widths: [1280, 390, 768, 1000] },
    );
    assert.equal(measured.version, 1);
    assert.equal(measured.built, true);
    assert.deepEqual(measured.errors, []);
    assert.deepEqual(
      measured.frames.map((frame) => [frame.width, frame.facts.viewport[0]]),
      [
        [1280, 1280],
        [390, 390],
        [768, 768],
        [1000, 1000],
      ],
    );
    const page = join(dir, 'v1', 'build', 'html', 'index.html');
    assert.deepEqual(fake.walks, [
      { page, state: 'filled', width: 1280, height: 900 },
      { page, state: 'filled', width: 390, height: 844 },
      { page, state: 'filled', width: 768, height: 1024 },
      { page, state: 'filled', width: 1000, height: 900 },
    ]);
    assert.deepEqual([fake.opened(), fake.closed()], [1, 1]);
  });
});

test('a walk that fails is an error, and the other widths still come', {
  timeout: BUILD_MS,
}, async () => {
  await withShop(async (render) => {
    const fake = fakeBrowser((visit) =>
      visit.width === 390
        ? { state: 'failed', error: 'the page rendered nothing' }
        : { state: 'walked', facts: factsAt(visit.width) },
    );
    const measured = await measureLayers(
      { render, browser: fake.browser },
      { slug: 'shop', state: 'empty', widths: [1280, 390] },
    );
    assert.equal(measured.built, true);
    assert.deepEqual(measured.errors, ['390: the page rendered nothing']);
    assert.deepEqual(
      measured.frames.map((frame) => frame.width),
      [1280],
    );
    assert.deepEqual(
      fake.walks.map((walk) => walk.state),
      ['empty', 'empty'],
    );
  });
});

test('a draft that does not build is walked at no width', { timeout: BUILD_MS }, async () => {
  await withShop(async (render, dir) => {
    rmSync(join(dir, 'v1', 'src', 'tsx', 'sections', 'OrderSummary.tsx'));
    const fake = fakeBrowser((visit) => ({ state: 'walked', facts: factsAt(visit.width) }));
    const measured = await measureLayers(
      { render, browser: fake.browser },
      { slug: 'shop', state: 'filled', widths: [1280, 390] },
    );
    assert.equal(measured.built, false);
    assert.equal(measured.version, 1);
    assert.ok(measured.errors.length > 0, 'the build errors are kept');
    assert.deepEqual(measured.frames, []);
    assert.equal(fake.opened(), 0, 'no browser is opened');
  });
});

test('a browser that cannot walk layers says so, once, and is closed', {
  timeout: BUILD_MS,
}, async () => {
  await withShop(async (render) => {
    const fake = fakeBrowser();
    const measured = await measureLayers(
      { render, browser: fake.browser },
      { slug: 'shop', state: 'filled', widths: [1280, 390] },
    );
    assert.equal(measured.built, true);
    assert.equal(measured.errors.length, 1);
    assert.deepEqual(measured.frames, []);
    assert.deepEqual([fake.opened(), fake.closed()], [1, 1]);
  });
});

test('the session is closed when a walk throws', { timeout: BUILD_MS }, async () => {
  await withShop(async (render) => {
    const fake = fakeBrowser(() => {
      throw new Error('the browser went away');
    });
    await assert.rejects(
      measureLayers(
        { render, browser: fake.browser },
        { slug: 'shop', state: 'filled', widths: [1280] },
      ),
      /the browser went away/,
    );
    assert.deepEqual([fake.opened(), fake.closed()], [1, 1]);
  });
});
