// Page facts (ADR 0044): what the rules read about one visit of a draft, or of a live page for
// `rework` (`root: 'page'` walks the body instead of the draft's #root). The walk
// (`playwright-facts-walk.ts`) keeps its element list on the page as `window.__KITVAS_NODES__`, so
// axe and the passes after it name the same nodes by the same indexes. Text blocks
// (`playwright-facts-text.ts`) and controls (`playwright-facts-controls.ts`) are read over that
// list, then the fixed and sticky bars one viewport down.

import { FACTS_NODE_CAP, type FixedBar, type PageFacts } from '../domain/facts.ts';
import { readControls } from './playwright-facts-controls.ts';
import { readTexts } from './playwright-facts-text.ts';
import { type FactsRoot, type FactsWindow, walkNodes } from './playwright-facts-walk.ts';

type Page = import('playwright-core').Page;

/** Where the walk starts: `'draft'` (the default) walks #root, `'page'` the body of any page. */
export type FactsOptions = { root: FactsRoot };

/**
 * Runs in the page: the outermost fixed and sticky nodes, measured after scrolling one viewport
 * down, then scrolled back. A sticky node that went up with the page is not stuck, so it is no bar.
 * The height is the part inside the window.
 */
export async function readFixed(): Promise<FixedBar[]> {
  const nodes = (window as unknown as FactsWindow).__KITVAS_NODES__ ?? [];
  const frame = (): Promise<null> => new Promise((done) => requestAnimationFrame(() => done(null)));
  const pinned: { element: Element; node: number; top: number; sticky: boolean }[] = [];
  nodes.forEach((element, node) => {
    const position = getComputedStyle(element).position;
    if (position !== 'fixed' && position !== 'sticky') return;
    // The list is in document order: a bar inside a bar is part of it.
    if (pinned.some((outer) => outer.element.contains(element))) return;
    const rect = element.getBoundingClientRect();
    if (rect.width <= 1 || rect.height <= 1) return;
    pinned.push({ element, node, top: rect.top, sticky: position === 'sticky' });
  });
  if (pinned.length === 0) return [];
  const startX = window.scrollX;
  const startY = window.scrollY;
  window.scrollTo({ left: startX, top: startY + window.innerHeight, behavior: 'instant' });
  await frame();
  await frame();
  const moved = window.scrollY - startY;
  const bars: FixedBar[] = [];
  for (const { element, node, top, sticky } of pinned) {
    const rect = element.getBoundingClientRect();
    if (sticky && moved > 0 && top - rect.top >= moved - 1) continue;
    const shownTop = Math.max(0, rect.top);
    const shownBottom = Math.min(window.innerHeight, rect.bottom);
    if (shownBottom <= shownTop || rect.width <= 0) continue;
    bars.push({
      node,
      edge: rect.top <= 1 ? 'top' : rect.bottom >= window.innerHeight - 1 ? 'bottom' : 'other',
      height: Math.round((shownBottom - shownTop) * 100) / 100,
    });
  }
  window.scrollTo({ left: startX, top: startY, behavior: 'instant' });
  await frame();
  return bars;
}

/** The facts of the page as it is now; the passes (`playwright-passes.ts`) fill in the rest. */
export async function measureFacts(page: Page, options?: FactsOptions): Promise<PageFacts> {
  const root: FactsRoot = options?.root ?? 'draft';
  const walked = await page.evaluate(walkNodes, { cap: FACTS_NODE_CAP, root });
  for (const { node, text } of await page.evaluate(readTexts)) {
    const read = walked.nodes[node];
    if (read !== undefined) read.text = text;
  }
  for (const control of await page.evaluate(readControls)) {
    const node = walked.nodes[control.node];
    if (node === undefined) continue;
    node.field = control.field;
    node.action = control.action;
    node.image = control.image;
  }
  // The bars are a part of the facts a page can do without; they never cost the rest.
  const fixed = await page.evaluate(readFixed).catch((): FixedBar[] => []);
  return { ...walked, fixed, focus: [], reflow: null, spacing: null };
}
