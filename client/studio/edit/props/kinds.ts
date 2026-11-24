// The value kinds of the style properties, for the properties panel (plan 15, task C): which
// properties take a token, a keyword or an image, the keyword lists, the kit words a covering
// prop uses for them, and the image address. Pure: no DOM.
//
// The client may not import values from `src/`, so these are copies of `PROPERTY_KIND`,
// `STYLE_KEYWORDS`, `IMAGE_FILE`, `imageUrl`, `imageOfUrl` and `keywordOfWord` in
// `src/edit/domain/`; `test/client/studio/props-kinds.test.ts` keeps them equal.

import type {
  PropValue,
  StyleKind,
  StyleProperty,
  StyleValue,
} from '../../../../src/edit/index.ts';

export const KIND: Record<StyleProperty, StyleKind> = {
  padding: 'dimension',
  'padding-block': 'dimension',
  'padding-inline': 'dimension',
  margin: 'dimension',
  'margin-block': 'dimension',
  'margin-inline': 'dimension',
  gap: 'dimension',
  color: 'color',
  'background-color': 'color',
  'border-color': 'color',
  'font-size': 'dimension',
  'font-weight': 'fontWeight',
  'line-height': 'number',
  'border-radius': 'dimension',
  'border-width': 'dimension',
  width: 'dimension',
  height: 'dimension',
  'padding-top': 'dimension',
  'padding-right': 'dimension',
  'padding-bottom': 'dimension',
  'padding-left': 'dimension',
  'margin-top': 'dimension',
  'margin-right': 'dimension',
  'margin-bottom': 'dimension',
  'margin-left': 'dimension',
  display: 'keyword',
  'flex-direction': 'keyword',
  'flex-wrap': 'keyword',
  'justify-content': 'keyword',
  'align-items': 'keyword',
  'align-self': 'keyword',
  'text-align': 'keyword',
  'border-style': 'keyword',
  'outline-color': 'color',
  'outline-width': 'dimension',
  'outline-style': 'keyword',
  'background-image': 'image',
  'background-size': 'keyword',
};

export const KEYWORDS: Readonly<Partial<Record<StyleProperty, readonly string[]>>> = {
  display: ['block', 'flex', 'grid', 'inline', 'inline-block', 'inline-flex', 'none'],
  'flex-direction': ['row', 'row-reverse', 'column', 'column-reverse'],
  'flex-wrap': ['nowrap', 'wrap'],
  'justify-content': [
    'flex-start',
    'center',
    'flex-end',
    'space-between',
    'space-around',
    'space-evenly',
  ],
  'align-items': ['stretch', 'flex-start', 'center', 'flex-end', 'baseline'],
  'align-self': ['auto', 'stretch', 'flex-start', 'center', 'flex-end'],
  'text-align': ['left', 'center', 'right', 'justify'],
  'border-style': ['none', 'solid', 'dashed', 'dotted'],
  'outline-style': ['none', 'solid', 'dashed', 'dotted'],
  'background-size': ['auto', 'cover', 'contain'],
};

/** The words a keyword property takes; `null` for a token or image property. */
export const keywordsOf = (property: StyleProperty): readonly string[] | null =>
  KEYWORDS[property] ?? null;

/** Kit words for CSS keywords: Base's `Stack` says `start`, `end` and `between`. */
const SHORT_WORDS: ReadonlyMap<string, string> = new Map([
  ['start', 'flex-start'],
  ['end', 'flex-end'],
  ['between', 'space-between'],
  ['around', 'space-around'],
  ['evenly', 'space-evenly'],
]);

/** The keyword a kit prop's word stands for (`start` is `flex-start`); `null` when none. */
export function keywordOfWord(property: StyleProperty, word: string): string | null {
  const words = keywordsOf(property) ?? [];
  if (words.includes(word)) return word;
  const long = SHORT_WORDS.get(word);
  return long !== undefined && words.includes(long) ? long : null;
}

/** A file of the version's `src/img` that a style may name: no folder, quote, space or bracket. */
export const IMAGE_FILE = /^[A-Za-z0-9][A-Za-z0-9_.-]{0,99}\.(?:avif|gif|jpe?g|png|svg|webp)$/i;

const IMAGE_URL = /^url\(\.\.\/img\/([^()\s'"\\]+)\)$/;

/** `hero.png` as a style writes it: `url(../img/hero.png)`. */
export const imageUrl = (file: string): string => `url(../img/${file})`;

/** The file a `url(../img/<file>)` names; `null` for any other value. */
export function imageOfUrl(css: string): string | null {
  const file = IMAGE_URL.exec(css.trim())?.[1];
  return file !== undefined && IMAGE_FILE.test(file) ? file : null;
}

/** A keyword or an image as the panel writes it: as it is, never with the off-kit marker. */
export const plainValue = (css: string): StyleValue => ({ raw: css, mark: false });

/** A catalog prop as the inspect answer lists it. */
export type CatalogProp = {
  type: string;
  values?: string[] | undefined;
  default?: string | number | boolean | undefined;
};

/**
 * The value a covering prop takes to say `keyword`: its kit word for it, or for `flex-wrap` on a
 * boolean prop (`wrap`) true or false. `null` when the prop cannot say it.
 */
export function propValueOf(
  property: StyleProperty,
  def: CatalogProp,
  keyword: string,
): PropValue | null {
  if (def.type === 'boolean') {
    if (property !== 'flex-wrap') return null;
    if (keyword === 'wrap') return { kind: 'boolean', value: true };
    return keyword === 'nowrap' ? { kind: 'boolean', value: false } : null;
  }
  const word = (def.values ?? []).find((value) => keywordOfWord(property, value) === keyword);
  return word === undefined ? null : { kind: 'string', value: word };
}

/** The keyword a covering prop's value says (`justify="between"` is `space-between`). */
export function keywordOfProp(
  property: StyleProperty,
  def: CatalogProp,
  value: string | number | boolean | undefined,
): string | null {
  if (def.type === 'boolean') {
    if (property !== 'flex-wrap') return null;
    return value === true ? 'wrap' : 'nowrap';
  }
  return typeof value === 'string' ? keywordOfWord(property, value) : null;
}

/** The keywords a covering prop can say, in the property's order: what its row offers. */
export function propKeywords(property: StyleProperty, def: CatalogProp): string[] {
  return (keywordsOf(property) ?? []).filter(
    (keyword) => propValueOf(property, def, keyword) !== null,
  );
}

/** A keyword row as segmented buttons up to this many keywords, as a short list above it. */
export const MAX_SEGMENTS = 4;
