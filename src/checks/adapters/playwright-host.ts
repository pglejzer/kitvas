// The browser the studio keeps for its check jobs: one launchServer on 127.0.0.1, reached by endpoint.

import { KitvasError, loadDep } from '../../shared/index.ts';
import type { BrowserHost, SharedBrowser } from '../ports/browser.ts';
import { CANDIDATES, type PlaywrightOptions } from './playwright-browser.ts';

type Playwright = typeof import('playwright-core');

export function createPlaywrightHost({ roots, browsersDir }: PlaywrightOptions): BrowserHost {
  return {
    async serve(): Promise<SharedBrowser> {
      process.env.PLAYWRIGHT_BROWSERS_PATH = browsersDir;
      const { chromium } = await loadDep<Playwright>('playwright-core', roots);
      for (const { name, channel } of CANDIDATES) {
        try {
          // Loopback only, whatever Playwright's default is; the path stays Playwright's random one.
          const options = { host: '127.0.0.1', headless: true };
          const server = await chromium.launchServer(channel ? { ...options, channel } : options);
          const closed = new Promise<void>((resolve) => {
            server.once('close', () => resolve());
          });
          return {
            name,
            endpoint: server.wsEndpoint(),
            pid: server.process().pid,
            closed,
            close: () => server.close(),
          };
        } catch {
          // Not installed here: try the next one.
        }
      }
      throw new KitvasError('BROWSER_MISSING', { dir: browsersDir });
    },
  };
}
