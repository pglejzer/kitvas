// Runs in the page: what a person sees there as a list, for `rework` (ADR 0045). Headings, text
// blocks, links, actions, fields, images, prices and the brand mark, in document order, from the
// visible elements under the body only.
//
// Everything here is serialized into the page: it uses no name from outside the function, so even
// the price pattern is written again here and `priceValue` is not imported.

import type { InventoryItem } from '../../domain/rework/inventory.ts';

export function readInventory(options: { width: number }): InventoryItem[] {
  const MAX = 400;
  type Kind = InventoryItem['kind'];
  type Ctx = { head: boolean; link: boolean; button: boolean };
  type Control = HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement;

  const items: InventoryItem[] = [];
  const seen = new Set<string>();
  const SKIP = new Set([
    'script',
    'style',
    'template',
    'noscript',
    'head',
    'meta',
    'link',
    'title',
  ]);
  // Children that end a run of text instead of joining it.
  const BOUNDARY = new Set([
    'img',
    'svg',
    'picture',
    'video',
    'canvas',
    'iframe',
    'button',
    'input',
    'select',
    'textarea',
    'label',
  ]);
  const ACTION_INPUTS = new Set(['submit', 'button', 'reset', 'image']);
  const CLEAN: Ctx = { head: false, link: false, button: false };
  const CUR =
    '(?:[$\\u20ac\\u00a3\\u00a5\\u20b9\\u20a9\\u20bd]|z\\u0142|pln|usd|eur|gbp|chf|czk|sek|nok|dkk|jpy|kr|rub|uah|huf|ron)';
  const NUM = '\\d(?:[\\d\\s.,]*\\d)?';
  const PRICE = new RegExp(`^(?:${CUR}\\s?${NUM}|${NUM}\\s?${CUR})$`, 'i');

  const squash = (value: string | null | undefined): string =>
    (value ?? '').replace(/\s+/g, ' ').trim();
  const hasWord = (value: string): boolean => /[\p{L}\p{N}]/u.test(value);

  const make = (
    kind: Kind,
    text: string,
    extra: { href?: string; level?: number } = {},
  ): InventoryItem => {
    const item: InventoryItem = { kind, text, width: options.width, read: 'measured' };
    if (extra.href !== undefined) item.href = extra.href;
    if (extra.level !== undefined) item.level = extra.level;
    return item;
  };
  const add = (item: InventoryItem, at?: number): void => {
    if (items.length >= MAX) return;
    if (item.text === '' && item.kind !== 'brand') return;
    const key = `${item.kind}\u0000${item.text}`;
    if (seen.has(key)) return;
    seen.add(key);
    if (at === undefined) items.push(item);
    else items.splice(at, 0, item);
  };

  /** Drawn on the page: not none, not hidden, not empty, not an sr-only clip. */
  const shown = (el: Element): boolean => {
    const style = getComputedStyle(el);
    if (style.display === 'contents') return true;
    if (style.display === 'none') return false;
    if (style.visibility === 'hidden' || style.visibility === 'collapse') return false;
    const rect = el.getBoundingClientRect();
    if (rect.width === 0 || rect.height === 0) return false;
    if (rect.width <= 1 && rect.height <= 1) return false;
    if (/rect\(\s*0(?:px)?[\s,]+0(?:px)?[\s,]+0(?:px)?[\s,]+0(?:px)?\s*\)/.test(style.clip)) {
      return false;
    }
    return !/inset\(\s*(?:50|100)%/.test(style.clipPath);
  };
  const textOf = (el: Element): string => squash(el.textContent);
  const byIds = (el: Element): string =>
    squash(
      (el.getAttribute('aria-labelledby') ?? '')
        .split(/\s+/)
        .map((id) => (id === '' ? '' : (document.getElementById(id)?.textContent ?? '')))
        .join(' '),
    );
  const ariaName = (el: Element): string => squash(el.getAttribute('aria-label')) || byIds(el);
  const titleOf = (el: Element): string => squash(el.getAttribute('title'));

  const imageName = (el: Element): string =>
    squash(el.getAttribute('alt')) || ariaName(el) || titleOf(el);
  const svgName = (el: Element): string =>
    ariaName(el) || squash(el.querySelector('title')?.textContent) || titleOf(el);
  const linkName = (el: Element): string =>
    ariaName(el) ||
    textOf(el) ||
    titleOf(el) ||
    squash(el.querySelector('img[alt]')?.getAttribute('alt'));
  const actionName = (el: Element): string => {
    const input = el instanceof HTMLInputElement ? squash(el.value) || squash(el.alt) : '';
    return ariaName(el) || input || textOf(el) || titleOf(el);
  };
  const fieldName = (el: Control): string => {
    const labels: HTMLLabelElement[] = el.labels ? Array.from(el.labels) : [];
    const fromLabels = labels
      .map((label) => {
        const copy = label.cloneNode(true) as HTMLElement;
        for (const inner of Array.from(copy.querySelectorAll('input,select,textarea,button'))) {
          inner.remove();
        }
        return squash(copy.textContent);
      })
      .filter((text) => text !== '')
      .join(' ');
    return fromLabels || ariaName(el) || squash(el.getAttribute('placeholder'));
  };

  const isHome = (a: Element): boolean => {
    try {
      const url = new URL(a.getAttribute('href') ?? '', location.href);
      return url.origin === location.origin && url.pathname === '/';
    } catch {
      return false;
    }
  };

  /** The first logo-like img or svg near the top left of the header, banner or home link. */
  const findBrand = (): Element | null => {
    for (const el of Array.from(document.body.querySelectorAll('img, svg'))) {
      if (el.tagName.toLowerCase() === 'svg' && el.parentElement?.closest('svg')) continue;
      if (el.closest('button, [role="button"]')) continue;
      const home = el.closest('a[href]');
      const inBanner = el.closest('header, [role="banner"]') !== null;
      if (!inBanner && !(home !== null && isHome(home))) continue;
      if (!shown(el)) continue;
      const rect = el.getBoundingClientRect();
      if (rect.left <= window.innerWidth / 2 && rect.top + window.scrollY <= 240) return el;
    }
    return null;
  };
  const brandEl = findBrand();
  const brandName = (el: Element): string => {
    const own = el.tagName.toLowerCase() === 'svg' ? svgName(el) : imageName(el);
    if (own !== '') return own;
    const home = el.closest('a[href]');
    return home ? linkName(home) : '';
  };

  const isInline = (el: Element): boolean =>
    !BOUNDARY.has(el.tagName.toLowerCase()) && getComputedStyle(el).display.startsWith('inline');
  const isControlInline = (el: Element): boolean => {
    const role = (el.getAttribute('role') ?? '').toLowerCase();
    return el.tagName.toLowerCase() === 'a' || role === 'link' || role === 'button';
  };

  const walkChildren = (parent: Element, ctx: Ctx, gather: boolean): void => {
    let buf = '';
    let start = -1;
    let own = false;
    const flush = (): void => {
      const text = squash(buf);
      if (own && start >= 0 && text.split(' ').length >= 3) add(make('text', text), start);
      buf = '';
      start = -1;
      own = false;
    };
    for (const child of Array.from(parent.childNodes)) {
      if (items.length >= MAX) break;
      if (child.nodeType === Node.TEXT_NODE) {
        const raw = child.nodeValue ?? '';
        const text = squash(raw);
        if (text === '') {
          if (gather && buf !== '') buf += ' ';
          continue;
        }
        if (gather && start < 0) start = items.length;
        if (PRICE.test(text)) add(make('price', text));
        if (gather) {
          buf += ` ${raw}`;
          if (hasWord(text)) own = true;
        }
        continue;
      }
      if (child.nodeType !== Node.ELEMENT_NODE) continue;
      const el = child as Element;
      const tag = el.tagName.toLowerCase();
      if (gather && tag === 'br') {
        buf += ' ';
        continue;
      }
      if (gather && isInline(el)) {
        if (shown(el)) {
          const text = textOf(el);
          if (text !== '' && start < 0) start = items.length;
          buf += ` ${text}`;
          if (hasWord(text) && !isControlInline(el)) own = true;
        }
        walkElement(el, ctx, false);
        continue;
      }
      if (gather) flush();
      walkElement(el, ctx, gather);
    }
    if (gather) flush();
  };

  const walkElement = (el: Element, ctx: Ctx, canGather: boolean): void => {
    if (items.length >= MAX) return;
    const tag = el.tagName.toLowerCase();
    if (SKIP.has(tag) || !shown(el)) return;
    const role = (el.getAttribute('role') ?? '').toLowerCase();

    if (el === brandEl) {
      add(make('brand', brandName(el)));
      return;
    }
    const level = /^h[1-6]$/.test(tag)
      ? Number(tag.slice(1))
      : role === 'heading'
        ? Math.min(6, Math.max(1, Number.parseInt(el.getAttribute('aria-level') ?? '2', 10) || 2))
        : 0;
    if (level > 0) {
      add(make('heading', textOf(el), { level }));
      walkChildren(el, { ...ctx, head: true }, false);
      return;
    }
    const inputType = (el.getAttribute('type') ?? 'text').toLowerCase();
    if (
      tag === 'button' ||
      role === 'button' ||
      (tag === 'input' && ACTION_INPUTS.has(inputType))
    ) {
      add(make('action', actionName(el)));
      if (tag !== 'input') walkChildren(el, { ...ctx, button: true }, false);
      return;
    }
    if ((tag === 'a' && el.hasAttribute('href')) || role === 'link') {
      const href = el.getAttribute('href');
      add(make('link', linkName(el), href === null ? {} : { href }));
      walkChildren(el, { ...ctx, link: true }, false);
      return;
    }
    if (tag === 'input' || tag === 'select' || tag === 'textarea') {
      if (inputType !== 'hidden') add(make('field', fieldName(el as Control)));
      return;
    }
    if (tag === 'img') {
      add(make('image', imageName(el)));
      return;
    }
    if (tag === 'svg') {
      add(make('image', svgName(el)));
      return;
    }
    if (role === 'img') {
      add(make('image', ariaName(el) || titleOf(el)));
      return;
    }
    const gathers =
      canGather && !ctx.head && !ctx.link && !ctx.button && tag !== 'label' && !isInline(el);
    walkChildren(el, ctx, gathers);
  };

  walkChildren(document.body, CLEAN, true);
  return items;
}
