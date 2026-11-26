// Runs in the page, after the facts walk and before the layer walk: puts the layer walk's text
// tools, and its reader of colours inside computed values, on `window.__KITVAS_LAYER_TOOLS__`
// (plan 21, task 1).
//
// - `content` cuts an element's content into runs of inline text and the elements that are boxes
//   of their own: a block, an atomic inline (an svg, an img, an inline-block, a field) or a box out
//   of the flow. An inline element (a link, a `strong`) is part of the text around it.
// - `read` makes a text layer of one run: white space collapsed as painted, a line break as `\n`,
//   the block's font, and as runs the inline parts that differ from the block in weight, slant,
//   underline or colour. Its box is the run's lines: from the left of the first to the right of
//   the widest, one line height per line.
// - `control` reads what a field shows: its value, else its placeholder in the placeholder's
//   colour, centred in a one-line field.
// - `paintAll` paints each colour inside a computed value (a shadow, a gradient) as `#rrggbbaa`,
//   so the pure readers of `layer-parse.ts` take oklch, hsl and colour names too.
//
// Everything here is serialized into the page: it uses no name from outside the function, only the
// facts walk's tools on `window.__KITVAS_TOOLS__` (`playwright-facts-walk.ts`).

import type { Box } from '../../domain/page/facts.ts';
import type { LayerRun, LayerText } from '../../domain/page/layers.ts';
import type { FactsWindow } from '../facts/playwright-facts-walk.ts';

/** A run of inline text (text nodes and `br` elements, in order), or a box of its own. */
export type ContentPart = { pieces: Node[] } | { element: Element };

export type TextRead = {
  text: LayerText;
  /** Lines the text is painted on. */
  lines: number;
  /** Page coordinates at scroll 0. */
  box: Box;
};

export type LayerTools = {
  content(element: Element): ContentPart[];
  /** The text of `pieces`, inside `block`, cut at `max` characters; null when it has none. */
  read(block: Element, pieces: readonly Node[], max: number): TextRead | null;
  /** What an `input`, `textarea` or `select` shows; null when it shows no text. */
  control(element: Element, max: number): TextRead | null;
  /** `value` with each colour painted, `currentcolor` as `current`; addresses and quotes kept. */
  paintAll(value: string, current: string): string;
};

export type LayersWindow = FactsWindow & {
  __KITVAS_LAYER_TOOLS__?: LayerTools | undefined;
};

/** False when the facts walk left no tools on the page. */
export function installLayerTools(): boolean {
  const scope = window as unknown as LayersWindow;
  const tools = scope.__KITVAS_TOOLS__;
  if (tools === undefined) return false;
  const round = (value: number): number => Math.round(value * 100) / 100;
  const px = (value: string): number => {
    const number = Number.parseFloat(value);
    return Number.isFinite(number) ? number : 0;
  };

  // An object on the line, never text of it.
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
  ]);
  const NEVER = new Set(['script', 'style', 'template', 'noscript']);

  const content = (element: Element): ContentPart[] => {
    const parts: ContentPart[] = [];
    let pieces: Node[] = [];
    const close = (): void => {
      if (pieces.some((piece) => piece instanceof Text && piece.data.trim() !== '')) {
        parts.push({ pieces });
      }
      pieces = [];
    };
    const visit = (parent: Element): void => {
      for (const child of Array.from(parent.childNodes)) {
        if (child instanceof Text) {
          pieces.push(child);
          continue;
        }
        if (!(child instanceof Element)) continue;
        const tag = child.tagName.toLowerCase();
        if (tag === 'br') {
          pieces.push(child);
          continue;
        }
        if (NEVER.has(tag)) continue;
        const style = getComputedStyle(child);
        if (style.display === 'none') continue;
        if (style.display === 'contents') {
          visit(child);
          continue;
        }
        const inFlow = style.position !== 'absolute' && style.position !== 'fixed';
        if (inFlow && style.display === 'inline' && !ATOMIC.has(tag)) {
          visit(child);
          continue;
        }
        close();
        parts.push({ element: child });
      }
    };
    visit(element);
    close();
    return parts;
  };

  const weightOf = (style: CSSStyleDeclaration): number => px(style.fontWeight) || 400;
  const italicOf = (style: CSSStyleDeclaration): boolean =>
    style.fontStyle === 'italic' || style.fontStyle.startsWith('oblique');
  const lineOf = (style: CSSStyleDeclaration): number =>
    round(style.lineHeight === 'normal' ? px(style.fontSize) * 1.2 : px(style.lineHeight));
  const alignOf = (style: CSSStyleDeclaration): LayerText['align'] => {
    const value = style.textAlign.replace(/^-webkit-/, '');
    if (value === 'center' || value === 'justify') return value;
    const rtl = style.direction === 'rtl';
    return value === 'right' || (value === 'end' && !rtl) || (value === 'start' && rtl)
      ? 'right'
      : 'left';
  };
  const transformOf = (value: string): LayerText['transform'] =>
    value === 'uppercase' || value === 'lowercase' || value === 'capitalize' ? value : 'none';
  /** The block's own text style, with no runs yet. */
  const styled = (
    style: CSSStyleDeclaration,
    characters: string,
    truncated: boolean,
  ): LayerText => ({
    characters,
    truncated,
    // The first family as written: Figma looks it up by its own name.
    family: (style.fontFamily.split(',')[0] ?? '').trim().replace(/^["']|["']$/g, ''),
    weight: weightOf(style),
    italic: italicOf(style),
    size: round(px(style.fontSize)),
    lineHeight: lineOf(style),
    letterSpacing: style.letterSpacing === 'normal' ? 0 : round(px(style.letterSpacing)),
    align: alignOf(style),
    transform: transformOf(style.textTransform),
    colour: tools.paint(style.color),
    runs: [],
  });
  /** Underlined by itself or by an ancestor up to the block: a decoration reaches the text inside. */
  const underlined = (from: Element, block: Element): boolean => {
    for (let up: Element | null = from; up !== null; up = up.parentElement) {
      if (getComputedStyle(up).textDecorationLine.includes('underline')) return true;
      if (up === block) break;
    }
    return false;
  };
  /** A text node's characters as painted, and whether its white space collapses. */
  const shown = (text: Text): [string, boolean] => {
    const space = getComputedStyle(text.parentElement ?? document.body).whiteSpace;
    if (space === 'pre' || space === 'pre-wrap' || space === 'break-spaces') {
      return [text.data, false];
    }
    if (space === 'pre-line') {
      return [text.data.replace(/[ \t]+/g, ' ').replace(/ ?\n ?/g, '\n'), true];
    }
    return [text.data.replace(/\s+/g, ' '), true];
  };

  const range = document.createRange();
  /** The lines of the pieces' text, each a band holding the middle of its boxes. */
  const linesOf = (
    pieces: readonly Node[],
    lineHeight: number,
    block: Element,
  ): { lines: number; box: Box } => {
    const lines: { top: number; bottom: number }[] = [];
    let left = Number.POSITIVE_INFINITY;
    let right = Number.NEGATIVE_INFINITY;
    for (const piece of pieces) {
      if (!(piece instanceof Text) || piece.data.trim() === '') continue;
      range.selectNodeContents(piece);
      for (const rect of Array.from(range.getClientRects())) {
        if (rect.width <= 0 || rect.height <= 0) continue;
        left = Math.min(left, rect.left);
        right = Math.max(right, rect.right);
        const middle = rect.top + rect.height / 2;
        const line = lines.find((entry) => middle >= entry.top && middle <= entry.bottom);
        if (line === undefined) {
          lines.push({ top: rect.top, bottom: rect.bottom });
        } else {
          line.top = Math.min(line.top, rect.top);
          line.bottom = Math.max(line.bottom, rect.bottom);
        }
      }
    }
    if (lines.length === 0 || !Number.isFinite(left)) {
      return { lines: 1, box: tools.box(block) };
    }
    const first = Math.min(...lines.map((line) => (line.top + line.bottom) / 2));
    const box: Box = [
      round(left + window.scrollX),
      round(first - lineHeight / 2 + window.scrollY),
      round(right - left),
      round(lines.length * lineHeight),
    ];
    return { lines: lines.length, box };
  };

  const read = (block: Element, pieces: readonly Node[], max: number): TextRead | null => {
    const segments: { start: number; end: number; from: Element }[] = [];
    let characters = '';
    for (const piece of pieces) {
      if (!(piece instanceof Text)) {
        characters = `${characters.replace(/ $/, '')}\n`;
        continue;
      }
      const [painted, collapses] = shown(piece);
      // One space between words and none at the start of a line, as CSS collapses them.
      const startsLine = characters === '' || /[ \n]$/.test(characters);
      const data = collapses && startsLine ? painted.replace(/^ /, '') : painted;
      if (data === '') continue;
      const from = piece.parentElement ?? block;
      segments.push({ start: characters.length, end: characters.length + data.length, from });
      characters += data;
    }
    const whole = characters.replace(/[ \n]+$/, '');
    if (whole.trim() === '') return null;
    const truncated = whole.length > max;
    const style = getComputedStyle(block);
    const text = styled(style, truncated ? whole.slice(0, max) : whole, truncated);
    for (const { start, end, from } of segments) {
      const last = Math.min(end, text.characters.length);
      if (start >= last) continue;
      const own = getComputedStyle(from);
      const run: LayerRun = {
        start,
        end: last,
        weight: weightOf(own),
        italic: italicOf(own),
        underline: underlined(from, block),
        colour: tools.paint(own.color),
      };
      const differs =
        run.weight !== text.weight ||
        run.italic !== text.italic ||
        run.underline ||
        run.colour !== text.colour;
      if (differs) text.runs.push(run);
    }
    return { text, ...linesOf(pieces, text.lineHeight, block) };
  };

  // Fields that show their value as text.
  const FIELDS = new Set([
    'text',
    'search',
    'email',
    'url',
    'tel',
    'number',
    'password',
    'date',
    'time',
    'datetime-local',
    'month',
    'week',
    'submit',
    'button',
    'reset',
  ]);
  const control = (element: Element, max: number): TextRead | null => {
    let value = '';
    let hint = false;
    if (element instanceof HTMLSelectElement) {
      value = element.selectedOptions[0]?.textContent ?? '';
    } else if (element instanceof HTMLInputElement || element instanceof HTMLTextAreaElement) {
      if (element instanceof HTMLInputElement && !FIELDS.has(element.type)) return null;
      const secret = element instanceof HTMLInputElement && element.type === 'password';
      // A bullet per character, as a password field shows it.
      value = secret ? String.fromCharCode(0x2022).repeat(element.value.length) : element.value;
      if (value === '' && element.placeholder !== '') {
        value = element.placeholder;
        hint = true;
      }
    }
    const area = element instanceof HTMLTextAreaElement;
    const whole = (area ? value.replace(/[ \t]+/g, ' ') : value.replace(/\s+/g, ' ')).trim();
    if (whole === '') return null;
    const truncated = whole.length > max;
    const style = getComputedStyle(element);
    const text = styled(style, truncated ? whole.slice(0, max) : whole, truncated);
    if (hint) text.colour = tools.paint(getComputedStyle(element, '::placeholder').color);
    const [x, y, width, height] = tools.box(element);
    const left = px(style.borderLeftWidth) + px(style.paddingLeft);
    const top = px(style.borderTopWidth) + px(style.paddingTop);
    const across = width - left - px(style.borderRightWidth) - px(style.paddingRight);
    const down = height - top - px(style.borderBottomWidth) - px(style.paddingBottom);
    const line = text.lineHeight;
    if (area) {
      const lines = Math.max(1, Math.round(down / Math.max(1, line)));
      return { text, lines, box: [round(x + left), round(y + top), round(across), round(down)] };
    }
    const box: Box = [round(x + left), round(y + top + (down - line) / 2), round(across), line];
    return { text, lines: 1, box };
  };

  const COLOUR_CALLS = new Set(
    'rgb rgba hsl hsla hwb lab lch oklab oklch color color-mix light-dark'.split(' '),
  );
  /** Where the quoted text that opens at `at` closes. */
  const quoted = (value: string, at: number): number => {
    const quote = value.charAt(at);
    let end = at + 1;
    while (end < value.length && value.charAt(end) !== quote) {
      end += value.charAt(end) === '\\' ? 2 : 1;
    }
    return end;
  };
  /** Where the bracket that opens at `open` closes. */
  const closing = (value: string, open: number): number => {
    let depth = 0;
    for (let at = open; at < value.length; at += 1) {
      const char = value.charAt(at);
      if (char === '"' || char === "'") {
        at = quoted(value, at);
      } else if (char === '(') {
        depth += 1;
      } else if (char === ')') {
        depth -= 1;
        if (depth === 0) return at;
      }
    }
    return value.length - 1;
  };
  const paintAll = (value: string, current: string): string => {
    let out = '';
    let at = 0;
    while (at < value.length) {
      const char = value.charAt(at);
      const rest = value.slice(at);
      if (char === '"' || char === "'") {
        const end = quoted(value, at);
        out += value.slice(at, end + 1);
        at = end + 1;
        continue;
      }
      const hex = char === '#' ? /^#[0-9a-fA-F]{3,8}\b/.exec(rest)?.[0] : undefined;
      if (hex !== undefined) {
        out += tools.paint(hex) || hex;
        at += hex.length;
        continue;
      }
      // A word starts after no letter, digit or dot: the `px` of `0px` is none.
      const after = /[\w.-]/.test(value.charAt(at - 1));
      const word = after ? undefined : /^-?[a-zA-Z][\w-]*/.exec(rest)?.[0];
      if (word === undefined) {
        out += char;
        at += 1;
        continue;
      }
      const next = at + word.length;
      const name = word.toLowerCase();
      if (value.charAt(next) === '(') {
        const end = closing(value, next);
        const call = value.slice(at, end + 1);
        if (COLOUR_CALLS.has(name)) {
          out += tools.paint(call.replace(/currentcolor/gi, current)) || call;
        } else if (name === 'url') {
          out += call;
        } else {
          out += `${word}(${paintAll(value.slice(next + 1, end), current)})`;
        }
        at = end + 1;
        continue;
      }
      if (name === 'currentcolor') out += tools.paint(current) || word;
      else out += CSS.supports('color', word) ? tools.paint(word) || word : word;
      at = next;
    }
    return out;
  };

  scope.__KITVAS_LAYER_TOOLS__ = { content, read, control, paintAll };
  return true;
}
