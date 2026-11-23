// Runs in the page: the facts walk of a visit (ADR 0044). One record per visible element under
// the root (a box of some size, visibility not hidden), in document order and at most `cap` of
// them: the style as the browser paints it, the nearest landmark and whether the element is
// visually hidden. The root is a draft's #root, or the body of any page (`root: 'page'`, a live
// page measured for `rework`). Text, controls and bars are read after it, over the same list. The
// element list stays on the page as `window.__KITVAS_NODES__` and the helpers the later reads share
// as `window.__KITVAS_TOOLS__`, so axe and every pass of the visit name the same node by the same
// index.
//
// Everything here is serialized into the page: it uses no name from outside the function.

import type { Box, Colour, FactNode, Landmark, NodeStyle, PageFacts } from '../domain/facts.ts';

/** Where the walk starts: a draft's #root, or the body of any page. */
export type FactsRoot = 'draft' | 'page';

/** What the walk leaves on the page for the reads after it (controls, focus, passes). */
export type PageTools = {
  /** The node index of an element; -1 when it is not one of the nodes. */
  index(element: Element): number;
  /** A CSS colour as the browser paints it, `#rrggbbaa`; '' when the value is no colour. */
  paint(value: string): Colour;
  /** What is painted behind the element: its own and its ancestors' backgrounds over white. */
  ground(element: Element): Colour;
  /**
   * Visually hidden: a box of 1 px or less, clipped to nothing, inside something that hides, off
   * the page, or wholly outside an ancestor that cuts its overflow.
   */
  hidden(element: Element): boolean;
  /** Page coordinates at scroll 0. */
  box(element: Element): Box;
};

export type FactsWindow = {
  __KITVAS_NODES__?: Element[] | undefined;
  __KITVAS_TOOLS__?: PageTools | undefined;
};

export type Walked = Pick<
  PageFacts,
  'viewport' | 'scrollWidth' | 'bodyFontSize' | 'nodes' | 'truncated'
>;

export function walkNodes(options: { cap: number; root: FactsRoot }): Walked {
  const { cap } = options;
  const scope = window as unknown as FactsWindow;
  const root = options.root === 'page' ? document.body : document.getElementById('root');
  const round = (value: number): number => Math.round(value * 100) / 100;
  const px = (value: string): number => {
    const number = Number.parseFloat(value);
    return Number.isFinite(number) ? number : 0;
  };

  // Colours go through a canvas, so every notation (oklch, hsl, names) comes back as #rrggbbaa.
  const canvas = document.createElement('canvas');
  canvas.width = 1;
  canvas.height = 1;
  const context = canvas.getContext('2d', { willReadFrequently: true });
  const pair = (channel: number): string => channel.toString(16).padStart(2, '0');
  const painted = new Map<string, Colour>();
  const paint = (value: string): Colour => {
    const known = painted.get(value);
    if (known !== undefined) return known;
    let hex = '';
    // A value that is no colour would leave the fill style as it was and paint that instead.
    if (context && value !== '' && CSS.supports('color', value)) {
      context.clearRect(0, 0, 1, 1);
      context.fillStyle = value;
      context.fillRect(0, 0, 1, 1);
      const [red = 0, green = 0, blue = 0, alpha = 0] = context.getImageData(0, 0, 1, 1).data;
      hex = `#${pair(red)}${pair(green)}${pair(blue)}${pair(alpha)}`;
    }
    painted.set(value, hex);
    return hex;
  };

  type Rgb = [number, number, number];
  const WHITE: Rgb = [255, 255, 255];
  /** The element's background over its parent's ground, down from white at the top. */
  const groundOf = (element: Element | null, memo: Map<Element, Rgb>): Rgb => {
    if (element === null) return WHITE;
    const known = memo.get(element);
    if (known !== undefined) return known;
    const under = groundOf(element.parentElement, memo);
    const hex = paint(getComputedStyle(element).backgroundColor);
    const alpha = hex.length === 9 ? Number.parseInt(hex.slice(7, 9), 16) / 255 : 0;
    const mix = (at: number, below: number): number =>
      Math.round(alpha * Number.parseInt(hex.slice(at, at + 2), 16) + (1 - alpha) * below);
    const result: Rgb = alpha > 0 ? [mix(1, under[0]), mix(3, under[1]), mix(5, under[2])] : under;
    memo.set(element, result);
    return result;
  };
  const hexOf = ([red, green, blue]: Rgb): Colour => `#${pair(red)}${pair(green)}${pair(blue)}ff`;

  /** `clip` or `clip-path` leaves nothing of the box: the visually hidden pattern. */
  const clippedAway = (style: CSSStyleDeclaration, width: number, height: number): boolean => {
    const clip = style.clip;
    if ((style.position === 'absolute' || style.position === 'fixed') && clip.startsWith('rect(')) {
      const sides = clip
        .slice(5, -1)
        .split(/[\s,]+/)
        .filter((part) => part !== '');
      const side = (at: number, fallback: number): number => {
        const value = sides[at];
        return value === undefined || value === 'auto' ? fallback : px(value);
      };
      if (side(1, width) - side(3, 0) <= 0 || side(2, height) - side(0, 0) <= 0) return true;
    }
    const path = style.clipPath;
    if (path.startsWith('inset(')) {
      const values = (path.slice(6, -1).split(' round ')[0] ?? '').trim().split(/\s+/);
      const [top = '0', right = top, bottom = top, left = right] = values;
      const length = (value: string, size: number): number =>
        value.endsWith('%') ? (px(value) * size) / 100 : px(value);
      if (length(top, height) + length(bottom, height) >= height) return true;
      if (length(left, width) + length(right, width) >= width) return true;
    }
    return /^(circle|ellipse)\(\s*0(px|%)?[\s)]/.test(path);
  };
  /** The element hides what it holds: clipped to nothing, or 1 px or less with its overflow cut. */
  const hides = (element: Element): boolean => {
    const rect = element.getBoundingClientRect();
    const style = getComputedStyle(element);
    if (clippedAway(style, rect.width, rect.height)) return true;
    const small = rect.width <= 1 || rect.height <= 1;
    return small && (style.overflowX !== 'visible' || style.overflowY !== 'visible');
  };
  const inHider = (element: Element | null, memo: Map<Element, boolean>): boolean => {
    if (element === null || element === document.body || element === document.documentElement) {
      return false;
    }
    const known = memo.get(element);
    if (known !== undefined) return known;
    const result = hides(element) || inHider(element.parentElement, memo);
    memo.set(element, result);
    return result;
  };

  /** What an ancestor does with what overflows it on one axis: cuts it, scrolls it or shows it. */
  type Reach = 'cut' | 'scroll' | 'show';
  type Holder = {
    /** `gone`: no box (display: contents). `inline`: overflow does not apply to it. */
    kind: 'gone' | 'inline' | 'box';
    position: string;
    /** Holds fixed and absolute descendants whatever its position, as a transform or filter does. */
    contains: boolean;
    x: Reach;
    y: Reach;
    /** The padding box, where overflow is cut, in window coordinates: left, top, right, bottom. */
    inner: [number, number, number, number];
  };
  /** What one hidden check measures once: hiders, holders and the document's scroll width. */
  type Seen = { hiders: Map<Element, boolean>; holders: Map<Element, Holder>; width: number };
  const seenNow = (): Seen => ({
    hiders: new Map(),
    holders: new Map(),
    width: document.documentElement.scrollWidth,
  });
  const reachOf = (value: string): Reach => {
    if (value === 'hidden' || value === 'clip') return 'cut';
    return value === 'auto' || value === 'scroll' ? 'scroll' : 'show';
  };
  const NO_OVERFLOW = /^(inline|table-(row|column)(-group)?|table-(header|footer)-group)$/;
  const CONTAINING = 'transform translate rotate scale perspective filter backdrop-filter'.split(
    ' ',
  );
  const holderOf = (element: Element, seen: Seen): Holder => {
    const known = seen.holders.get(element);
    if (known !== undefined) return known;
    const style = getComputedStyle(element);
    const value = (name: string): string => style.getPropertyValue(name).trim();
    const rect = element.getBoundingClientRect();
    const html = document.documentElement;
    const rootShows = (): boolean => {
      const own = getComputedStyle(html);
      return own.overflowX === 'visible' && own.overflowY === 'visible';
    };
    // The root's overflow, and the body's while the root's is visible, is the window's: it cuts
    // nothing, and what lies past the window is judged against the document instead.
    const toWindow = element === html || (element === document.body && rootShows());
    // An inline svg cuts its drawing at its own box; overflow does not apply to other inlines.
    const inline = NO_OVERFLOW.test(style.display) && !(element instanceof SVGSVGElement);
    const holder: Holder = {
      kind: style.display === 'contents' ? 'gone' : inline ? 'inline' : 'box',
      position: style.position,
      contains:
        CONTAINING.some((name) => !['', 'none'].includes(value(name))) ||
        /\b(layout|paint|strict|content)\b/.test(value('contain')) ||
        /\b(transform|translate|rotate|scale|perspective|filter)\b/.test(value('will-change')) ||
        !['', 'normal'].includes(value('container-type')) ||
        value('content-visibility') === 'auto',
      x: toWindow ? 'show' : reachOf(style.overflowX),
      y: toWindow ? 'show' : reachOf(style.overflowY),
      inner: [
        rect.left + px(style.borderLeftWidth),
        rect.top + px(style.borderTopWidth),
        rect.right - px(style.borderRightWidth),
        rect.bottom - px(style.borderBottomWidth),
      ],
    };
    seen.holders.set(element, holder);
    return holder;
  };
  /** From and to on one axis. */
  type Span = [number, number];
  /** One axis of a box seen through a holder: cut to its inner edges, or anywhere between them. */
  const through = (reach: Reach, span: Span, inner: Span): Span => {
    if (reach === 'cut') return [Math.max(span[0], inner[0]), Math.min(span[1], inner[1])];
    return reach === 'scroll' ? inner : span;
  };
  /**
   * Out of sight for good (plan 12, C4; the spike found carousel cards at x = -3554 inside an
   * `overflow: hidden` track): the box lies wholly outside the padding box of an ancestor that
   * cuts its overflow on that axis, or wholly outside the document (right or bottom at 0 or less,
   * left at the scroll width or more). Only the ancestors the box is laid out in count: a fixed or
   * absolute box skips those below its containing block. A box in a scroller can be scrolled into
   * view, so past a scroller its place on that axis is anywhere inside the scroller.
   */
  const outside = (element: Element, rect: DOMRect, position: string, seen: Seen): boolean => {
    let across: Span = [rect.left, rect.right];
    let down: Span = [rect.top, rect.bottom];
    let placed = position;
    for (let up = element.parentElement; up !== null; up = up.parentElement) {
      const holder = holderOf(up, seen);
      if (holder.kind === 'gone') continue;
      if (placed === 'fixed' && !holder.contains) continue;
      if (placed === 'absolute' && !holder.contains && holder.position === 'static') continue;
      placed = holder.position;
      if (holder.kind === 'inline') continue;
      const [left, top, right, bottom] = holder.inner;
      across = through(holder.x, across, [left, right]);
      down = through(holder.y, down, [top, bottom]);
      if (across[1] <= across[0] || down[1] <= down[0]) return true;
    }
    // A box fixed to the window stays where it is when the page scrolls; any other is on the page.
    const fixed = placed === 'fixed';
    const offsetX = fixed ? 0 : window.scrollX;
    const offsetY = fixed ? 0 : window.scrollY;
    return across[1] + offsetX <= 0 || down[1] + offsetY <= 0 || across[0] + offsetX >= seen.width;
  };
  const hiddenOf = (
    element: Element,
    rect: DOMRect,
    style: CSSStyleDeclaration,
    seen: Seen,
  ): boolean =>
    rect.width <= 1 ||
    rect.height <= 1 ||
    clippedAway(style, rect.width, rect.height) ||
    inHider(element.parentElement, seen.hiders) ||
    outside(element, rect, style.position, seen);
  const boxOf = (rect: DOMRect): Box => [
    round(rect.left + window.scrollX),
    round(rect.top + window.scrollY),
    round(rect.width),
    round(rect.height),
  ];

  const roleOf = (element: Element): string | null => {
    const value = (element.getAttribute('role') ?? '').trim().toLowerCase().split(/\s+/)[0] ?? '';
    return value === '' ? null : value;
  };
  const LANDMARK_ROLES: Record<string, Landmark> = {
    banner: 'banner',
    navigation: 'navigation',
    main: 'main',
    contentinfo: 'contentinfo',
    complementary: 'complementary',
    form: 'form',
    search: 'search',
    region: 'region',
    dialog: 'dialog',
    alertdialog: 'dialog',
  };
  // A header or footer inside one of these is not the page's banner or content info.
  const SECTIONING =
    'article, aside, main, nav, section, [role="article"], [role="complementary"], [role="main"], [role="navigation"], [role="region"]';
  const named = (element: Element): boolean =>
    (element.getAttribute('aria-label') ?? '').trim() !== '' ||
    (element.getAttribute('aria-labelledby') ?? '').trim() !== '';
  const ownLandmark = (element: Element): Landmark | null => {
    const role = roleOf(element);
    if (role !== null) return LANDMARK_ROLES[role] ?? null;
    switch (element.tagName.toLowerCase()) {
      case 'main':
        return 'main';
      case 'nav':
        return 'navigation';
      case 'aside':
        return 'complementary';
      case 'form':
        return 'form';
      case 'search':
        return 'search';
      case 'dialog':
        return 'dialog';
      case 'section':
        return named(element) ? 'region' : null;
      case 'header':
        return element.parentElement?.closest(SECTIONING) ? null : 'banner';
      case 'footer':
        return element.parentElement?.closest(SECTIONING) ? null : 'contentinfo';
      default:
        return null;
    }
  };
  const landmarkOf = (
    element: Element | null,
    memo: Map<Element, Landmark | null>,
  ): Landmark | null => {
    if (element === null) return null;
    const known = memo.get(element);
    if (known !== undefined) return known;
    const result = ownLandmark(element) ?? landmarkOf(element.parentElement, memo);
    memo.set(element, result);
    return result;
  };
  const headingOf = (element: Element, tag: string, role: string | null): number => {
    const level = /^h([1-6])$/.exec(tag)?.[1];
    if (level !== undefined) return Number(level);
    if (role !== 'heading') return 0;
    const aria = Number.parseInt(element.getAttribute('aria-level') ?? '', 10);
    return aria >= 1 && aria <= 6 ? aria : 2;
  };
  const liveOf = (element: Element, tag: string, role: string | null): string | null => {
    if (role === 'status' || role === 'alert' || role === 'progressbar') return role;
    if (role === null && tag === 'progress') return 'progressbar';
    if (role === null && tag === 'output') return 'status';
    const live = (element.getAttribute('aria-live') ?? '').trim().toLowerCase();
    return live === '' || live === 'off' ? null : live;
  };

  const firstFamily = (value: string): string =>
    (value.split(',')[0] ?? '')
      .trim()
      .replace(/^["']|["']$/g, '')
      .toLowerCase();
  const SIDES = ['top', 'right', 'bottom', 'left'];
  const styleOf = (
    element: Element,
    style: CSSStyleDeclaration,
    width: number,
    grounds: Map<Element, Rgb>,
  ): NodeStyle => {
    const fontSize = px(style.fontSize);
    const border: [number, number, number, number] = [0, 0, 0, 0];
    let borderColor = '';
    let widest = 0;
    SIDES.forEach((side, at) => {
      const kind = style.getPropertyValue(`border-${side}-style`);
      const size = px(style.getPropertyValue(`border-${side}-width`));
      const colour = paint(style.getPropertyValue(`border-${side}-color`));
      if (kind === 'none' || kind === 'hidden' || size <= 0) return;
      if (colour === '' || colour.slice(7) === '00') return;
      border[at] = round(size);
      if (size > widest) {
        widest = size;
        borderColor = colour;
      }
    });
    const corner = style.borderTopLeftRadius.trim().split(/\s+/)[0] ?? '';
    const radius = corner.endsWith('%') ? (px(corner) * width) / 100 : px(corner);
    const clamp = style.getPropertyValue('-webkit-line-clamp').trim();
    const svg = element instanceof SVGElement;
    /** SVG paint: currentColor resolved, a url() paint's fallback colour, '' for none. */
    const svgPaint = (value: string): Colour => {
      let paintValue = value.trim();
      if (!svg || paintValue === '' || paintValue === 'none') return '';
      if (paintValue.startsWith('url('))
        paintValue = paintValue.slice(paintValue.indexOf(')') + 1).trim();
      if (paintValue === '' || paintValue === 'none' || paintValue.startsWith('context-'))
        return '';
      if (paintValue.toLowerCase() === 'currentcolor') paintValue = style.color;
      return paint(paintValue);
    };
    return {
      fontSize: round(fontSize),
      fontWeight: px(style.fontWeight) || 400,
      lineHeight: round(style.lineHeight === 'normal' ? fontSize * 1.2 : px(style.lineHeight)),
      fontFamily: firstFamily(style.fontFamily),
      textAlign: style.textAlign,
      color: paint(style.color),
      background: paint(style.backgroundColor),
      ground: hexOf(groundOf(element, grounds)),
      backgroundImage: style.backgroundImage !== 'none' && style.backgroundImage !== '',
      border,
      borderColor,
      radius: round(radius),
      shadow: style.boxShadow === 'none' ? '' : style.boxShadow,
      position: style.position,
      display: style.display,
      overflowX: style.overflowX,
      overflowY: style.overflowY,
      textOverflow: style.textOverflow,
      lineClamp: clamp === '' || clamp === 'none' ? 0 : Number.parseInt(clamp, 10) || 0,
      objectFit: style.objectFit,
      hyphens: style.hyphens,
      fill: svgPaint(style.fill),
      stroke: svgPaint(style.stroke),
    };
  };

  const elements: Element[] = [];
  const indexes = new Map<Element, number>();
  const nodes: FactNode[] = [];
  const grounds = new Map<Element, Rgb>();
  const seen = seenNow();
  const landmarks = new Map<Element, Landmark | null>();
  const describe = (element: Element, rect: DOMRect, style: CSSStyleDeclaration): FactNode => {
    let parent = -1;
    for (let up = element.parentElement; up !== null && up !== root; up = up.parentElement) {
      const at = indexes.get(up);
      if (at !== undefined) {
        parent = at;
        break;
      }
    }
    const tag = element.tagName.toLowerCase();
    const role = roleOf(element);
    const cut = (value: string): boolean => value === 'hidden' || value === 'clip';
    return {
      parent,
      ks: element.closest('[data-ks]')?.getAttribute('data-ks') ?? null,
      ownKs: element.hasAttribute('data-ks'),
      tag,
      domId: element.getAttribute('id'),
      role,
      heading: headingOf(element, tag, role),
      landmark: landmarkOf(element, landmarks),
      box: boxOf(rect),
      hidden: hiddenOf(element, rect, style, seen),
      style: styleOf(element, style, rect.width, grounds),
      // Filled in by `readTexts` (`playwright-facts-text.ts`).
      text: null,
      scroll:
        cut(style.overflowX) || cut(style.overflowY)
          ? [element.scrollWidth, element.clientWidth, element.scrollHeight, element.clientHeight]
          : null,
      field: null,
      action: null,
      image: null,
      busy: element.getAttribute('aria-busy') === 'true',
      live: liveOf(element, tag, role),
    };
  };

  let truncated = false;
  for (const element of root === null ? [] : Array.from(root.querySelectorAll('*'))) {
    const rect = element.getBoundingClientRect();
    if (rect.width <= 0 || rect.height <= 0) continue;
    const style = getComputedStyle(element);
    if (style.visibility === 'hidden' || style.visibility === 'collapse') continue;
    if (nodes.length >= cap) {
      truncated = true;
      break;
    }
    let node: FactNode;
    try {
      node = describe(element, rect, style);
    } catch {
      // An element that cannot be read is left out; the indexes stay those of the list.
      continue;
    }
    indexes.set(element, nodes.length);
    elements.push(element);
    nodes.push(node);
  }

  scope.__KITVAS_NODES__ = elements;
  scope.__KITVAS_TOOLS__ = {
    index: (element) => indexes.get(element) ?? -1,
    paint,
    ground: (element) => hexOf(groundOf(element, new Map())),
    // Measured afresh: a pass may have resized or scrolled the page since the walk.
    hidden: (element) =>
      hiddenOf(element, element.getBoundingClientRect(), getComputedStyle(element), seenNow()),
    box: (element) => boxOf(element.getBoundingClientRect()),
  };
  return {
    viewport: [window.innerWidth, window.innerHeight],
    scrollWidth: document.documentElement.scrollWidth,
    bodyFontSize: round(px(getComputedStyle(document.body).fontSize)),
    nodes,
    truncated,
  };
}
