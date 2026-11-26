// Runs in the page: the layer walk of a built draft (plan 21, task 1). The elements under #root are
// read in document order. One is kept as a layer when it has an element id of its own, paints
// something (a background, a border, a shadow, an image), is a block of inline text, an `img`, an
// `svg` or a field, or holds more than one layer. A wrapper that paints nothing around one layer of
// its own box is skipped, and that layer takes its place. Hidden elements (the facts walk's own
// test, but for a painted rule 1 px thick, which that test hides) and boxes of zero are no layers,
// though what they hold is still read.
//
// Figma's text layers hold nothing and paint no box, so a block of text that paints or is padded is
// a frame around a text layer, inline text beside other boxes is a text layer of its own, and so is
// what a field shows. Layers are listed parents first; at `cap` the walk stops and says
// `truncated`.
//
// Colours inside the values handed over are painted as `#rrggbbaa`; `layer-parse.ts` reads the rest.
// Everything here is serialized into the page: it uses no name from outside the function, only the
// tools the facts walk (`window.__KITVAS_TOOLS__`) and `installLayerTools` left on `window`.

import type { Box } from '../../domain/page/facts.ts';
import type { RawLayer, RawLayers } from '../../domain/page/layer-parse.ts';
import type { LayersWindow, TextRead } from './playwright-layers-text.ts';

export type LayerWalkOptions = {
  /** The most layers, LAYERS_NODE_CAP. */
  cap: number;
  /** The most elements read before the layers are chosen. */
  visits: number;
  /** LAYER_TEXT_MAX. */
  textMax: number;
  /** LAYER_SVG_MAX. */
  svgMax: number;
};

export function readLayers(options: LayerWalkOptions): RawLayers {
  const scope = window as unknown as LayersWindow;
  const tools = scope.__KITVAS_TOOLS__;
  const layer = scope.__KITVAS_LAYER_TOOLS__;
  if (tools === undefined || layer === undefined) throw new Error('the page tools are missing');
  const root = document.getElementById('root');
  const round = (value: number): number => Math.round(value * 100) / 100;
  const px = (value: string): number => {
    const number = Number.parseFloat(value);
    return Number.isFinite(number) ? number : 0;
  };
  const near = (one: number, other: number): boolean => Math.abs(one - other) <= 0.5;
  const SIDES = ['top', 'right', 'bottom', 'left'];
  const OUT_OF_FLOW = new Set(['absolute', 'fixed', 'sticky']);

  const borderOf = (style: CSSStyleDeclaration): RawLayer['border'] => {
    const widths: [number, number, number, number] = [0, 0, 0, 0];
    let colour = '';
    let widest = 0;
    SIDES.forEach((side, at) => {
      const kind = style.getPropertyValue(`border-${side}-style`);
      const size = px(style.getPropertyValue(`border-${side}-width`));
      if (kind === 'none' || kind === 'hidden' || size <= 0) return;
      const hex = tools.paint(style.getPropertyValue(`border-${side}-color`));
      if (hex === '' || hex.slice(7, 9) === '00') return;
      widths[at] = round(size);
      if (size > widest) {
        widest = size;
        colour = hex;
      }
    });
    return widest > 0 ? { widths, colour } : null;
  };
  const shows = (value: string): boolean => {
    const hex = tools.paint(value);
    return hex !== '' && hex.slice(7, 9) !== '00';
  };
  const paints = (style: CSSStyleDeclaration): boolean =>
    shows(style.backgroundColor) ||
    !['', 'none'].includes(style.backgroundImage) ||
    !['', 'none'].includes(style.boxShadow) ||
    borderOf(style) !== null;
  /** Padding or a border keeps text off the box's edges. */
  const padded = (style: CSSStyleDeclaration): boolean =>
    SIDES.some(
      (side) =>
        px(style.getPropertyValue(`padding-${side}`)) > 0 ||
        px(style.getPropertyValue(`border-${side}-width`)) > 0,
    );
  /** A box of some size, shown, and not hidden by the facts walk's test but for a painted rule. */
  const visible = (element: Element, rect: DOMRect, style: CSSStyleDeclaration): boolean => {
    if (rect.width <= 0 || rect.height <= 0) return false;
    if (style.visibility === 'hidden' || style.visibility === 'collapse') return false;
    if (!tools.hidden(element)) return true;
    const thin = rect.width <= 1 !== rect.height <= 1;
    const parent = element.parentElement;
    return thin && paints(style) && parent !== null && !tools.hidden(parent);
  };
  /** False for an image that failed to load, or has no address: a frame of its size is sent. */
  const loaded = (image: HTMLImageElement): boolean =>
    !(image.complete && image.naturalWidth === 0) && (image.currentSrc || image.src) !== '';
  const sameBox = (one: Element, other: Element): boolean => {
    const box = tools.box(other);
    return tools.box(one).every((value, at) => near(value, box[at] ?? Number.NaN));
  };

  /** `group`: a run of inline text of `element`; `value`: what the field `element` shows. */
  type Role = 'frame' | 'text' | 'image' | 'svg' | 'group' | 'value';
  type Item = { element: Element; role: Role; pieces: Node[]; children: Item[] };
  const item = (element: Element, role: Role, pieces: Node[] = [], held: Item[] = []): Item => ({
    element,
    role,
    pieces,
    children: held,
  });
  const SKIP = new Set(['script', 'style', 'template', 'noscript']);
  const FIELDS = new Set(['input', 'select', 'textarea']);
  // Drawn by the browser: a box of its own paints with nothing inside.
  const OPAQUE = new Set(['video', 'audio', 'canvas', 'iframe', 'object', 'embed', 'math']);
  let seen = 0;
  let truncated = false;

  /** The layers an element gives its nearest kept ancestor: itself, or what it holds. */
  const visit = (element: Element): Item[] => {
    if (seen >= options.visits) {
      truncated = true;
      return [];
    }
    seen += 1;
    const tag = element.tagName.toLowerCase();
    if (SKIP.has(tag)) return [];
    const style = getComputedStyle(element);
    if (style.display === 'none') return [];
    const shown = visible(element, element.getBoundingClientRect(), style);
    if (element instanceof SVGSVGElement) return shown ? [item(element, 'svg')] : [];
    if (element instanceof SVGElement) return [];
    if (element instanceof HTMLImageElement) {
      return shown ? [item(element, loaded(element) ? 'image' : 'frame')] : [];
    }
    if (FIELDS.has(tag)) {
      return shown ? [item(element, 'frame', [], [item(element, 'value')])] : [];
    }
    if (OPAQUE.has(tag)) return shown ? [item(element, 'frame')] : [];
    const children: Item[] = [];
    for (const part of layer.content(element)) {
      if ('element' in part) children.push(...visit(part.element));
      else if (shown) children.push(item(element, 'group', part.pieces));
    }
    if (!shown) return children;
    const [only] = children;
    const painted = paints(style);
    // A block of inline text alone: a text layer, or a frame around one when it paints or is padded.
    if (children.length === 1 && only?.role === 'group') {
      if (painted || padded(style)) return [item(element, 'frame', [], children)];
      return [item(element, 'text', only.pieces)];
    }
    if (element.hasAttribute('data-ks') || painted || children.length > 1) {
      return [item(element, 'frame', [], children)];
    }
    if (only === undefined) return [];
    return sameBox(element, only.element) ? children : [item(element, 'frame', [], children)];
  };

  const contentOf = (element: Element, style: CSSStyleDeclaration): Box => {
    const [x, y, width, height] = tools.box(element);
    const left = px(style.borderLeftWidth) + px(style.paddingLeft);
    const top = px(style.borderTopWidth) + px(style.paddingTop);
    const right = px(style.borderRightWidth) + px(style.paddingRight);
    const bottom = px(style.borderBottomWidth) + px(style.paddingBottom);
    return [x + left, y + top, width - left - right, height - top - bottom];
  };
  /**
   * Stretches along its parent's flex line (it grows, or fills the line) and across it. Only a
   * child in the flow of a flex line can: Figma's `FILL` is for children of an auto layout.
   */
  const fillOf = (
    box: Box,
    element: Element | null,
    holder: Element | null,
    out: boolean,
  ): [boolean, boolean] => {
    if (holder === null || out) return [false, false];
    const style = getComputedStyle(holder);
    const flex = style.display === 'flex' || style.display === 'inline-flex';
    if (!flex || style.flexDirection.endsWith('reverse')) return [false, false];
    const row = !style.flexDirection.startsWith('column');
    const [, , width, height] = contentOf(holder, style);
    // The flex item is the element, or the wrapper around it that was skipped.
    let flexItem = element;
    while (flexItem?.parentElement && flexItem.parentElement !== holder) {
      flexItem = flexItem.parentElement;
    }
    const grows = flexItem !== null && px(getComputedStyle(flexItem).flexGrow) > 0;
    const along = row ? near(box[2], width) : near(box[3], height);
    const across = row ? near(box[3], height) : near(box[2], width);
    return [grows || along, across];
  };
  /** One line where it is painted; more lines across the block's content box. */
  const textBox = (read: TextRead, block: Element): Box => {
    if (read.lines <= 1) return read.box;
    const [x, , width] = contentOf(block, getComputedStyle(block));
    return [round(x), read.box[1], round(width), read.box[3]];
  };
  const radiusOf = (style: CSSStyleDeclaration, box: Box): RawLayer['radius'] => {
    const [, , width, height] = box;
    const most = Math.min(width, height) / 2;
    const corner = (name: string): number => {
      const value = style.getPropertyValue(`border-${name}-radius`).trim().split(/\s+/)[0] ?? '';
      const size = value.endsWith('%') ? (px(value) * width) / 100 : px(value);
      return round(Math.min(size, most));
    };
    return [corner('top-left'), corner('top-right'), corner('bottom-right'), corner('bottom-left')];
  };

  // The svg paint properties and their initial values.
  const INITIAL: Record<string, string> = {
    fill: '#000000',
    'fill-opacity': '1',
    'fill-rule': 'nonzero',
    stroke: 'none',
    'stroke-width': '1',
    'stroke-opacity': '1',
    'stroke-linecap': 'butt',
    'stroke-linejoin': 'miter',
    'stroke-dasharray': 'none',
    opacity: '1',
    'stop-color': '#000000',
    'stop-opacity': '1',
  };
  const PAINTED = Object.keys(INITIAL);
  // Not inherited: held against the initial value, not against the parent's.
  const OWN = new Set(['opacity', 'stop-color', 'stop-opacity']);
  const ALPHAS: [string, string][] = [
    ['fill', 'fill-opacity'],
    ['stroke', 'stroke-opacity'],
    ['stop-color', 'stop-opacity'],
  ];
  const DROPPED = /^(class|style|role|tabindex|focusable|data-.+|aria-.+)$/;
  const opacityOf = (value: string): number => {
    const number = Number.parseFloat(value);
    return Number.isFinite(number) ? number : 1;
  };
  /** An svg paint as an attribute: `none`, `url(#id)`, or `#rrggbb` and its alpha apart. */
  const svgPaint = (value: string, current: string): [string, number] => {
    const text = value.trim();
    if (text === '' || text === 'none') return ['none', 1];
    if (text.startsWith('url(')) {
      const id = /#[^"')\s]+/.exec(text)?.[0];
      return [id === undefined ? 'none' : `url(${id})`, 1];
    }
    const hex = tools.paint(text.toLowerCase() === 'currentcolor' ? current : text);
    if (hex === '') return ['none', 1];
    return [hex.slice(0, 7), Number.parseInt(hex.slice(7, 9), 16) / 255];
  };
  /**
   * The svg as markup that stands on its own: each element's paint resolved from the page's style
   * (`currentColor` and custom properties included) and written as its own attributes where it
   * differs from what it inherits; classes, styles, element ids and ARIA dropped. Null when it is
   * longer than `svgMax`. The svg's own opacity is the layer's, so it is not written.
   */
  const svgOf = (svg: Element, box: Box): string | null => {
    const copy = svg.cloneNode(true);
    if (!(copy instanceof Element)) return null;
    const originals = [svg, ...Array.from(svg.querySelectorAll('*'))];
    const copies = [copy, ...Array.from(copy.querySelectorAll('*'))];
    const resolved = new Map<Element, Record<string, string>>();
    originals.forEach((original, at) => {
      const target = copies[at];
      if (target === undefined) return;
      for (const { name } of Array.from(target.attributes)) {
        if (DROPPED.test(name) || PAINTED.includes(name)) target.removeAttribute(name);
      }
      const style = getComputedStyle(original);
      const values: Record<string, string> = {};
      for (const name of PAINTED) values[name] = style.getPropertyValue(name).trim();
      for (const [paint, alpha] of ALPHAS) {
        const [colour, opacity] = svgPaint(values[paint] ?? '', style.color);
        values[paint] = colour;
        if (opacity < 1) values[alpha] = String(round(opacityOf(values[alpha] ?? '') * opacity));
      }
      values['stroke-width'] = String(round(px(values['stroke-width'] ?? '')));
      values['stroke-dasharray'] = (values['stroke-dasharray'] ?? '').replace(/px/g, '');
      const parent = original.parentElement;
      const above = original === svg || parent === null ? undefined : resolved.get(parent);
      for (const name of PAINTED) {
        if (original === svg && name === 'opacity') continue;
        const value = values[name] ?? '';
        const inherited = above === undefined || OWN.has(name) ? INITIAL[name] : above[name];
        if (value !== '' && value !== inherited) target.setAttribute(name, value);
      }
      resolved.set(original, values);
      if (style.display === 'none') target.setAttribute('display', 'none');
    });
    copy.setAttribute('width', String(box[2]));
    copy.setAttribute('height', String(box[3]));
    let markup = new XMLSerializer().serializeToString(copy);
    if (!/^<svg[^>]*\sxmlns=/.test(markup)) {
      markup = markup.replace(/^<svg/, '<svg xmlns="http://www.w3.org/2000/svg"');
    }
    return markup.length > options.svgMax ? null : markup;
  };

  const blank = (parent: number, element: Element, ownKs: boolean, box: Box): RawLayer => ({
    parent,
    ks: element.closest('[data-ks]')?.getAttribute('data-ks') ?? null,
    ownKs,
    tag: element.tagName.toLowerCase(),
    box,
    kind: 'frame',
    position: 'static',
    fill: [false, false],
    flow: null,
    background: '',
    image: '',
    fit: '',
    border: null,
    radius: [0, 0, 0, 0],
    shadow: '',
    opacity: 1,
    clips: false,
    text: null,
    svg: null,
  });
  const FLOW = [
    'display',
    'flex-direction',
    'flex-wrap',
    'row-gap',
    'column-gap',
    'padding-top',
    'padding-right',
    'padding-bottom',
    'padding-left',
    'justify-content',
    'align-items',
  ];

  /** The layer of one item; null when it has no text to show after all. */
  const describe = (entry: Item, parent: number, holder: Element | null): RawLayer | null => {
    const { element, role } = entry;
    if (role === 'group' || role === 'value') {
      const read =
        role === 'group'
          ? layer.read(element, entry.pieces, options.textMax)
          : layer.control(element, options.textMax);
      if (read === null) return null;
      const box = textBox(read, element);
      const fill = fillOf(box, null, holder, false);
      return { ...blank(parent, element, false, box), kind: 'text', fill, text: read.text };
    }
    const style = getComputedStyle(element);
    const box = tools.box(element);
    const placed: RawLayer = {
      ...blank(parent, element, element.hasAttribute('data-ks'), box),
      position: style.position,
      fill: fillOf(box, element, holder, OUT_OF_FLOW.has(style.position)),
      opacity: opacityOf(style.opacity),
    };
    if (role === 'text') {
      const read = layer.read(element, entry.pieces, options.textMax);
      return read === null ? null : { ...placed, kind: 'text', text: read.text };
    }
    if (role === 'svg') return { ...placed, kind: 'svg', svg: svgOf(element, box) };
    const painted: RawLayer = {
      ...placed,
      background: tools.paint(style.backgroundColor),
      border: borderOf(style),
      radius: radiusOf(style, box),
      shadow: layer.paintAll(style.boxShadow, style.color),
      clips: style.overflowX !== 'visible' || style.overflowY !== 'visible',
    };
    if (role === 'image' && element instanceof HTMLImageElement) {
      const src = (element.currentSrc || element.src).replace(/["\\]/g, '\\$&');
      const image = `url("${src}")`;
      return { ...painted, kind: 'image', image, fit: style.objectFit, clips: true };
    }
    return {
      ...painted,
      flow: Object.fromEntries(FLOW.map((name) => [name, style.getPropertyValue(name)])),
      image: layer.paintAll(style.backgroundImage, style.color),
      fit: style.backgroundSize,
    };
  };

  const items: Item[] = [];
  if (root !== null) {
    for (const part of layer.content(root)) {
      if ('element' in part) items.push(...visit(part.element));
      else items.push(item(root, 'group', part.pieces));
    }
  }
  const nodes: RawLayer[] = [];
  const emit = (entry: Item, parent: number, holder: Element | null): void => {
    if (nodes.length >= options.cap) {
      truncated = true;
      return;
    }
    let node: RawLayer | null = null;
    try {
      node = describe(entry, parent, holder);
    } catch {
      // An element that cannot be read is left out, with what it holds.
      node = null;
    }
    if (node === null) return;
    const index = nodes.length;
    nodes.push(node);
    for (const child of entry.children) emit(child, index, entry.element);
  };
  for (const entry of items) emit(entry, -1, null);

  const html = document.documentElement;
  return {
    viewport: [window.innerWidth, window.innerHeight],
    page: [html.scrollWidth, html.scrollHeight],
    background: root === null ? '#ffffffff' : tools.ground(root),
    nodes,
    truncated,
  };
}
