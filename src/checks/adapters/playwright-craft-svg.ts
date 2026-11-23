// The in-page svg reader of the `craft` pass (`playwright-craft.ts`): every outermost svg of a
// sketch block (`[data-craft-sketch]`) or a kit icon (`[data-kit-icon]`), measured as the page
// draws it. The svgs read are left in `window.__KITVAS_CRAFT__` so the pass can clone them.
//
// `readSvgs` runs in the page: it uses nothing from this module, and gets its constants as input.

/** One svg as the page measured it. */
export type SvgRead = {
  /** Index in the list the reader leaves in the page (`window.__KITVAS_CRAFT__`). */
  at: number;
  /** The sketch letter; null for a kit icon. */
  sketch: string | null;
  /** The kit icon's name (`data-kit-icon`); null for a sketch. */
  icon: string | null;
  /** Index of the sketch's block in the facts walk's list; null when not listed or a kit icon. */
  node: number | null;
  /** Inside `[data-craft-tone="mono"]`, the svg itself included. */
  mono: boolean;
  /** Four numbers with single spaces; `''` when the svg has none. */
  viewBox: string;
  /** The commonest stroke width of its stroked shapes, in viewBox units; null when none. */
  stroke: number | null;
  /** Some shape paints a fill that is not none. */
  filled: boolean;
  /** The commonest line cap of its stroked shapes, else the svg's own. */
  caps: string;
  /** Colours that stay the same whatever colour the svg is given, `#rrggbbaa`. */
  fixedColours: string[];
  /** Every colour it paints, `#rrggbbaa`, with its opacities folded into the alpha. */
  painted: string[];
  /** The opaque colour behind it, `#rrggbbff`. */
  ground: string;
  /** Its rendered size in CSS px, the larger side. */
  size: number;
};

export type CraftWindow = {
  __KITVAS_NODES__?: Element[] | undefined;
  __KITVAS_CRAFT__?: SVGSVGElement[] | undefined;
};

export type ReadInput = {
  /** Marks the svg whose colour is probed, so nothing in it transitions meanwhile. */
  mark: string;
  /** Set as the svg's colour in turn: a colour that stays the same under both is fixed. */
  probes: [string, string];
  /** Svgs read at most. */
  cap: number;
};

/** What `craftPass` hands `readSvgs`. */
export const READ_INPUT: ReadInput = {
  mark: 'data-kitvas-craft-probe',
  probes: ['rgb(1, 2, 3)', 'rgb(4, 5, 6)'],
  cap: 200,
};

/** What a clone takes over from the svg on the board, so the board's selectors need not match. */
export const PAINT_PROPS: readonly string[] = [
  'color',
  'fill',
  'fill-opacity',
  'fill-rule',
  'stroke',
  'stroke-width',
  'stroke-linecap',
  'stroke-linejoin',
  'stroke-miterlimit',
  'stroke-dasharray',
  'stroke-dashoffset',
  'stroke-opacity',
  'opacity',
  'visibility',
  'display',
  'vector-effect',
  'paint-order',
  'stop-color',
  'stop-opacity',
  'shape-rendering',
  'font-family',
  'font-size',
  'font-style',
  'font-weight',
  'letter-spacing',
];

/**
 * Runs in the page. For each svg: the stroke width of each painted stroke turned into viewBox
 * units through the screen matrices (the shape's against the svg's own, which holds the viewBox),
 * fills, caps, the colours it paints and the ground behind it. A colour is fixed when it stays the
 * same with the svg's `color` set to each probe; the svg's style attribute is put back after.
 */
export function readSvgs(input: ReadInput): SvgRead[] {
  const scope = window as unknown as CraftWindow;
  const listed = scope.__KITVAS_NODES__ ?? [];
  const canvas = document.createElement('canvas');
  canvas.width = 1;
  canvas.height = 1;
  const context = canvas.getContext('2d', { willReadFrequently: true });
  const pair = (value: number): string => Math.round(value).toString(16).padStart(2, '0');
  /** A colour as the browser paints it, `#rrggbbaa`, its alpha times `alpha`; null when unseen. */
  const paint = (value: string, alpha: number): string | null => {
    if (context === null || value === '' || value === 'none') return null;
    if (!CSS.supports('color', value)) return null;
    context.clearRect(0, 0, 1, 1);
    context.fillStyle = value;
    context.fillRect(0, 0, 1, 1);
    const [red = 0, green = 0, blue = 0, own = 0] = context.getImageData(0, 0, 1, 1).data;
    const shown = Math.round(own * alpha);
    return shown === 0 ? null : `#${pair(red)}${pair(green)}${pair(blue)}${pair(shown)}`;
  };
  const scaleOf = (matrix: DOMMatrix | null): number =>
    matrix === null ? 0 : Math.sqrt(Math.abs(matrix.a * matrix.d - matrix.b * matrix.c));
  const nameOf = (element: Element): string => element.localName.toLowerCase();
  const shapeNames = new Set([
    'path',
    'circle',
    'ellipse',
    'line',
    'polyline',
    'polygon',
    'rect',
    'text',
    'use',
  ]);
  const unpainted = new Set(['defs', 'clippath', 'mask', 'symbol', 'marker', 'pattern']);
  const gradients = new Set(['lineargradient', 'radialgradient']);
  /** The stops a gradient draws with, following `href` to the gradient that holds them. */
  const stopsOf = (id: string): Element[] => {
    let server = document.getElementById(id);
    for (let hops = 0; server !== null && hops < 4; hops += 1) {
      if (!gradients.has(nameOf(server))) return [];
      const stops = Array.from(server.children).filter((child) => nameOf(child) === 'stop');
      if (stops.length > 0) return stops;
      const href =
        server.getAttribute('href') ??
        server.getAttributeNS('http://www.w3.org/1999/xlink', 'href') ??
        '';
      server = href.startsWith('#') ? document.getElementById(href.slice(1)) : null;
    }
    return [];
  };
  type Paint = { value: string; alpha: number };
  type Part = { element: Element; property: 'fill' | 'stroke'; opacity: number };
  /** What a fill or stroke paints with now: its colour, or the stops of its gradient. */
  const paintsOf = ({ element, property, opacity }: Part): Paint[] => {
    const style = getComputedStyle(element);
    const own = Number.parseFloat(style.getPropertyValue(`${property}-opacity`));
    const alpha = opacity * (Number.isNaN(own) ? 1 : own);
    const value = style.getPropertyValue(property).trim();
    const server = /url\(\s*["']?#([^"')\s]+)/.exec(value);
    if (server === null) return value === 'none' ? [] : [{ value, alpha }];
    return stopsOf(server[1] ?? '').map((stop) => {
      const stopStyle = getComputedStyle(stop);
      const stopAlpha = Number.parseFloat(stopStyle.getPropertyValue('stop-opacity'));
      return {
        value: stopStyle.getPropertyValue('stop-color').trim(),
        alpha: alpha * (Number.isNaN(stopAlpha) ? 1 : stopAlpha),
      };
    });
  };
  const shows = (part: Part): boolean =>
    paintsOf(part).some((one) => paint(one.value, one.alpha) !== null);
  /** Drawn shapes: not in defs, masks or symbols, visible and with a box. */
  const shapesOf = (svg: SVGSVGElement): SVGGraphicsElement[] =>
    Array.from(svg.querySelectorAll('*')).filter((element): element is SVGGraphicsElement => {
      if (!(element instanceof SVGGraphicsElement) || !shapeNames.has(nameOf(element))) {
        return false;
      }
      for (
        let up: Element | null = element.parentElement;
        up !== null && up !== svg;
        up = up.parentElement
      ) {
        if (unpainted.has(nameOf(up))) return false;
      }
      if (getComputedStyle(element).visibility !== 'visible') return false;
      try {
        const box = element.getBBox();
        return box.width > 0 || box.height > 0;
      } catch {
        return false;
      }
    });
  /** The product of the opacities from the shape up to the svg. */
  const opacityOf = (element: Element, svg: Element): number => {
    let value = 1;
    for (let at: Element | null = element; at !== null; at = at.parentElement) {
      const own = Number.parseFloat(getComputedStyle(at).opacity);
      value *= Number.isNaN(own) ? 1 : own;
      if (at === svg) break;
    }
    return value;
  };
  /** The colour behind an element: its own and its ancestors' backgrounds laid on white. */
  const groundOf = (element: Element): string => {
    const layers: number[][] = [];
    for (let at: Element | null = element; at !== null; at = at.parentElement) {
      const colour = paint(getComputedStyle(at).backgroundColor, 1);
      if (colour === null) continue;
      const channel = (from: number): number => Number.parseInt(colour.slice(from, from + 2), 16);
      layers.push([channel(1), channel(3), channel(5), channel(7) / 255]);
      if (channel(7) === 255) break;
    }
    const mixed = [255, 255, 255];
    for (const [red = 0, green = 0, blue = 0, alpha = 1] of layers.reverse()) {
      mixed[0] = red * alpha + (mixed[0] ?? 0) * (1 - alpha);
      mixed[1] = green * alpha + (mixed[1] ?? 0) * (1 - alpha);
      mixed[2] = blue * alpha + (mixed[2] ?? 0) * (1 - alpha);
    }
    return `#${mixed.map((value) => pair(value)).join('')}ff`;
  };
  /** The value most entries have; ties go to the larger number, or to the first string. */
  const commonest = <T extends number | string>(values: T[]): T | null => {
    const counts = new Map<T, number>();
    for (const value of values) counts.set(value, (counts.get(value) ?? 0) + 1);
    let best: T | null = null;
    let most = 0;
    for (const [value, count] of counts) {
      const larger = typeof value === 'number' && typeof best === 'number' && value > best;
      if (count > most || (count === most && larger)) {
        best = value;
        most = count;
      }
    }
    return best;
  };
  const rounded = (value: number): number => Math.round(value * 1000) / 1000;

  const found: SVGSVGElement[] = [];
  const reads: SvgRead[] = [];
  const quiet = document.createElement('style');
  quiet.textContent = `[${input.mark}], [${input.mark}] * { transition: none !important; }`;
  document.head.append(quiet);
  try {
    for (const svg of Array.from(document.querySelectorAll('svg'))) {
      if (reads.length >= input.cap) break;
      // A nested svg is part of the drawing around it.
      if (svg.parentElement?.closest('svg')) continue;
      const kit = svg.closest('[data-kit-icon]');
      const block = svg.closest('[data-craft-sketch]');
      if (kit === null && block === null) continue;
      const rect = svg.getBoundingClientRect();
      // Screen px per viewBox unit: the svg's screen matrix holds its viewBox.
      const unit = scaleOf(svg.getScreenCTM());
      if (rect.width <= 0 || rect.height <= 0 || unit <= 0) continue;
      if (getComputedStyle(svg).visibility !== 'visible') continue;
      const view = svg.viewBox.baseVal;
      const hasView = svg.hasAttribute('viewBox') && view.width > 0 && view.height > 0;
      const viewWidth = hasView ? view.width : rect.width / unit;
      const viewHeight = hasView ? view.height : rect.height / unit;

      const parts: Part[] = [];
      const widths: number[] = [];
      const caps: string[] = [];
      let filled = false;
      for (const shape of shapesOf(svg)) {
        const opacity = opacityOf(shape, svg);
        if (opacity <= 0) continue;
        const shapeStyle = getComputedStyle(shape);
        const fill: Part = { element: shape, property: 'fill', opacity };
        // A line has no inside to fill.
        if (nameOf(shape) !== 'line' && shows(fill)) {
          parts.push(fill);
          filled = true;
        }
        const raw = shapeStyle.strokeWidth.trim();
        const number = Number.parseFloat(raw);
        if (Number.isNaN(number) || number <= 0) continue;
        const stroke: Part = { element: shape, property: 'stroke', opacity };
        if (!shows(stroke)) continue;
        parts.push(stroke);
        // A percentage is of the viewport's diagonal over √2, in the shape's own units.
        const width = raw.endsWith('%')
          ? (number / 100) * Math.sqrt((viewWidth ** 2 + viewHeight ** 2) / 2)
          : number;
        // Screen px per unit of the shape, against screen px per viewBox unit.
        const own = scaleOf(shape.getScreenCTM());
        let inView = width;
        if (shapeStyle.getPropertyValue('vector-effect').trim() === 'non-scaling-stroke') {
          inView = width / unit;
        } else if (own > 0) {
          inView = (width * own) / unit;
        }
        widths.push(rounded(inView));
        caps.push(shapeStyle.strokeLinecap);
      }

      // Colours that do not follow the svg's colour are fixed.
      const before = parts.flatMap(paintsOf);
      const kept = svg.getAttribute('style');
      svg.setAttribute(input.mark, '');
      const under = (colour: string): string[] => {
        svg.style.setProperty('color', colour, 'important');
        return parts.flatMap(paintsOf).map((one) => one.value);
      };
      let first: string[] = [];
      let second: string[] = [];
      try {
        first = under(input.probes[0]);
        second = under(input.probes[1]);
      } finally {
        // Written first: Chrome keeps a style changed through the CSSOM unless the attribute is set.
        svg.setAttribute('style', kept ?? '');
        if (kept === null) svg.removeAttribute('style');
        svg.removeAttribute(input.mark);
      }
      const fixed = new Set<string>();
      before.forEach((one, index) => {
        if (first[index] !== second[index]) return;
        const colour = paint(one.value, 1);
        if (colour !== null) fixed.add(colour);
      });

      const node = block === null || kit !== null ? -1 : listed.indexOf(block);
      reads.push({
        at: found.length,
        sketch: kit === null ? (block?.getAttribute('data-craft-sketch') ?? '') : null,
        icon: kit === null ? null : (kit.getAttribute('data-kit-icon') ?? ''),
        node: node === -1 ? null : node,
        mono: svg.closest('[data-craft-tone="mono"]') !== null,
        viewBox: hasView ? [view.x, view.y, view.width, view.height].map(rounded).join(' ') : '',
        stroke: commonest(widths),
        filled,
        caps: commonest(caps) ?? getComputedStyle(svg).strokeLinecap,
        fixedColours: [...fixed].sort(),
        painted: before.flatMap((one) => {
          const colour = paint(one.value, one.alpha);
          return colour === null ? [] : [colour];
        }),
        ground: groundOf(svg),
        size: Math.max(rect.width, rect.height),
      });
      found.push(svg);
    }
  } finally {
    quiet.remove();
  }
  scope.__KITVAS_CRAFT__ = found;
  return reads;
}
