// The browser: system Chrome or Edge through playwright-core, else a Chromium in kitvas's folder.

import { mkdirSync, readFileSync } from 'node:fs';
import { dirname } from 'node:path';
import { pathToFileURL } from 'node:url';
import { KitvasError, loadDep, resolveDep } from '../../shared/index.ts';
import { AXE_TAGS, type AxeViolation, type PageReport } from '../domain/page.ts';
import type { UsageRecord } from '../domain/usage.ts';
import type { Browser, BrowserSession, Inspect, InspectReport, Visit } from '../ports/browser.ts';
import { captureExample } from './playwright-capture.ts';
import { cropImages } from './playwright-images.ts';
import { scanPage } from './playwright-scan.ts';

type Playwright = typeof import('playwright-core');
type PlaywrightBrowser = import('playwright-core').Browser;

export type PlaywrightOptions = {
  roots: string[];
  /** Where `kitvas browser install` puts Chromium. */
  browsersDir: string;
  /** The studio's browser: connected to first; when it is gone, a browser of our own starts. */
  shared?: { name: string; endpoint: string };
};

/** Tried in this order. The last one is the Chromium playwright-core downloads. */
export const CANDIDATES: { name: string; channel?: string }[] = [
  { name: 'chrome', channel: 'chrome' },
  { name: 'msedge', channel: 'msedge' },
  { name: 'chromium' },
];
const PAGE_TIMEOUT_MS = 15_000;
const CONNECT_TIMEOUT_MS = 5_000;

/** Runs in the page: axe, then the nearest element id around every node it reports. */
async function runAxe(tags: string[]): Promise<AxeViolation[]> {
  type AxeNode = { element?: Element; failureSummary?: string };
  type AxeResult = { id: string; impact?: string | null; help: string; nodes: AxeNode[] };
  type Axe = { run(context: Document, options: object): Promise<{ violations: AxeResult[] }> };
  const axe = (window as unknown as { axe: Axe }).axe;
  const results = await axe.run(document, {
    runOnly: { type: 'tag', values: tags },
    elementRef: true,
    preload: false,
    resultTypes: ['violations'],
  });
  return results.violations.map((violation) => ({
    id: violation.id,
    impact: violation.impact ?? null,
    help: violation.help,
    nodes: violation.nodes.map((node) => ({
      element: node.element?.closest('[data-ks]')?.getAttribute('data-ks') ?? null,
      summary: node.failureSummary ?? '',
    })),
  }));
}

/** Runs in the page: what the JSX runtime recorded. */
function readUsage(): unknown[] {
  const store = (globalThis as { __KITVAS_USAGE__?: Map<string, unknown> }).__KITVAS_USAGE__;
  return store ? [...store.values()] : [];
}

/** Runs in the page: two frames, so React has painted. */
function settle(): Promise<null> {
  return new Promise((done) =>
    requestAnimationFrame(() => requestAnimationFrame(() => done(null))),
  );
}

/** Runs in the page. */
function hasContent(): boolean {
  return (document.getElementById('root')?.childElementCount ?? 0) > 0;
}

/** Runs in the page: the mark `client/frame/example.ts` leaves after rendering an example. */
function readExampleMark(): 'shown' | 'failed' | null {
  const mark = document.documentElement.dataset.example;
  return mark === 'shown' || mark === 'failed' ? mark : null;
}

/**
 * Runs in the page: each variable's computed value inside the kit's providers (the first element
 * in `#root`, else `:root`), and that value as the browser paints it. A canvas pixel is sRGB
 * whatever the notation was, so oklch, hsl and named colours all come back as hex.
 */
function readVars(names: string[]): Pick<InspectReport, 'vars' | 'colors'> {
  const holder = document.querySelector('#root > *') ?? document.documentElement;
  const style = getComputedStyle(holder);
  const canvas = document.createElement('canvas');
  canvas.width = 1;
  canvas.height = 1;
  const context = canvas.getContext('2d', { willReadFrequently: true });
  const pair = (channel: number): string => channel.toString(16).padStart(2, '0');
  const paint = (value: string): string | null => {
    // A value that is no colour would leave the fill style as it was and paint that instead.
    if (!context || value === '' || !CSS.supports('color', value)) return null;
    context.clearRect(0, 0, 1, 1);
    context.fillStyle = value;
    context.fillRect(0, 0, 1, 1);
    const [red = 0, green = 0, blue = 0, alpha = 255] = context.getImageData(0, 0, 1, 1).data;
    const opaque = `#${pair(red)}${pair(green)}${pair(blue)}`;
    return alpha < 255 ? `${opaque}${pair(alpha)}` : opaque;
  };
  const vars: Record<string, string> = {};
  const colors: Record<string, string | null> = {};
  for (const name of names) {
    const value = style.getPropertyValue(name).trim();
    vars[name] = value;
    colors[name] = paint(value);
  }
  return { vars, colors };
}

function createSession(
  name: string,
  browser: PlaywrightBrowser,
  axeSource: string,
): BrowserSession {
  return {
    name,
    async visit({ page: file, state, width, height, screenshot }: Visit): Promise<PageReport> {
      const context = await browser.newContext({
        viewport: { width, height },
        deviceScaleFactor: 1,
      });
      const report: PageReport = {
        rendered: false,
        console: [],
        pageErrors: [],
        failedRequests: [],
        violations: [],
        usage: [],
        shot: false,
      };
      let listening = true;
      try {
        const page = await context.newPage();
        page.setDefaultTimeout(PAGE_TIMEOUT_MS);
        page.on('console', (message) => {
          const type = message.type();
          if (listening && (type === 'error' || type === 'warning')) {
            report.console.push({ type, text: message.text() });
          }
        });
        page.on('pageerror', (error) => report.pageErrors.push(error.message));
        page.on('requestfailed', (request) => {
          report.failedRequests.push({
            url: request.url(),
            reason: request.failure()?.errorText ?? '',
          });
        });

        const url = `${pathToFileURL(file).href}?state=${encodeURIComponent(state)}`;
        try {
          await page.goto(url, { waitUntil: 'load' });
        } catch (cause) {
          report.pageErrors.push(cause instanceof Error ? cause.message : String(cause));
          return report;
        }
        await page.evaluate(settle);
        report.rendered = await page.evaluate(hasContent);
        report.usage = (await page.evaluate(readUsage)) as UsageRecord[];
        // axe's own messages are not the draft's.
        listening = false;
        await page.addScriptTag({ content: axeSource });
        report.violations = await page.evaluate(runAxe, AXE_TAGS);
        mkdirSync(dirname(screenshot), { recursive: true });
        await page.screenshot({ path: screenshot, fullPage: true });
        report.shot = true;
        return report;
      } finally {
        await context.close();
      }
    },
    async inspect({ page: file, search, width, height, vars }: Inspect): Promise<InspectReport> {
      const context = await browser.newContext({
        viewport: { width, height },
        deviceScaleFactor: 1,
      });
      const report: InspectReport = {
        example: null,
        errors: [],
        failed: [],
        vars: Object.fromEntries(vars.map((name) => [name, ''])),
        colors: Object.fromEntries(vars.map((name) => [name, null])),
      };
      try {
        const page = await context.newPage();
        page.setDefaultTimeout(PAGE_TIMEOUT_MS);
        page.on('console', (message) => {
          if (message.type() === 'error') report.errors.push(message.text());
        });
        page.on('pageerror', (error) => report.errors.push(error.message));
        page.on('requestfailed', (request) => {
          report.failed.push(`${request.url()} (${request.failure()?.errorText ?? ''})`);
        });

        try {
          await page.goto(`${pathToFileURL(file).href}${search}`, { waitUntil: 'load' });
        } catch (cause) {
          report.errors.push(cause instanceof Error ? cause.message : String(cause));
          return report;
        }
        await page.evaluate(settle);
        report.example = await page.evaluate(readExampleMark);
        if (vars.length > 0) Object.assign(report, await page.evaluate(readVars, vars));
        return report;
      } finally {
        await context.close();
      }
    },
    scan: (input) => scanPage(browser, input),
    crop: (inputs) => cropImages(browser, inputs),
    capture: (input) => captureExample(browser, input),
    async close() {
      await browser.close();
    },
  };
}

export function createPlaywrightBrowser({
  roots,
  browsersDir,
  shared,
}: PlaywrightOptions): Browser {
  return {
    async open() {
      // playwright-core reads this once, when it is loaded.
      process.env.PLAYWRIGHT_BROWSERS_PATH = browsersDir;
      const { chromium } = await loadDep<Playwright>('playwright-core', roots);
      const axeSource = readFileSync(resolveDep('axe-core/axe.min.js', roots), 'utf8');
      if (shared) {
        try {
          // Closing a connected browser only disconnects; the studio's browser keeps running.
          const browser = await chromium.connect(shared.endpoint, { timeout: CONNECT_TIMEOUT_MS });
          return createSession(shared.name, browser, axeSource);
        } catch {
          // The studio's browser is gone: start one of our own.
        }
      }
      for (const { name, channel } of CANDIDATES) {
        try {
          const browser = await chromium.launch(
            channel ? { channel, headless: true } : { headless: true },
          );
          return createSession(name, browser, axeSource);
        } catch {
          // Not installed here: try the next one.
        }
      }
      throw new KitvasError('BROWSER_MISSING', { dir: browsersDir });
    },
  };
}
