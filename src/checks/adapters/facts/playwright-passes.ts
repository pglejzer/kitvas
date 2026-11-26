// The passes of a visit after its screenshot, in the order of ADR 0044: `reflow` (the page resized
// to REFLOW_VIEWPORT and back), `focus` (`playwright-facts-focus.ts`), `deep`
// (`playwright-deep.ts`) and `spacing` last, because its override changes the layout of every
// text. Each pass names nodes by the indexes of the facts walk (`window.__KITVAS_NODES__`). A pass
// that throws leaves its field empty or null, and the next one still runs.
//
// The functions passed to `page.evaluate` use nothing from this module.

import { type PageFacts, REFLOW_VIEWPORT, SPACING_OVERRIDE } from '../../domain/page/facts.ts';
import type { PageReport } from '../../domain/page/page.ts';
import type { Pass } from '../../ports/browser.ts';
import { settle } from '../browser/settle.ts';
import { deepPasses } from './playwright-deep.ts';
import { focusWalk } from './playwright-facts-focus.ts';
import type { FactsWindow } from './playwright-facts-walk.ts';

type Page = import('playwright-core').Page;

/** A box or a scroll size past its edge by this much or less is rounding, not overflow. */
export const SLACK = 1;
/** The style element of the spacing override, so it can be taken out again. */
const OVERRIDE_ID = 'kitvas-spacing-override';
/** Fields and media hold content of their own; their overflow is not the page's text cut off. */
const NOT_TEXT = new Set([
  'input',
  'select',
  'textarea',
  'img',
  'svg',
  'video',
  'audio',
  'canvas',
  'iframe',
  'object',
  'embed',
]);

export type PassVisit = { width: number; height: number; passes: readonly Pass[] };
export type SpacingInput = {
  /** Nodes whose own overflow may cut text off. */
  nodes: number[];
  /** Text blocks with their parent node, for overlaps between siblings. */
  blocks: { node: number; parent: number }[];
  slack: number;
};
export type SpacingRead = { clipped: number[]; pairs: [number, number][] };

/**
 * Runs in the page at the reflow size: the document's scroll width and the deepest nodes whose
 * right edge, or the text they hold, is past `edge`. A node inside something that keeps it in (a
 * scroller or a clipper below #root, or a fixed box) is exempt, and so is a fixed node.
 */
export function readReflow(edge: number): { scrollWidth: number; over: number[] } {
  const scope = window as unknown as FactsWindow;
  const nodes = scope.__KITVAS_NODES__ ?? [];
  const tools = scope.__KITVAS_TOOLS__;
  const root = document.getElementById('root');
  const held = new Map<Element, boolean>();
  const keepsIn = (element: Element): boolean => {
    const style = getComputedStyle(element);
    return style.position === 'fixed' || style.overflowX !== 'visible';
  };
  /** An ancestor below #root keeps the element in. */
  const heldIn = (element: Element): boolean => {
    const parent = element.parentElement;
    if (parent === null || root === null || parent === root || !root.contains(parent)) return false;
    const known = held.get(parent);
    if (known !== undefined) return known;
    const result = keepsIn(parent) || heldIn(parent);
    held.set(parent, result);
    return result;
  };
  const past = new Set<number>();
  const range = document.createRange();
  nodes.forEach((element, node) => {
    if (!element.isConnected) return;
    const rect = element.getBoundingClientRect();
    if (rect.width <= 1 || rect.height <= 1) return;
    if (getComputedStyle(element).position === 'fixed' || heldIn(element)) return;
    let right = rect.right + window.scrollX;
    // A word that does not break runs out of its box without widening it.
    if (right <= edge && element.scrollWidth > element.clientWidth + 1) {
      for (const child of Array.from(element.childNodes)) {
        if (!(child instanceof Text) || child.data.trim() === '') continue;
        range.selectNodeContents(child);
        for (const line of Array.from(range.getClientRects())) {
          right = Math.max(right, line.right + window.scrollX);
        }
      }
    }
    // Visually hidden text (moved off screen or clipped to nothing) widens nothing a person sees.
    if (right > edge && tools?.hidden(element) !== true) past.add(node);
  });
  // The deepest: a node past the edge with another past the edge inside it is left out.
  const above = new Set<number>();
  for (const node of past) {
    for (
      let up = nodes[node]?.parentElement ?? null;
      up !== null && up !== root;
      up = up.parentElement
    ) {
      const at = tools === undefined ? nodes.indexOf(up) : tools.index(up);
      if (at !== -1) above.add(at);
    }
  }
  return {
    scrollWidth: document.documentElement.scrollWidth,
    over: Array.from(past)
      .filter((node) => !above.has(node))
      .sort((a, b) => a - b),
  };
}

/**
 * Runs in the page: nodes whose text is cut off, and pairs of sibling text blocks that overlap.
 * Cut off: overflow hidden or clip on an axis with content past it, or a text block whose own text
 * runs out of its box on an axis it does not cut. A text block's extent is its box and its text.
 */
export function readSpacing({ nodes: checked, blocks, slack }: SpacingInput): SpacingRead {
  const nodes = (window as unknown as FactsWindow).__KITVAS_NODES__ ?? [];
  const cuts = (value: string): boolean => value === 'hidden' || value === 'clip';
  const range = document.createRange();
  const textRects = (element: Element): DOMRect[] => {
    range.selectNodeContents(element);
    return Array.from(range.getClientRects()).filter((rect) => rect.width > 0 && rect.height > 0);
  };
  const clipped = new Set<number>();
  for (const node of checked) {
    const element = nodes[node];
    if (element === undefined || !element.isConnected) continue;
    const style = getComputedStyle(element);
    const x = cuts(style.overflowX) && element.scrollWidth > element.clientWidth + slack;
    const y = cuts(style.overflowY) && element.scrollHeight > element.clientHeight + slack;
    if ((x || y) && (element.textContent ?? '').trim() !== '') clipped.add(node);
  }
  type Extent = { node: number; left: number; top: number; right: number; bottom: number };
  const groups = new Map<number, Extent[]>();
  for (const { node, parent } of blocks) {
    const element = nodes[node];
    if (element === undefined || !element.isConnected) continue;
    const box = element.getBoundingClientRect();
    const style = getComputedStyle(element);
    // On an axis the block cuts, its text never shows past its box.
    const acrossOpen = !cuts(style.overflowX);
    const downOpen = !cuts(style.overflowY);
    const rects = textRects(element);
    const spills = rects.some(
      (rect) =>
        (acrossOpen && (rect.right > box.right + slack || rect.left < box.left - slack)) ||
        (downOpen && (rect.bottom > box.bottom + slack || rect.top < box.top - slack)),
    );
    if (spills) clipped.add(node);
    const extent: Extent = {
      node,
      left: box.left,
      top: box.top,
      right: box.right,
      bottom: box.bottom,
    };
    for (const rect of rects) {
      if (acrossOpen) {
        extent.left = Math.min(extent.left, rect.left);
        extent.right = Math.max(extent.right, rect.right);
      }
      if (downOpen) {
        extent.top = Math.min(extent.top, rect.top);
        extent.bottom = Math.max(extent.bottom, rect.bottom);
      }
    }
    const group = groups.get(parent) ?? [];
    group.push(extent);
    groups.set(parent, group);
  }
  const pairs: [number, number][] = [];
  for (const group of groups.values()) {
    group.forEach((one, at) => {
      for (const other of group.slice(at + 1)) {
        const wide = Math.min(one.right, other.right) - Math.max(one.left, other.left);
        const tall = Math.min(one.bottom, other.bottom) - Math.max(one.top, other.top);
        if (wide > slack && tall > slack) {
          pairs.push([Math.min(one.node, other.node), Math.max(one.node, other.node)]);
        }
      }
    });
  }
  return { clipped: Array.from(clipped).sort((a, b) => a - b), pairs };
}

/** Runs in the page. */
function addOverride({ id, css }: { id: string; css: string }): void {
  const style = document.createElement('style');
  style.id = id;
  style.textContent = css;
  document.head.append(style);
}

/** Runs in the page. */
function removeOverride(id: string): void {
  document.getElementById(id)?.remove();
}

/** What the override made new: clipped nodes, and the first node of each new overlapping pair. */
export function newProblems(
  before: SpacingRead,
  after: SpacingRead,
): NonNullable<PageFacts['spacing']> {
  const wasClipped = new Set(before.clipped);
  const pairKey = ([one, other]: [number, number]): string => `${one}:${other}`;
  const wasPaired = new Set(before.pairs.map(pairKey));
  const overlapping = new Set<number>();
  for (const pair of after.pairs) {
    if (!wasPaired.has(pairKey(pair))) overlapping.add(Math.min(pair[0], pair[1]));
  }
  return {
    clipped: [...new Set(after.clipped)]
      .filter((node) => !wasClipped.has(node))
      .sort((a, b) => a - b),
    overlapping: [...overlapping].sort((a, b) => a - b),
  };
}

/** The page at 320 × 568: its scroll width and the nodes past the edge. The size is put back. */
export async function reflowPass(
  page: Page,
  back: { width: number; height: number },
): Promise<PageFacts['reflow']> {
  await page.setViewportSize({ width: REFLOW_VIEWPORT.width, height: REFLOW_VIEWPORT.height });
  try {
    await page.evaluate(settle);
    return await page.evaluate(readReflow, REFLOW_VIEWPORT.width + SLACK);
  } finally {
    await page.setViewportSize(back);
    await page.evaluate(settle);
  }
}

/** WCAG 1.4.12: what is cut off or overlaps with SPACING_OVERRIDE and was not before it. */
export async function spacingPass(page: Page, facts: PageFacts): Promise<PageFacts['spacing']> {
  const input: SpacingInput = {
    nodes: facts.nodes.flatMap((node, at) => (node.hidden || NOT_TEXT.has(node.tag) ? [] : [at])),
    blocks: facts.nodes.flatMap((node, at) =>
      node.text === null || node.hidden ? [] : [{ node: at, parent: node.parent }],
    ),
    slack: SLACK,
  };
  const before = await page.evaluate(readSpacing, input);
  await page.evaluate(addOverride, { id: OVERRIDE_ID, css: SPACING_OVERRIDE });
  try {
    await page.evaluate(settle);
    return newProblems(before, await page.evaluate(readSpacing, input));
  } finally {
    await page.evaluate(removeOverride, OVERRIDE_ID).catch(() => undefined);
  }
}

async function attempt<T>(run: () => Promise<T>, otherwise: T): Promise<T> {
  try {
    return await run();
  } catch {
    return otherwise;
  }
}

/** The passes the visit asks for, in their fixed order; they need the facts' node list. */
export async function runPasses(page: Page, visit: PassVisit, report: PageReport): Promise<void> {
  const facts = report.facts;
  if (facts === null) return;
  const back = { width: visit.width, height: visit.height };
  if (visit.passes.includes('reflow')) {
    facts.reflow = await attempt(() => reflowPass(page, back), null);
  }
  if (visit.passes.includes('focus')) {
    facts.focus = await attempt(() => focusWalk(page), []);
  }
  if (visit.passes.includes('deep')) {
    const unsure = report.contrastUnsure.map((entry) => entry.node);
    report.deep = await attempt(() => deepPasses(page, { ...back, unsure }), null);
  }
  if (visit.passes.includes('spacing')) {
    facts.spacing = await attempt(() => spacingPass(page, facts), null);
  }
}
