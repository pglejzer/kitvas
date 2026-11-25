// The parts of a shorthand's value (ADR 0070): the pieces between spaces outside brackets, and
// what one piece is (a length, a line style, a colour, an image). A value has parts only when
// all of it is plain CSS: `!important`, a comment, a Sass variable, an interpolation, a string
// outside `url(…)`, a comma outside brackets and a function outside the short list here leave it
// whole, and the editor then never writes into it. Pure: no file text.

/** One part of a value, with its place in it. */
export type Part = { text: string; start: number; end: number };

/** What tells a `var(--kit-…)` width from a colour. */
export type VarKind = (name: string) => 'dimension' | 'color' | null;

/** The inside of a `url(…)` that is read: one quoted string, or a bare address. */
const URL_BODY = String.raw`\(\s*(?:"[^"\\\r\n$(){}]*"|'[^'\\\r\n$(){}]*'|[^\s"'()\\$\{}]*)\s*\)`;
const URL = new RegExp(`(?<![\\w-])url${URL_BODY}`, 'gi');
const WHOLE_URL = new RegExp(`^url${URL_BODY}$`, 'i');
/** What no readable value has outside a `url(…)`. */
const UNREAD = /[!$;{}"'\\@]|\/\*|\/\//;

const COLOR_FUNCTIONS = [
  'rgb',
  'rgba',
  'hsl',
  'hsla',
  'hwb',
  'lab',
  'lch',
  'oklab',
  'oklch',
  'color',
  'color-mix',
];
const FUNCTIONS: ReadonlySet<string> = new Set(['var', 'calc', 'url', ...COLOR_FUNCTIONS]);
const NAME_CHAR = /[A-Za-z0-9_.-]/;

/** The `(` at `at` opens a function the reader knows; a bare one only inside a function. */
function opensKnown(text: string, from: number, at: number, depth: number): boolean {
  let start = at;
  while (start > from && NAME_CHAR.test(text.charAt(start - 1))) start -= 1;
  const name = text.slice(start, at).toLowerCase();
  if (name === '') return depth > 0;
  // At the top a function starts its part: `8px-var(--x)` is no part the reader knows.
  return FUNCTIONS.has(name) && (depth > 0 || start === from);
}

/**
 * The parts of `value`, split at the spaces outside brackets; `null` when the value is not plain
 * CSS the reader understands, or is empty.
 */
export function partsOf(value: string): Part[] | null {
  // The inside of a `url(…)` is an address: a `//` or a quote there is neither comment nor string.
  const plain = value.replace(URL, (url) => `url(${'x'.repeat(url.length - 5)})`);
  if (UNREAD.test(plain)) return null;
  const parts: Part[] = [];
  let depth = 0;
  let start = -1;
  for (let at = 0; at <= plain.length; at += 1) {
    const char = plain.charAt(at);
    if (char === '' || (depth === 0 && /\s/.test(char))) {
      if (start >= 0) parts.push({ text: value.slice(start, at), start, end: at });
      start = -1;
      continue;
    }
    if (start < 0) start = at;
    if (char === '(') {
      if (!opensKnown(plain, start, at, depth)) return null;
      depth += 1;
    } else if (char === ')') {
      depth -= 1;
      if (depth < 0) return null;
    } else if (char === ',' && depth === 0) {
      // Several layers.
      return null;
    }
  }
  return depth === 0 && parts.length > 0 ? parts : null;
}

/** The function a part is one whole call of (`var` for `var(--kit-space-md)`), in lower case. */
export function callOf(part: string): string | null {
  const open = part.indexOf('(');
  if (open <= 0 || !part.endsWith(')')) return null;
  let depth = 0;
  for (let at = open; at < part.length; at += 1) {
    const char = part.charAt(at);
    if (char === '(') depth += 1;
    else if (char === ')') depth -= 1;
    // The call ended before the part did: `rgb(0 0 0)x`.
    if (depth === 0 && at < part.length - 1) return null;
  }
  return part.slice(0, open).toLowerCase();
}

/** The variable a `var(…)` part names: `--kit-space-md`; `null` for any other part. */
export function varOf(part: string): string | null {
  if (callOf(part) !== 'var') return null;
  return /^var\(\s*(--[A-Za-z0-9_-]+)\s*[,)]/i.exec(part)?.[1] ?? null;
}

/** A kit token as a style value writes it, alone: `var(--kit-space-md)`. */
const TOKEN = /^var\(\s*--kit-[A-Za-z0-9_-]+\s*\)$/;

export const isToken = (part: string): boolean => TOKEN.test(part);

const NUMBER = /^[+-]?(?:\d+\.?\d*|\.\d+)$/;
const WITH_UNIT = /^[+-]?(?:\d+\.?\d*|\.\d+)[A-Za-z]+$/;
const PERCENT = /^[+-]?(?:\d+\.?\d*|\.\d+)%$/;

/** One side of a box: a length, a number, a percentage, `auto`, `var(…)` or `calc(…)`. */
export function isBoxPart(part: string): boolean {
  const call = callOf(part);
  if (call !== null) return call === 'var' || call === 'calc';
  return (
    NUMBER.test(part) || WITH_UNIT.test(part) || PERCENT.test(part) || part.toLowerCase() === 'auto'
  );
}

const HEX = /^#(?:[0-9a-f]{3,4}|[0-9a-f]{6}|[0-9a-f]{8})$/i;

/** The colour names of CSS, with `transparent` and `currentcolor`. */
const COLOR_WORDS: ReadonlySet<string> = new Set(
  [
    'aliceblue antiquewhite aqua aquamarine azure beige bisque black blanchedalmond blue',
    'blueviolet brown burlywood cadetblue chartreuse chocolate coral cornflowerblue cornsilk',
    'crimson cyan darkblue darkcyan darkgoldenrod darkgray darkgreen darkgrey darkkhaki',
    'darkmagenta darkolivegreen darkorange darkorchid darkred darksalmon darkseagreen',
    'darkslateblue darkslategray darkslategrey darkturquoise darkviolet deeppink deepskyblue',
    'dimgray dimgrey dodgerblue firebrick floralwhite forestgreen fuchsia gainsboro ghostwhite',
    'gold goldenrod gray green greenyellow grey honeydew hotpink indianred indigo ivory khaki',
    'lavender lavenderblush lawngreen lemonchiffon lightblue lightcoral lightcyan',
    'lightgoldenrodyellow lightgray lightgreen lightgrey lightpink lightsalmon lightseagreen',
    'lightskyblue lightslategray lightslategrey lightsteelblue lightyellow lime limegreen linen',
    'magenta maroon mediumaquamarine mediumblue mediumorchid mediumpurple mediumseagreen',
    'mediumslateblue mediumspringgreen mediumturquoise mediumvioletred midnightblue mintcream',
    'mistyrose moccasin navajowhite navy oldlace olive olivedrab orange orangered orchid',
    'palegoldenrod palegreen paleturquoise palevioletred papayawhip peachpuff peru pink plum',
    'powderblue purple rebeccapurple red rosybrown royalblue saddlebrown salmon sandybrown',
    'seagreen seashell sienna silver skyblue slateblue slategray slategrey snow springgreen',
    'steelblue tan teal thistle tomato turquoise violet wheat white whitesmoke yellow',
    'yellowgreen transparent currentcolor',
  ].flatMap((line) => line.split(' ')),
);

/** A colour: a hex, a colour function, a colour name, or a `var(…)` of a colour token. */
export function isColor(part: string, kindOf: VarKind): boolean {
  const call = callOf(part);
  if (call === 'var') {
    const name = varOf(part);
    return name !== null && kindOf(name) === 'color';
  }
  if (call !== null) return COLOR_FUNCTIONS.includes(call);
  return HEX.test(part) || COLOR_WORDS.has(part.toLowerCase());
}

/** An image: one `url(…)`. A gradient is none the reader takes apart. */
export const isUrl = (part: string): boolean => WHOLE_URL.test(part);

const LINE_WIDTHS = ['thin', 'medium', 'thick'];
const LINE_STYLES = [
  'none',
  'hidden',
  'dotted',
  'dashed',
  'solid',
  'double',
  'groove',
  'ridge',
  'inset',
  'outset',
];

/**
 * What a part of `border` or `outline` is: its width (a length, `0`, `thin`, `medium`, `thick`,
 * `calc(…)`), its style, or its colour. A `var(…)` is a width or a colour by its token's type.
 * `null` for a part that is none of them, and for a `var` no token types.
 */
export function lineKind(
  part: string,
  kindOf: VarKind,
  outline: boolean,
): 'width' | 'style' | 'color' | null {
  const call = callOf(part);
  if (call === 'var') {
    const name = varOf(part);
    const kind = name === null ? null : kindOf(name);
    if (kind === 'dimension') return 'width';
    return kind === 'color' ? 'color' : null;
  }
  if (call === 'calc') return 'width';
  const word = part.toLowerCase();
  const zero = NUMBER.test(part) && Number(part) === 0;
  if (zero || WITH_UNIT.test(part) || LINE_WIDTHS.includes(word)) return 'width';
  // `auto` is a style of an outline only.
  if (LINE_STYLES.includes(word) || (outline && word === 'auto')) return 'style';
  return isColor(part, kindOf) ? 'color' : null;
}

export const FLEX_DIRECTIONS: readonly string[] = [
  'row',
  'row-reverse',
  'column',
  'column-reverse',
];
export const FLEX_WRAPS: readonly string[] = ['nowrap', 'wrap', 'wrap-reverse'];
