// What the browser tests of `src/checks/adapters/` share: the fixture site served on 127.0.0.1 with
// a count of the paths asked for (so a test can tell a refused request never left), and a browser
// session, or none when this machine has no browser.

import { readFileSync } from 'node:fs';
import { createServer } from 'node:http';
import type { AddressInfo } from 'node:net';
import { join } from 'node:path';
import { createPlaywrightBrowser } from '../../../src/checks/adapters/playwright-browser.ts';
import type { BrowserSession, ScanPolicy } from '../../../src/checks/ports/browser.ts';
import { KitvasError, PLUGIN_ROOT } from '../../../src/shared/index.ts';
import { tempDir } from '../../helpers/tmp.ts';
import { encodePng } from './png.ts';

export const NO_BROWSER = 'this machine has no Chrome, Edge or Chromium';

const SITE = join(PLUGIN_ROOT, 'test', 'fixtures', 'site');
const FILES: Record<string, { file: string; type: string }> = {
  '/': { file: 'index.html', type: 'text/html; charset=utf-8' },
  '/index.html': { file: 'index.html', type: 'text/html; charset=utf-8' },
  '/empty.html': { file: 'empty.html', type: 'text/html; charset=utf-8' },
  '/private.html': { file: 'private.html', type: 'text/html; charset=utf-8' },
  '/style.css': { file: 'style.css', type: 'text/css; charset=utf-8' },
};
const PIXEL = encodePng(1, 1, () => [15, 122, 82, 255]);

export type Site = {
  origin: string;
  /** How many times each path was asked for. */
  hits(path: string): number;
  close(): Promise<void>;
};

export function serveSite(): Promise<Site> {
  const asked = new Map<string, number>();
  const server = createServer((request, response) => {
    const path = new URL(request.url ?? '/', 'http://127.0.0.1').pathname;
    asked.set(path, (asked.get(path) ?? 0) + 1);
    const known = FILES[path];
    if (known) {
      response.writeHead(200, { 'content-type': known.type });
      response.end(readFileSync(join(SITE, known.file)));
    } else if (path === '/private.png') {
      response.writeHead(200, { 'content-type': 'image/png' });
      response.end(PIXEL);
    } else if (path === '/redirect-to-private') {
      response.writeHead(302, { location: '/private.html' });
      response.end();
    } else {
      response.writeHead(404, { 'content-type': 'text/plain' });
      response.end('not found');
    }
  });
  return new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(0, '127.0.0.1', () => {
      const { port } = server.address() as AddressInfo;
      resolve({
        origin: `http://127.0.0.1:${port}`,
        hits: (path) => asked.get(path) ?? 0,
        close: () =>
          new Promise((done) => {
            server.closeAllConnections();
            server.close(() => done());
          }),
      });
    });
  });
}

/** A policy that refuses the given paths and lets everything else through. */
export const refusing =
  (...paths: string[]): ScanPolicy =>
  async (url) =>
    !paths.includes(url.pathname);

/** A session of the real browser, or undefined when none starts here. */
export async function openSession(): Promise<BrowserSession | undefined> {
  const browser = createPlaywrightBrowser({
    roots: [PLUGIN_ROOT],
    browsersDir: join(tempDir(), 'browsers'),
  });
  try {
    return await browser.open();
  } catch (error) {
    if (error instanceof KitvasError && error.code === 'BROWSER_MISSING') return undefined;
    throw error;
  }
}
