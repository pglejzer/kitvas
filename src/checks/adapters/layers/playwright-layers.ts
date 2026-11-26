// The layer walk of a built draft page at one width (plan 21, task 1): the page opened from disk in
// a fresh context as a visit opens it, with motion reduced so nothing is caught halfway through an
// animation; then the facts walk run for its tools alone, the text tools, the walk, and the pure
// readers of `layer-parse.ts` over what the page handed over.

import { pathToFileURL } from 'node:url';
import { layerFacts } from '../../domain/page/layer-parse.ts';
import { LAYER_SVG_MAX, LAYER_TEXT_MAX, LAYERS_NODE_CAP } from '../../domain/page/layers.ts';
import type { LayerReport, LayerVisit } from '../../ports/browser.ts';
import { walkNodes } from '../facts/playwright-facts-walk.ts';
import { firstLine } from '../images/playwright-images.ts';
import { installLayerTools } from './playwright-layers-text.ts';
import { readLayers } from './playwright-layers-walk.ts';

type PlaywrightBrowser = import('playwright-core').Browser;
type PlaywrightContext = import('playwright-core').BrowserContext;

/** As a visit waits for one page. */
const PAGE_TIMEOUT_MS = 15_000;
/** Elements read before the layers are chosen: far more than LAYERS_NODE_CAP layers come from. */
const VISIT_CAP = LAYERS_NODE_CAP * 20;

const SAY = {
  empty: 'the page rendered nothing',
  tools: 'the page tools could not be set up',
};

/** Runs in the page: two frames, so React has painted. */
function settle(): Promise<null> {
  return new Promise((done) =>
    requestAnimationFrame(() => requestAnimationFrame(() => done(null))),
  );
}

/** Runs in the page: the fonts the page asked for, loaded, so lines break as they will. */
function fontsReady(): Promise<null> {
  return document.fonts.ready.then(() => null);
}

/** Runs in the page. */
function rendered(): boolean {
  return (document.getElementById('root')?.childElementCount ?? 0) > 0;
}

export async function walkLayers(
  browser: PlaywrightBrowser,
  visit: LayerVisit,
): Promise<LayerReport> {
  const errors: string[] = [];
  let context: PlaywrightContext | undefined;
  try {
    context = await browser.newContext({
      viewport: { width: visit.width, height: visit.height },
      deviceScaleFactor: 1,
      reducedMotion: 'reduce',
    });
    const page = await context.newPage();
    page.setDefaultTimeout(PAGE_TIMEOUT_MS);
    page.on('pageerror', (error) => errors.push(error.message));
    const url = `${pathToFileURL(visit.page).href}?state=${encodeURIComponent(visit.state)}`;
    await page.goto(url, { waitUntil: 'load' });
    await page.evaluate(settle);
    await page.evaluate(fontsReady);
    if (!(await page.evaluate(rendered))) {
      return { state: 'failed', error: errors[0] ?? SAY.empty };
    }
    // Run for its tools alone (colour, visibility, box): they stay on `window` after it.
    await page.evaluate(walkNodes, { cap: 0, root: 'draft' as const });
    if (!(await page.evaluate(installLayerTools))) return { state: 'failed', error: SAY.tools };
    const raw = await page.evaluate(readLayers, {
      cap: LAYERS_NODE_CAP,
      visits: VISIT_CAP,
      textMax: LAYER_TEXT_MAX,
      svgMax: LAYER_SVG_MAX,
    });
    return { state: 'walked', facts: layerFacts(raw) };
  } catch (cause) {
    return { state: 'failed', error: firstLine(cause) };
  } finally {
    await context?.close().catch(() => undefined);
  }
}
