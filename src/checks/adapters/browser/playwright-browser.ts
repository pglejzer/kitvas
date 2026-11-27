// The browser: system Chrome or Edge through playwright-core, else a Chromium in kitvas's folder.

import { mkdirSync, readFileSync } from 'node:fs';
import { dirname } from 'node:path';
import { pathToFileURL } from 'node:url';
import { KitvasError, loadDep, OPTION_PARAM, resolveDep } from '../../../shared/index.ts';
import { AXE_TAGS, type AxeViolation, type PageReport } from '../../domain/page/page.ts';
import type { UsageRecord } from '../../domain/page/usage.ts';
import type {
  Browser,
  BrowserSession,
  Inspect,
  InspectReport,
  Visit,
} from '../../ports/browser.ts';
import { boardSubject, craftPass } from '../craft/playwright-craft.ts';
import { measureFacts } from '../facts/playwright-facts.ts';
import { runPasses } from '../facts/playwright-passes.ts';
import { captureExample } from '../images/playwright-capture.ts';
import { cropImages } from '../images/playwright-images.ts';
import { matchRendered } from '../images/playwright-match.ts';
import { shootExamples } from '../images/playwright-shoot.ts';
import { walkLayers } from '../layers/playwright-layers.ts';
import { measurePage } from '../layers/playwright-measure.ts';
import { scanPage } from '../scan/playwright-scan.ts';
import { surveyPage } from '../scan/playwright-survey.ts';
import { settle } from './settle.ts';

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

type AxeRead = { violations: AxeViolation[]; unsure: PageReport['contrastUnsure'] };

/**
 * Runs in the page: axe, then the nearest element id around every node it reports. The
 * `color-contrast` results axe could not decide (text over images, gradients, overlays) are kept
 * as nodes of the facts walk (`window.__KITVAS_NODES__`); one outside the walk is left out.
 */
async function runAxe(tags: string[]): Promise<AxeRead> {
  type AxeNode = { element?: Element; failureSummary?: string };
  type AxeResult = { id: string; impact?: string | null; help: string; nodes: AxeNode[] };
  type AxeResults = { violations: AxeResult[]; incomplete: AxeResult[] };
  type Axe = { run(context: Document, options: object): Promise<AxeResults> };
  const axe = (window as unknown as { axe: Axe }).axe;
  const results = await axe.run(document, {
    runOnly: { type: 'tag', values: tags },
    elementRef: true,
    preload: false,
    resultTypes: ['violations', 'incomplete'],
  });
  const idOf = (element: Element | undefined): string | null =>
    element?.closest('[data-ks]')?.getAttribute('data-ks') ?? null;
  const nodes = (window as unknown as { __KITVAS_NODES__?: Element[] }).__KITVAS_NODES__ ?? [];
  const unsure: AxeRead['unsure'] = [];
  for (const result of results.incomplete) {
    if (result.id !== 'color-contrast') continue;
    for (const { element } of result.nodes) {
      const node = element === undefined ? -1 : nodes.indexOf(element);
      if (node === -1 || unsure.some((entry) => entry.node === node)) continue;
      unsure.push({ node, element: idOf(element) });
    }
  }
  return {
    violations: results.violations.map((violation) => ({
      id: violation.id,
      impact: violation.impact ?? null,
      help: violation.help,
      nodes: violation.nodes.map((node) => ({
        element: idOf(node.element),
        summary: node.failureSummary ?? '',
      })),
    })),
    unsure,
  };
}

/** Runs in the page: what the JSX runtime recorded. */
function readUsage(): unknown[] {
  const store = (globalThis as { __KITVAS_USAGE__?: Map<string, unknown> }).__KITVAS_USAGE__;
  return store ? [...store.values()] : [];
}

/** Runs in the page. */
function hasContent(): boolean {
  return (document.getElementById('root')?.childElementCount ?? 0) > 0;
}

/** Runs in the page: the mark `client/frame/page/example.ts` leaves after rendering an example. */
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
    async visit({
      page: file,
      state,
      width,
      height,
      screenshot,
      passes,
      options,
    }: Visit): Promise<PageReport> {
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
        facts: null,
        deep: null,
        contrastUnsure: [],
        craft: null,
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

        const asked = Object.entries(options).map(
          ([id, value]) => `&${OPTION_PARAM}${id}=${encodeURIComponent(value)}`,
        );
        const url = `${pathToFileURL(file).href}?state=${encodeURIComponent(state)}${asked.join('')}`;
        try {
          await page.goto(url, { waitUntil: 'load' });
        } catch (cause) {
          report.pageErrors.push(cause instanceof Error ? cause.message : String(cause));
          return report;
        }
        await page.evaluate(settle);
        report.rendered = await page.evaluate(hasContent);
        report.usage = (await page.evaluate(readUsage)) as UsageRecord[];
        // The facts come first: axe and every pass name nodes by the walk's indexes. A walk that
        // fails leaves no facts, and the rules stay silent on this visit.
        report.facts = await measureFacts(page).catch(() => null);
        // axe's own messages are not the draft's.
        listening = false;
        await page.addScriptTag({ content: axeSource });
        const axe = await page.evaluate(runAxe, AXE_TAGS);
        report.violations = axe.violations;
        report.contrastUnsure = axe.unsure;
        if (screenshot !== null) {
          mkdirSync(dirname(screenshot), { recursive: true });
          await page.screenshot({ path: screenshot, fullPage: true });
          report.shot = true;
        }
        // Reflow, focus, deep and spacing change the page, so they come after the screenshot.
        await runPasses(page, { width, height, passes }, report);
        // After deep: the craft pass draws clones over the page and takes them away again.
        if (passes.includes('craft')) {
          const subject = await boardSubject(page);
          report.craft = await craftPass(page, { subject }).catch(() => null);
        }
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
    survey: (input) => surveyPage(browser, input),
    crop: (inputs) => cropImages(browser, inputs),
    capture: (input) => captureExample(browser, input),
    layers: (visit) => walkLayers(browser, visit),
    measure: (input) => measurePage(browser, input),
    match: (input) => matchRendered(browser, input),
    shoot: (input) => shootExamples(browser, input),
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
