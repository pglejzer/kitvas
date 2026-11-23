// Runs in the page (the main frame and each same-origin frame): the computed styles of every visible
// element counted by value, the custom properties of `:root` and `body`, and the widths of media
// queries. Colours are painted through a canvas, so every notation comes back as hex. The adapter
// merges the frames and keeps the top values (`playwright-scan-merge.ts`).
//
// Everything here is serialized into the page: it uses no name from outside the function.

import type { ScanFacts } from '../domain/scan-facts.ts';

export type Tally = { value: string; count: number };
export type RoleTag = ScanFacts['roles'][number]['tag'];
export type Where = ScanFacts['colours'][number]['where'][number];

export type FrameStyles = {
  title: string;
  colours: ScanFacts['colours'];
  families: Tally[];
  type: ScanFacts['type'];
  roles: ScanFacts['roles'];
  spacing: Tally[];
  radii: Tally[];
  shadows: Tally[];
  borders: Tally[];
  rootVars: { name: string; value: string }[];
  breakpoints: number[];
};

export type StyleOptions = {
  /** Values each tally keeps from one frame; the merge keeps fewer. */
  keep: number;
  /** Longer values are dropped: they would not fit the facts. */
  valueMax: number;
  familyMax: number;
  textMax: number;
  /** Elements read at most, in document order, so a huge page still answers in time. */
  elementsMax: number;
  varsMax: number;
  roleTags: readonly RoleTag[];
};

export function collectStyles(options: StyleOptions): FrameStyles {
  const { keep, valueMax, familyMax, textMax, elementsMax, varsMax, roleTags } = options;

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
    // A value that is no colour would leave the fill style as it was and paint that instead.
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

  const add = (tally: Map<string, number>, value: string): void => {
    if (value !== '' && value.length <= valueMax) tally.set(value, (tally.get(value) ?? 0) + 1);
  };
  const colours = new Map<string, { count: number; where: Set<Where> }>();
  const addColour = (hex: string, where: Where): void => {
    if (hex === '') return;
    const entry = colours.get(hex) ?? { count: 0, where: new Set<Where>() };
    entry.count += 1;
    entry.where.add(where);
    colours.set(hex, entry);
  };
  const families = new Map<string, number>();
  const spacing = new Map<string, number>();
  const radii = new Map<string, number>();
  const shadows = new Map<string, number>();
  const borders = new Map<string, number>();
  const types = new Map<string, ScanFacts['type'][number]>();

  const firstFamily = (value: string): string =>
    (value.split(',')[0] ?? '')
      .trim()
      .replace(/^["']|["']$/g, '')
      .slice(0, familyMax);
  const hasOwnText = (element: Element): boolean =>
    Array.from(element.childNodes).some(
      (node) => node.nodeType === Node.TEXT_NODE && (node.textContent ?? '').trim() !== '',
    );
  const sides = ['top', 'right', 'bottom', 'left'];
  const corners = ['top-left', 'top-right', 'bottom-right', 'bottom-left'];
  const spaces = [
    'padding-top',
    'padding-right',
    'padding-bottom',
    'padding-left',
    'margin-top',
    'margin-right',
    'margin-bottom',
    'margin-left',
    'row-gap',
    'column-gap',
  ];

  const visible = new Set<Element>();
  for (const element of Array.from(document.querySelectorAll('body *')).slice(0, elementsMax)) {
    const rect = element.getBoundingClientRect();
    if (rect.width <= 0 || rect.height <= 0) continue;
    if (!element.checkVisibility({ opacityProperty: true, visibilityProperty: true })) continue;
    visible.add(element);
    const style = getComputedStyle(element);
    if (hasOwnText(element)) {
      addColour(paint(style.color), 'text');
      const family = firstFamily(style.fontFamily);
      add(families, family);
      const key = [family, style.fontSize, style.lineHeight, style.fontWeight].join('|');
      const entry = types.get(key);
      if (entry) {
        entry.count += 1;
      } else {
        types.set(key, {
          family,
          size: style.fontSize,
          lineHeight: style.lineHeight,
          weight: style.fontWeight,
          count: 1,
        });
      }
    }
    addColour(paint(style.backgroundColor), 'background');
    // Each value once per element: the counts say how many elements use it.
    const lines = new Set<string>();
    const lineColours = new Set<string>();
    for (const side of sides) {
      const kind = style.getPropertyValue(`border-${side}-style`);
      const width = style.getPropertyValue(`border-${side}-width`);
      if (kind === 'none' || kind === 'hidden' || !(Number.parseFloat(width) > 0)) continue;
      const colour = paint(style.getPropertyValue(`border-${side}-color`));
      if (colour === '') continue;
      lines.add(`${width} ${kind} ${colour}`);
      lineColours.add(colour);
    }
    for (const line of lines) add(borders, line);
    for (const colour of lineColours) addColour(colour, 'border');
    const gaps = new Set<string>();
    for (const name of spaces) {
      const value = style.getPropertyValue(name);
      if (/^\d*\.?\d+px$/.test(value) && Number.parseFloat(value) > 0) gaps.add(value);
    }
    for (const gap of gaps) add(spacing, gap);
    const rounds = new Set<string>();
    for (const corner of corners) {
      const value = style.getPropertyValue(`border-${corner}-radius`);
      if (value !== '' && value !== '0px') rounds.add(value);
    }
    for (const round of rounds) add(radii, round);
    if (style.boxShadow !== 'none') add(shadows, style.boxShadow);
  }

  const roles: ScanFacts['roles'] = [];
  for (const tag of roleTags) {
    const shown = Array.from(document.querySelectorAll(tag)).filter((item) => visible.has(item));
    const element = shown.find((item) => item.closest('main, [role="main"]') !== null) ?? shown[0];
    if (element === undefined) continue;
    const style = getComputedStyle(element);
    roles.push({
      tag,
      family: firstFamily(style.fontFamily),
      size: style.fontSize,
      weight: style.fontWeight,
      lineHeight: style.lineHeight,
    });
  }

  const fromRoot = new Set<string>();
  const fromBody = new Set<string>();
  const widths = new Set<number>();
  const readMedia = (text: string): void => {
    const patterns = [
      /(?:min|max)-width\s*:\s*(\d*\.?\d+)(px|em|rem)/g,
      /width\s*[<>]=?\s*(\d*\.?\d+)(px|em|rem)/g,
      /(\d*\.?\d+)(px|em|rem)\s*[<>]=?\s*width/g,
    ];
    for (const pattern of patterns) {
      for (const match of text.matchAll(pattern)) {
        const amount = Number.parseFloat(match[1] ?? '');
        // Media queries count em and rem from the browser's default 16 px, not the page's.
        const px = match[2] === 'px' ? amount : amount * 16;
        if (Number.isFinite(px) && px >= 0) widths.add(Math.round(px));
      }
    }
  };
  const readDeclarations = (style: CSSStyleDeclaration, into: Set<string>): void => {
    for (let index = 0; index < style.length; index += 1) {
      const name = style.item(index);
      if (name.startsWith('--')) into.add(name);
    }
  };
  const walk = (rules: CSSRuleList, depth: number): void => {
    if (depth > 8) return;
    for (const rule of Array.from(rules)) {
      if (rule instanceof CSSStyleRule) {
        const selectors = rule.selectorText.split(',').map((part) => part.trim());
        if (selectors.some((part) => part === ':root' || part === 'html')) {
          readDeclarations(rule.style, fromRoot);
        } else if (selectors.includes('body')) readDeclarations(rule.style, fromBody);
        if (rule.cssRules.length > 0) walk(rule.cssRules, depth + 1);
      } else if (rule instanceof CSSMediaRule) {
        readMedia(rule.media.mediaText);
        walk(rule.cssRules, depth + 1);
      } else if (rule instanceof CSSImportRule) {
        readMedia(rule.media.mediaText);
        try {
          if (rule.styleSheet) walk(rule.styleSheet.cssRules, depth + 1);
        } catch {
          // A sheet of another origin cannot be read.
        }
      } else if (rule instanceof CSSGroupingRule) walk(rule.cssRules, depth + 1);
    }
  };
  for (const sheet of Array.from(document.styleSheets)) {
    readMedia(sheet.media.mediaText);
    let rules: CSSRuleList;
    try {
      rules = sheet.cssRules;
    } catch {
      // A sheet of another origin cannot be read.
      continue;
    }
    walk(rules, 0);
  }
  readDeclarations(document.documentElement.style, fromRoot);
  if (document.body) readDeclarations(document.body.style, fromBody);
  const rootStyle = getComputedStyle(document.documentElement);
  const bodyStyle = document.body ? getComputedStyle(document.body) : rootStyle;
  const cut = (value: string): string => value.replace(/\s+/g, ' ').trim().slice(0, textMax);
  const rootVars = [
    ...Array.from(fromRoot, (name) => ({ name, value: cut(rootStyle.getPropertyValue(name)) })),
    ...Array.from(fromBody)
      .filter((name) => !fromRoot.has(name))
      .map((name) => ({ name, value: cut(bodyStyle.getPropertyValue(name)) })),
  ].slice(0, varsMax);

  const order = (a: Tally, b: Tally): number =>
    b.count - a.count || (a.value < b.value ? -1 : a.value > b.value ? 1 : 0);
  const top = (tally: Map<string, number>): Tally[] =>
    Array.from(tally, ([value, count]) => ({ value, count }))
      .sort(order)
      .slice(0, keep);
  return {
    title: cut(document.title),
    colours: Array.from(colours, ([value, entry]) => ({
      value,
      count: entry.count,
      where: Array.from(entry.where),
    }))
      .sort(order)
      .slice(0, keep),
    families: top(families),
    type: Array.from(types.values())
      .sort((a, b) => b.count - a.count)
      .slice(0, keep),
    roles,
    spacing: top(spacing),
    radii: top(radii),
    shadows: top(shadows),
    borders: top(borders),
    rootVars,
    breakpoints: Array.from(widths),
  };
}
