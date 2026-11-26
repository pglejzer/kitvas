// `kitvas handoff compare` with a real browser: a fixture page served from a local server is shot at
// 1280 px, once whole and once inside a frame of its own with a selector, and set beside a reference
// drawn here. Also a page far taller than the reference, a selector that matches nothing, a server
// that is down and an address on the private network. Skips when no browser starts.

import assert from 'node:assert/strict';
import { readFileSync, writeFileSync } from 'node:fs';
import { createServer, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { join } from 'node:path';
import { type TestContext, test } from 'node:test';
import { createPlaywrightBrowser } from '../../src/checks/adapters/browser/playwright-browser.ts';
import { matchPage } from '../../src/checks/app/match-page.ts';
import { pngSize } from '../../src/checks/domain/kit/match-scale.ts';
import {
  type Browser,
  LOOK_LINE,
  lookScore,
  type MatchReport,
  PIXELS_MAX,
} from '../../src/checks/index.ts';
import { KitvasError, PLUGIN_ROOT } from '../../src/shared/index.ts';
import { encodePng } from '../checks/adapters/png.ts';
import { tempDir } from '../helpers/tmp.ts';

const TEST_MS = 240_000;
const PAGES = join(PLUGIN_ROOT, 'test', 'fixtures', 'handoff', 'page');
const ROUTES: Record<string, string> = {
  '/screen': 'screen.html',
  '/framed': 'framed.html',
  '/tall': 'tall.html',
};
const BLUE: [number, number, number, number] = [0x2f, 0x5b, 0xea, 255];
const WHITE: [number, number, number, number] = [255, 255, 255, 255];

function serve(): Promise<{ origin: string; server: Server }> {
  const server = createServer((request, response) => {
    const path = new URL(request.url ?? '/', 'http://127.0.0.1').pathname;
    const file = ROUTES[path];
    if (file === undefined) {
      response.writeHead(404, { 'content-type': 'text/plain' });
      response.end('not found');
      return;
    }
    response.writeHead(200, { 'content-type': 'text/html; charset=utf-8' });
    response.end(readFileSync(join(PAGES, file)));
  });
  return new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(0, '127.0.0.1', () => {
      const { port } = server.address() as AddressInfo;
      resolve({ origin: `http://127.0.0.1:${port}`, server });
    });
  });
}

const closeServer = (server: Server): Promise<void> =>
  new Promise((resolve) => {
    server.closeAllConnections();
    server.close(() => resolve());
  });

/** A reference: a blue band of `band` px at the top of a white image. */
function reference(dir: string, name: string, width: number, height: number, band: number): string {
  const file = join(dir, `${name}.png`);
  writeFileSync(
    file,
    encodePng(width, height, (_x, y) => (y < band ? BLUE : WHITE)),
  );
  return file;
}

/** Whether a browser starts here and can compare pages; else the test is skipped or fails clearly. */
async function ready(browser: Browser, t: TestContext): Promise<boolean> {
  try {
    const session = await browser.open();
    const comparable = session.match !== undefined;
    await session.close();
    assert.ok(comparable, 'the browser session has no `match`: wire it in playwright-browser.ts');
    return true;
  } catch (error) {
    if (error instanceof KitvasError && error.code === 'BROWSER_MISSING') {
      t.skip('no browser on this machine');
      return false;
    }
    throw error;
  }
}

test('the page at an address is shot, scaled and held against a reference', {
  timeout: TEST_MS,
}, async (t) => {
  const browser = createPlaywrightBrowser({
    roots: [PLUGIN_ROOT],
    browsersDir: join(tempDir(), 'browsers'),
  });
  if (!(await ready(browser, t))) return;
  const dir = tempDir('kitvas-match-');
  const { origin, server } = await serve();
  const deps = { browser, lookup: async (): Promise<string[]> => [] };
  const compare = (
    path: string,
    refer: string,
    options: { selector?: string | null; name?: string; url?: string } = {},
  ): Promise<MatchReport> =>
    matchPage(deps, {
      url: options.url ?? `${origin}${path}`,
      width: 1280,
      height: 900,
      selector: options.selector ?? null,
      shot: join(dir, `${options.name ?? path.slice(1)}-shot.png`),
      reference: refer,
      maxPixels: PIXELS_MAX,
      allowPrivate: false,
    });
  let closed = false;
  try {
    await t.test('the whole page, on loopback with no flag', async () => {
      const report = await compare('/screen', reference(dir, 'screen', 1280, 900, 200));
      assert.equal(report.state, 'matched', JSON.stringify(report));
      if (report.state !== 'matched') return;
      assert.equal(report.scale, 1);
      assert.deepEqual([report.rendered.width, report.rendered.height], [1280, 900]);
      const look = lookScore(report.reference, report.rendered);
      assert.ok(look.score >= LOOK_LINE, `score ${look.score}`);
      assert.deepEqual(pngSize(readFileSync(join(dir, 'screen-shot.png'))), [1280, 900]);
    });

    await t.test(
      'a frame of its own: the selector cuts the screen out, the whole page does not match',
      async () => {
        const framed = reference(dir, 'framed', 1040, 900, 200);
        const cut = await compare('/framed', framed, { selector: '#screen', name: 'cut' });
        assert.equal(cut.state, 'matched', JSON.stringify(cut));
        if (cut.state !== 'matched') return;
        assert.deepEqual([cut.rendered.width, cut.rendered.height], [1040, 900]);
        const good = lookScore(cut.reference, cut.rendered);
        assert.ok(good.score >= LOOK_LINE, `with the selector: ${good.score}`);

        const whole = await compare('/framed', framed, { name: 'whole' });
        assert.equal(whole.state, 'matched', JSON.stringify(whole));
        if (whole.state !== 'matched') return;
        const bad = lookScore(whole.reference, whole.rendered);
        assert.ok(bad.score < LOOK_LINE, `without it: ${bad.score}`);
      },
    );

    await t.test(
      'a page of 1280 x 9,000 is scaled, kept whole on disk and scored low on size',
      async () => {
        const report = await compare('/tall', reference(dir, 'tall', 1280, 3000, 3000));
        assert.equal(report.state, 'matched', JSON.stringify(report));
        if (report.state !== 'matched') return;
        assert.ok(report.scale < 1 && report.scale > 0.5, `scale ${report.scale}`);
        assert.ok(report.rendered.width * report.rendered.height <= PIXELS_MAX);
        assert.ok(report.reference.width * report.reference.height <= PIXELS_MAX);
        assert.deepEqual(pngSize(readFileSync(join(dir, 'tall-shot.png'))), [1280, 9000]);
        // One factor for both: the page is still three times as tall as the reference.
        assert.ok(report.rendered.height / report.reference.height > 2.9);
        assert.ok(lookScore(report.reference, report.rendered).size < LOOK_LINE);
      },
    );

    await t.test(
      'a selector that matches nothing is missing, one that is no selector is failed',
      async () => {
        const refer = reference(dir, 'screen', 1280, 900, 200);
        const none = await compare('/screen', refer, { selector: '#nope', name: 'none' });
        assert.deepEqual(none, { state: 'missing', selector: '#nope' });
        const broken = await compare('/screen', refer, { selector: '!!!', name: 'broken' });
        assert.equal(broken.state, 'failed', JSON.stringify(broken));
      },
    );

    await t.test('an address on the private network is blocked without a flag', async () => {
      const refer = reference(dir, 'screen', 1280, 900, 200);
      const url = 'http://192.168.1.50:9/screen';
      assert.deepEqual(await compare('/screen', refer, { url, name: 'lan' }), {
        state: 'blocked',
        url,
      });
    });

    await t.test('a page that answers 404 is failed', async () => {
      const refer = reference(dir, 'screen', 1280, 900, 200);
      const report = await compare('/missing', refer, { name: 'gone' });
      assert.equal(report.state, 'failed', JSON.stringify(report));
    });

    await t.test(
      'a reference that is not there is failed, and the shot is still kept',
      async () => {
        const report = await compare('/screen', join(dir, 'no-such.png'), { name: 'kept' });
        assert.equal(report.state, 'failed', JSON.stringify(report));
        assert.deepEqual(pngSize(readFileSync(join(dir, 'kept-shot.png'))), [1280, 900]);
      },
    );

    await t.test('a server that is down is failed', async () => {
      const refer = reference(dir, 'screen', 1280, 900, 200);
      await closeServer(server);
      closed = true;
      const report = await compare('/screen', refer, { name: 'down' });
      assert.equal(report.state, 'failed', JSON.stringify(report));
    });
  } finally {
    if (!closed) await closeServer(server);
  }
});
