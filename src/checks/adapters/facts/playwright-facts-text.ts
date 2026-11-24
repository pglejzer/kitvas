// Runs in the page, after the facts walk: the text facts of its text blocks. A text block is a
// non-inline element whose children in the flow are all inline; it counts its whole inline
// content. Lines are its text's line boxes (`Range.getClientRects`), and the characters on the
// widest line are the text's characters times the widest line's share of the summed line widths:
// spike 2 found that within one character of a per-character count, where characters ÷ lines was
// up to 12 off.
//
// Everything here is serialized into the page: it uses no name from outside the function, only
// the node list the walk left on `window` (`playwright-facts-walk.ts`).

import type { TextFacts } from '../../domain/page/facts.ts';
import type { FactsWindow } from './playwright-facts-walk.ts';

export type TextRead = { node: number; text: TextFacts };

export function readTexts(): TextRead[] {
  const nodes = (window as unknown as FactsWindow).__KITVAS_NODES__ ?? [];
  // Elements whose content is no text of the page: never a text block, never counted in one.
  const ATOMIC = new Set([
    'svg',
    'math',
    'select',
    'textarea',
    'input',
    'img',
    'video',
    'audio',
    'canvas',
    'iframe',
    'object',
    'embed',
    'picture',
    'script',
    'style',
    'template',
    'noscript',
    'br',
  ]);
  /**
   * The text nodes of an element's inline content; null when a child in the flow is a block. A
   * child out of the flow (absolute, fixed, display none) is left out, and an atomic inline child
   * (inline-block, inline-flex) is an object on the line: it is a text block of its own.
   */
  const inlineTexts = (element: Element): Text[] | null => {
    const found: Text[] = [];
    const visit = (parent: Element): boolean => {
      for (const child of Array.from(parent.childNodes)) {
        if (child instanceof Text) {
          found.push(child);
          continue;
        }
        if (!(child instanceof Element)) continue;
        const style = getComputedStyle(child);
        if (style.display === 'none') continue;
        if (style.position === 'absolute' || style.position === 'fixed') continue;
        if (style.display === 'inline' || style.display === 'contents') {
          if (!ATOMIC.has(child.tagName.toLowerCase()) && !visit(child)) return false;
          continue;
        }
        if (!style.display.startsWith('inline')) return false;
      }
      return true;
    };
    return visit(element) ? found : null;
  };
  const range = document.createRange();
  const measure = (element: Element): TextFacts | null => {
    const display = getComputedStyle(element).display;
    if (display === 'inline' || display === 'contents') return null;
    if (ATOMIC.has(element.tagName.toLowerCase())) return null;
    const texts = inlineTexts(element);
    if (texts === null) return null;
    const collapsed = texts
      .map((text) => text.data)
      .join('')
      .replace(/\s+/g, ' ')
      .trim();
    if (collapsed === '') return null;
    // Each rect of the text joins the line whose band holds its middle.
    const lines: { top: number; bottom: number; width: number }[] = [];
    for (const text of texts) {
      if (text.data.trim() === '') continue;
      range.selectNodeContents(text);
      for (const rect of Array.from(range.getClientRects())) {
        if (rect.width <= 0 || rect.height <= 0) continue;
        const middle = rect.top + rect.height / 2;
        const line = lines.find((entry) => middle >= entry.top && middle <= entry.bottom);
        if (line === undefined) {
          lines.push({ top: rect.top, bottom: rect.bottom, width: rect.width });
        } else {
          line.width += rect.width;
          line.top = Math.min(line.top, rect.top);
          line.bottom = Math.max(line.bottom, rect.bottom);
        }
      }
    }
    const total = lines.reduce((sum, line) => sum + line.width, 0);
    const widest = lines.reduce((most, line) => Math.max(most, line.width), 0);
    const chars = collapsed.length;
    return {
      chars,
      lines: Math.max(1, lines.length),
      longest: total > 0 ? Math.round((chars * widest) / total) : chars,
      sample: collapsed.slice(0, 80),
    };
  };
  const reads: TextRead[] = [];
  nodes.forEach((element, node) => {
    try {
      const text = measure(element);
      if (text !== null) reads.push({ node, text });
    } catch {
      // A block that cannot be measured keeps no text facts.
    }
  });
  return reads;
}
