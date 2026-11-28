// `original` of `kit verify` (ADR 0093): one page (a catalog example, or the original kitvas drew
// from a project's code) opened offline from disk, walked for its layers at rest and with each
// control under a real pointer, with keyboard focus and pressed, and shot at rest. The page tools
// are the ones the checks and the hand-off use: the facts walk, the states pass, the layer walk.

import { mkdirSync } from 'node:fs';
import { dirname } from 'node:path';
import { pathToFileURL } from 'node:url';
import { layerFacts } from '../../domain/page/layer-parse.ts';
import {
  LAYER_SVG_MAX,
  LAYER_TEXT_MAX,
  LAYERS_NODE_CAP,
  type PlacedRead,
} from '../../domain/page/layers.ts';
import type { Measure, MeasuredFrame, MeasureReport, MeasureState } from '../../ports/browser.ts';
import { settle } from '../browser/settle.ts';
import { walkNodes } from '../facts/playwright-facts-walk.ts';
import {
  aim,
  blurAll,
  CONTROLS,
  endStates,
  focusControl,
  hovered,
  prepareStates,
} from '../facts/playwright-states.ts';
import { decodeIn, firstLine, inBlankPage } from '../images/playwright-images.ts';
import { pageSize, REACH_MAX, shadowReach, widened } from '../images/playwright-reach.ts';
import { installLayerTools } from './playwright-layers-text.ts';
import { readLayers } from './playwright-layers-walk.ts';

type PlaywrightBrowser = import('playwright-core').Browser;
type PlaywrightContext = import('playwright-core').BrowserContext;
type Page = import('playwright-core').Page;

/** As a visit waits for one page. */
const PAGE_TIMEOUT_MS = 15_000;
/** Elements the facts walk indexes: an example is far smaller. */
const WALK_CAP = LAYERS_NODE_CAP;
const VISIT_CAP = LAYERS_NODE_CAP * 20;
const STYLE_ID = 'kitvas-measure-style';
const AWAY: [number, number] = [-10, -10];

/**
 * Both pages stand in one frame, whatever a project's styles say of the page itself: every element
 * around the root, and the root, is a plain block with no box and no ground of its own, and the body
 * keeps the frame's 16 px. What a component inherits (font, colour, custom properties) is untouched.
 */
const FRAME = `
:has(#root), #root {
  display: block !important; position: static !important; float: none !important;
  width: auto !important; min-width: 0 !important; max-width: none !important;
  height: auto !important; min-height: 0 !important; max-height: none !important;
  margin: 0 !important; padding: 0 !important; border: 0 !important;
  overflow: visible !important; scrollbar-gutter: auto !important;
  transform: none !important; columns: auto !important; contain: none !important;
  background: none !important;
}
body:has(#root) { padding: 16px !important; }
`;

const SAY = {
  empty: 'the page rendered nothing',
  failed: 'the example failed to render',
  tools: 'the page tools could not be set up',
  shot: 'the page could not be shot',
};

/** Runs in the page: the fonts the page asked for, loaded, so lines break as they will. */
function fontsReady(): Promise<null> {
  return document.fonts.ready.then(() => null);
}

/**
 * Runs in the page: an original carries no element ids, so a copy's come off as well and both are
 * walked alike (the layer walk keeps an element that has one).
 */
function dropMarks(): void {
  for (const element of document.querySelectorAll('[data-ks]')) element.removeAttribute('data-ks');
}

/** Runs in the page: what stands in the root, and the mark a catalog example leaves. */
function rendered(): { count: number; mark: string | null } {
  return {
    count: document.getElementById('root')?.childElementCount ?? 0,
    mark: document.documentElement.dataset.example ?? null,
  };
}

/**
 * Runs in the page: by place (the child numbers from the root) and tags, every element under the
 * root that paints an outline, and a display: in an original that of each component's root (its
 * `data-kv-scope`, SCOPE_MARK, on the tag a component stands for), in a copy that of every element,
 * so the compare reads the copy at the original's places (W37). The layer walk reads neither: a focus
 * ring is an outline, and a tag that is a block where the app leaves it in line can draw the same
 * boxes.
 */
function readPlaced(original: boolean): { outlines: PlacedRead[]; hosts: PlacedRead[] } {
  const root = document.getElementById('root');
  const outlines: PlacedRead[] = [];
  const hosts: PlacedRead[] = [];
  const visit = (element: Element, place: string, path: string): void => {
    const style = getComputedStyle(element);
    if (
      place !== '' &&
      style.outlineStyle !== 'none' &&
      Number.parseFloat(style.outlineWidth) > 0
    ) {
      outlines.push({
        place,
        element: path,
        value: `${style.outlineWidth} ${style.outlineStyle} ${style.outlineColor}, offset ${style.outlineOffset}`,
      });
    }
    if (place !== '' && (!original || element.hasAttribute('data-kv-scope'))) {
      hosts.push({ place, element: path, value: style.display });
    }
    const children = Array.from(element.children);
    children.forEach((child, index) => {
      const tag = child.tagName.toLowerCase();
      const twins = children.filter((other) => other.tagName === child.tagName);
      const name = twins.length > 1 ? `${tag}[${twins.indexOf(child) + 1}]` : tag;
      visit(child, `${place}/${index}`, path === '' ? name : `${path} > ${name}`);
    });
  };
  if (root !== null) visit(root, '', '');
  return { outlines, hosts };
}

/** Runs in the page: the selectors and declarations of the probe this browser does not read. */
function unreadOf(probe: { selectors: string[]; declarations: [string, string][] }): string[] {
  const unread: string[] = [];
  for (const selector of probe.selectors) {
    let reads = false;
    try {
      reads = CSS.supports(`selector(${selector})`);
    } catch {
      reads = false;
    }
    if (!reads) unread.push(selector);
  }
  for (const [property, value] of probe.declarations) {
    if (!CSS.supports(property, value)) unread.push(`${property}: ${value}`);
  }
  return unread;
}

/**
 * Runs in the page: the boxes of the root and of every element inside it that has a size, joined,
 * as `boundingBox` gives them, so content that floats out of its root (a floated button in a root
 * of no size) is the shot, wherever the empty root stands. The root's own box when none has one.
 */
function drawnBox(root: Element): { x: number; y: number; width: number; height: number } {
  const own = root.getBoundingClientRect();
  let drawn: [number, number, number, number] | undefined;
  for (const element of [root, ...root.querySelectorAll('*')]) {
    const box = element.getBoundingClientRect();
    if (box.width === 0 || box.height === 0) continue;
    drawn = drawn
      ? [
          Math.min(drawn[0], box.left),
          Math.min(drawn[1], box.top),
          Math.max(drawn[2], box.right),
          Math.max(drawn[3], box.bottom),
        ]
      : [box.left, box.top, box.right, box.bottom];
  }
  const [left, top, right, bottom] = drawn ?? [own.left, own.top, own.right, own.bottom];
  return { x: left, y: top, width: right - left, height: bottom - top };
}

/** The root's first element and what it draws, with the reach of its shadow. */
async function shoot(page: Page, file: string): Promise<Uint8Array | undefined> {
  const root = page.locator('#root > *').first();
  const box = (await root.count()) > 0 ? await root.evaluate(drawnBox) : null;
  if (box === null) return undefined;
  const reach = await root.evaluate(shadowReach, REACH_MAX);
  const size = await page.evaluate(pageSize);
  const rect = widened({ ...box, x: box.x + size.scrollX, y: box.y + size.scrollY }, reach, size);
  if (rect === undefined) return undefined;
  const [x, y, width, height] = rect;
  mkdirSync(dirname(file), { recursive: true });
  return await page.screenshot({
    path: file,
    fullPage: true,
    clip: { x, y, width, height },
    animations: 'disabled',
  });
}

export async function measurePage(
  browser: PlaywrightBrowser,
  input: Measure,
): Promise<MeasureReport> {
  const errors: string[] = [];
  let context: PlaywrightContext | undefined;
  let png: Uint8Array | undefined;
  const frames: MeasuredFrame[] = [];
  let unread: string[] = [];
  try {
    context = await browser.newContext({
      viewport: { width: input.width, height: input.height },
      deviceScaleFactor: 1,
      reducedMotion: 'reduce',
      // Nothing of an original may reach the network; a catalog page needs none.
      offline: true,
    });
    const page = await context.newPage();
    page.setDefaultTimeout(PAGE_TIMEOUT_MS);
    page.on('pageerror', (error) => errors.push(error.message));
    await page.goto(`${pathToFileURL(input.page).href}${input.search}`, { waitUntil: 'load' });
    await page.addStyleTag({ content: FRAME });
    await page.evaluate(settle);
    await page.evaluate(fontsReady);
    const shown = await page.evaluate(rendered);
    if (shown.mark === 'failed') return { state: 'failed', error: errors[0] ?? SAY.failed };
    if (shown.count === 0) return { state: 'failed', error: errors[0] ?? SAY.empty };

    await page.evaluate(dropMarks);
    await page.evaluate(walkNodes, { cap: WALK_CAP, root: 'draft' as const });
    if (!(await page.evaluate(installLayerTools))) return { state: 'failed', error: SAY.tools };
    const read = async (state: MeasureState, control: number): Promise<void> => {
      await page.evaluate(settle);
      const raw = await page.evaluate(readLayers, {
        cap: LAYERS_NODE_CAP,
        visits: VISIT_CAP,
        textMax: LAYER_TEXT_MAX,
        svgMax: LAYER_SVG_MAX,
      });
      const { outlines, hosts } = await page.evaluate(readPlaced, input.search === '');
      frames.push({ state, control, facts: layerFacts(raw), outlines, hosts });
    };

    // Motion off before anything is read, so a look is read where it ends, at rest too.
    const controls = await page.evaluate(prepareStates, {
      selector: CONTROLS,
      cap: input.controls,
      id: STYLE_ID,
    });
    await page.mouse.move(...AWAY);
    await read('rest', -1);
    png = await shoot(page, input.shot);

    for (let at = 0; at < controls; at += 1) {
      const point = await page.evaluate(aim, { at, middle: true });
      if (point !== null) {
        await page.mouse.move(point[0], point[1]);
        await page.evaluate(settle);
        if (await page.evaluate(hovered, at)) await read('hover', at);
        // Pressed, never clicked: the pointer leaves before it is let go.
        await page.mouse.down();
        await read('active', at);
        await page.mouse.move(...AWAY);
        await page.mouse.up();
        await page.evaluate(blurAll);
      }
      await page.keyboard.press('Shift');
      if (await page.evaluate(focusControl, at)) await read('focus', at);
      await page.evaluate(blurAll);
    }
    await page.evaluate(endStates).catch(() => undefined);
    if (input.probe !== undefined) unread = await page.evaluate(unreadOf, input.probe);
  } catch (cause) {
    return { state: 'failed', error: firstLine(cause) };
  } finally {
    await context?.close().catch(() => undefined);
  }
  if (png === undefined) return { state: 'failed', error: SAY.shot };
  const shot = png;
  try {
    const pixels = await inBlankPage(browser, (page) =>
      decodeIn(page, shot, 'the screenshot', errors),
    );
    if (pixels === undefined) return { state: 'failed', error: errors[0] ?? SAY.shot };
    return { state: 'measured', frames, pixels, unread };
  } catch (cause) {
    return { state: 'failed', error: firstLine(cause) };
  }
}
