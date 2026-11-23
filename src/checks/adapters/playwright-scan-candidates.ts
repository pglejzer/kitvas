// Runs in the page (the main frame and each same-origin frame): the elements a kit could copy, by
// kind, those inside `main` first and banners last. Each one gets a mark attribute, so the adapter
// finds it with a locator, whose box counts the offset of the frame it sits in.
//
// Everything here is serialized into the page: it uses no name from outside the function.

import type { CandidateKind } from '../domain/scan-facts.ts';

export type FrameCandidate = {
  /** The value of the mark attribute the element got. */
  mark: string;
  kind: CandidateKind;
  /** 0 inside `main`, 1 elsewhere, 2 in a banner (and so for the frame's own element). */
  rank: number;
  /** Place among the frame's visible elements, in document order. */
  order: number;
  /** Inside a fixed or sticky element that covers `overlayShare` of the window or more. */
  overlay: boolean;
  text: string;
  style: Record<string, string>;
};

export type PickOptions = {
  /** The share of the window's area that makes a fixed or sticky element an overlay, 0 to 1. */
  overlayShare: number;
  /** The attribute that marks a candidate. */
  attribute: string;
  /** Kept per kind in this frame: a few more than the facts take, as some may have no box. */
  perKind: number;
  textMax: number;
  valueMax: number;
  elementsMax: number;
};

export function pickCandidates(options: PickOptions): FrameCandidate[] {
  const { attribute, perKind, textMax, valueMax, elementsMax, overlayShare } = options;

  const canvas = document.createElement('canvas');
  canvas.width = 1;
  canvas.height = 1;
  const context = canvas.getContext('2d', { willReadFrequently: true });
  const pair = (channel: number): string => channel.toString(16).padStart(2, '0');
  const painted = new Map<string, string>();
  /** `#rrggbb`, `#rrggbbaa` when not opaque, '' for no colour or a transparent one. */
  const paint = (value: string): string => {
    const known = painted.get(value);
    if (known !== undefined) return known;
    let hex = '';
    if (context && value !== '' && CSS.supports('color', value)) {
      context.clearRect(0, 0, 1, 1);
      context.fillStyle = value;
      context.fillRect(0, 0, 1, 1);
      const [red = 0, green = 0, blue = 0, alpha = 0] = context.getImageData(0, 0, 1, 1).data;
      const opaque = `#${pair(red)}${pair(green)}${pair(blue)}`;
      if (alpha === 255) hex = opaque;
      else if (alpha > 0) hex = `${opaque}${pair(alpha)}`;
    }
    painted.set(value, hex);
    return hex;
  };

  const sides = ['top', 'right', 'bottom', 'left'];
  const borderOf = (style: CSSStyleDeclaration, side: string): string => {
    const kind = style.getPropertyValue(`border-${side}-style`);
    const width = style.getPropertyValue(`border-${side}-width`);
    if (kind === 'none' || kind === 'hidden' || !(Number.parseFloat(width) > 0)) return '';
    const colour = paint(style.getPropertyValue(`border-${side}-color`));
    return colour === '' ? '' : `${width} ${kind} ${colour}`;
  };
  const outerShadow = (style: CSSStyleDeclaration): boolean =>
    style.boxShadow !== 'none' &&
    style.boxShadow.split(/,(?![^(]*\))/).some((part) => !/\binset\b/i.test(part));
  const rounded = (style: CSSStyleDeclaration): boolean =>
    ['top-left', 'top-right', 'bottom-right', 'bottom-left'].some(
      (corner) => Number.parseFloat(style.getPropertyValue(`border-${corner}-radius`)) > 0,
    );

  // Form controls and media are never cards or badges, nor are the page's own frames.
  const NOT_BOXES = new Set([
    'input',
    'select',
    'textarea',
    'button',
    'option',
    'label',
    'fieldset',
    'legend',
    'img',
    'svg',
    'video',
    'canvas',
    'iframe',
    'html',
    'body',
    'main',
    'hr',
    'table',
    'thead',
    'tbody',
    'tfoot',
    'tr',
    'td',
    'th',
  ]);
  const TEXT_INPUTS = new Set([
    'text',
    'email',
    'search',
    'tel',
    'url',
    'password',
    'number',
    'date',
    'datetime-local',
    'month',
    'time',
    'week',
  ]);
  const pageWidth = document.documentElement.clientWidth;

  // The text is read last: a container's text is all of the text below it.
  const isCard = (style: CSSStyleDeclaration, rect: DOMRect, text: () => string): boolean => {
    if (style.display === 'inline' || style.display === 'contents') return false;
    if (style.display.startsWith('table')) return false;
    // A band from edge to edge is a header or a section, not a card.
    if (rect.width < 64 || rect.height < 40 || rect.width >= pageWidth - 8) return false;
    const boxed = sides.every((side) => borderOf(style, side) !== '') || outerShadow(style);
    return boxed && text() !== '';
  };
  const isBadge = (style: CSSStyleDeclaration, rect: DOMRect, text: () => string): boolean => {
    if (rect.height < 8 || rect.height > 32 || rect.width > 200) return false;
    const filled =
      paint(style.backgroundColor) !== '' || sides.some((side) => borderOf(style, side) !== '');
    if (!filled || !rounded(style)) return false;
    const words = text();
    return words !== '' && words.length <= 24;
  };
  const kindOf = (element: Element, rect: DOMRect): CandidateKind | undefined => {
    const tag = element.localName;
    const role = element.getAttribute('role') ?? '';
    const type = element instanceof HTMLInputElement ? element.type : '';
    if (tag === 'button' || role === 'button' || ['submit', 'button', 'reset'].includes(type)) {
      return 'button';
    }
    if ((tag === 'a' && element.hasAttribute('href')) || role === 'link') return 'link';
    if (tag === 'textarea' || TEXT_INPUTS.has(type)) return 'input';
    if (tag === 'select') return 'select';
    if (['checkbox', 'radio'].includes(type) || ['checkbox', 'radio', 'switch'].includes(role)) {
      return 'checkbox';
    }
    if (/^h[1-6]$/.test(tag) || role === 'heading') return 'heading';
    if (NOT_BOXES.has(tag)) return undefined;
    const style = getComputedStyle(element);
    const text = (): string => (element.textContent ?? '').trim();
    if (isCard(style, rect, text)) return 'card';
    if (isBadge(style, rect, text)) return 'badge';
    return undefined;
  };

  const banners = new Map<Element, boolean>();
  /** Inside a region or dialog, or something fixed or sticky to the top or bottom of the window. */
  const inBanner = (element: Element, view: Window): boolean => {
    const path: Element[] = [];
    let found = false;
    for (let node: Element | null = element; node !== null; node = node.parentElement) {
      const known = banners.get(node);
      if (known !== undefined) {
        found = known;
        break;
      }
      path.push(node);
      const role = node.getAttribute('role');
      if (role === 'region' || role === 'dialog' || role === 'alertdialog') {
        found = true;
        break;
      }
      if (node.localName === 'dialog') {
        found = true;
        break;
      }
      const position = view.getComputedStyle(node).position;
      if (position === 'fixed' || position === 'sticky') {
        const box = node.getBoundingClientRect();
        if (box.top <= 1 || box.bottom >= view.innerHeight - 1) {
          found = true;
          break;
        }
      }
    }
    for (const node of path) banners.set(node, found);
    return found;
  };
  const windowArea = window.innerWidth * window.innerHeight;
  const overlays = new Map<Element, boolean>();
  const isOverlay = (node: Element): boolean => {
    const position = getComputedStyle(node).position;
    if (position !== 'fixed' && position !== 'sticky') return false;
    const box = node.getBoundingClientRect();
    const width = Math.min(box.right, window.innerWidth) - Math.max(box.left, 0);
    const height = Math.min(box.bottom, window.innerHeight) - Math.max(box.top, 0);
    return width > 0 && height > 0 && (width * height) / windowArea >= overlayShare;
  };
  /** The element or one of its parents is an overlay. */
  const inOverlay = (element: Element): boolean => {
    const path: Element[] = [];
    let found = false;
    for (let node: Element | null = element; node !== null; node = node.parentElement) {
      const known = overlays.get(node);
      if (known !== undefined) {
        found = known;
        break;
      }
      path.push(node);
      if (isOverlay(node)) {
        found = true;
        break;
      }
    }
    for (const node of path) overlays.set(node, found);
    return found;
  };
  const MAIN = 'main, [role="main"]';
  const framed = window.parent !== window;
  const hasMain = document.querySelector(MAIN) !== null;
  const rankOf = (element: Element, view: Window, own: boolean): number => {
    if (inBanner(element, view)) return 2;
    if (element.closest(MAIN) !== null) return 0;
    // A framed example page often has no `main`: then all of it counts as content.
    return own && framed && !hasMain ? 0 : 1;
  };
  // A frame inside a banner is a banner; a frame inside `main` makes its content count as main.
  let hostRank = 0;
  try {
    let view: Window = window;
    while (view.frameElement !== null) {
      const host = view.frameElement;
      const parent = host.ownerDocument.defaultView;
      if (parent === null) break;
      hostRank = Math.max(hostRank, rankOf(host, parent, false));
      view = parent;
    }
  } catch {
    // A parent of another origin: nothing more to read.
  }

  const clean = (value: string): string => value.replace(/\s+/g, ' ').trim().slice(0, textMax);
  const textOf = (element: Element): string => {
    if (element instanceof HTMLInputElement && ['checkbox', 'radio'].includes(element.type)) {
      return clean(element.labels?.[0]?.textContent ?? element.getAttribute('aria-label') ?? '');
    }
    if (element instanceof HTMLInputElement || element instanceof HTMLTextAreaElement) {
      return clean(element.getAttribute('aria-label') ?? (element.placeholder || element.value));
    }
    if (element instanceof HTMLSelectElement) return clean(element.selectedOptions[0]?.text ?? '');
    if (element instanceof HTMLElement) return clean(element.textContent ?? '');
    return clean(element.textContent ?? '');
  };
  const styleOf = (element: Element, kind: CandidateKind): Record<string, string> => {
    const style = getComputedStyle(element);
    const out: Record<string, string> = {};
    const put = (name: string, value: string): void => {
      if (value !== '' && value.length <= valueMax) out[name] = value;
    };
    put('color', paint(style.color));
    put('background-color', paint(style.backgroundColor));
    if (/gradient\(/.test(style.backgroundImage)) put('background-image', style.backgroundImage);
    put('font-family', style.fontFamily);
    put('font-size', style.fontSize);
    put('font-weight', style.fontWeight);
    put('line-height', style.lineHeight);
    if (style.letterSpacing !== 'normal') put('letter-spacing', style.letterSpacing);
    if (style.textTransform !== 'none') put('text-transform', style.textTransform);
    put('padding', style.padding);
    const lines = sides.map((side) => borderOf(style, side));
    if (lines.every((line) => line === lines[0])) {
      put('border', lines[0] ?? '');
    } else {
      for (const [index, side] of sides.entries()) put(`border-${side}`, lines[index] ?? '');
    }
    if (rounded(style)) put('border-radius', style.borderRadius);
    if (style.boxShadow !== 'none') put('box-shadow', style.boxShadow);
    if (kind === 'link') put('text-decoration-line', style.textDecorationLine);
    if (kind === 'checkbox' && style.accentColor !== 'auto') {
      put('accent-color', paint(style.accentColor));
    }
    if (Number.parseFloat(style.opacity) < 1) put('opacity', style.opacity);
    return out;
  };

  const found: {
    element: Element;
    kind: CandidateKind;
    rank: number;
    order: number;
    overlay: boolean;
  }[] = [];
  let order = 0;
  for (const element of Array.from(document.querySelectorAll('body *')).slice(0, elementsMax)) {
    const rect = element.getBoundingClientRect();
    if (rect.width <= 0 || rect.height <= 0) continue;
    if (!element.checkVisibility({ opacityProperty: true, visibilityProperty: true })) continue;
    order += 1;
    const kind = kindOf(element, rect);
    if (kind === undefined) continue;
    const rank = Math.max(hostRank, rankOf(element, window, true));
    found.push({ element, kind, rank, order, overlay: inOverlay(element) });
  }
  // Overlays last, so a dialog never takes the place of the page's own elements in the cap.
  found.sort((a, b) => +a.overlay - +b.overlay || a.rank - b.rank || a.order - b.order);

  const kept = new Map<CandidateKind, number>();
  const picked: FrameCandidate[] = [];
  for (const { element, kind, rank, order: place, overlay } of found) {
    const count = kept.get(kind) ?? 0;
    if (count >= perKind) continue;
    kept.set(kind, count + 1);
    const mark = String(picked.length);
    element.setAttribute(attribute, mark);
    const text = textOf(element);
    picked.push({
      mark,
      kind,
      rank,
      order: place,
      overlay,
      text,
      style: styleOf(element, kind),
    });
  }
  return picked;
}
