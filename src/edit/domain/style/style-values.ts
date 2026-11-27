// What a keyword or an image property may be set to (plan 15, task C). A keyword comes from its
// fixed list and is never off-kit, so it is written as it is, without the marker. A background
// image is `url(../img/<file>)` of a file in the version's `src/img`, the address the build keeps,
// and nothing else: no remote address, no gradient. Token properties take a token or a raw value
// as in stage 4a and are not checked here. Pure: the caller says which images the version has.

import type { StyleValue } from '../ops.ts';
import { isKeywordProperty, keywordsOf, kindOf, type Refusal } from '../types.ts';

/** A file of the version's `src/img` that a style may name: no folder, quote, space or bracket. */
export const IMAGE_FILE = /^[A-Za-z0-9][A-Za-z0-9_.-]{0,99}\.(?:avif|gif|jpe?g|png|svg|webp)$/i;
/** The most image names the inspect answer lists for the picker. */
export const MAX_IMAGES = 200;

const IMAGE_URL = /^url\(\.\.\/img\/([^()\s'"\\]+)\)$/;

/** `hero.png` as a style writes it: `url(../img/hero.png)`, from the page and the sheet alike. */
export const imageUrl = (file: string): string => `url(../img/${file})`;

/** The file a `url(../img/<file>)` names; `null` for any other value. */
export function imageOfUrl(css: string): string | null {
  const file = IMAGE_URL.exec(css.trim())?.[1];
  return file !== undefined && IMAGE_FILE.test(file) ? file : null;
}

/** Kit words for CSS keywords: the built-in kit's `Stack` says `start`, `end` and `between`. */
const SHORT_WORDS: ReadonlyMap<string, string> = new Map([
  ['start', 'flex-start'],
  ['end', 'flex-end'],
  ['between', 'space-between'],
  ['around', 'space-around'],
  ['evenly', 'space-evenly'],
]);

/**
 * The keyword a kit prop's value stands for: the keyword itself, or the kit's short word for it.
 * `null` when the word names no keyword of the property, and for a property that takes none.
 */
export function keywordOfWord(property: string, word: string): string | null {
  const words = keywordsOf(property) ?? [];
  if (words.includes(word)) return word;
  const long = SHORT_WORDS.get(word);
  return long !== undefined && words.includes(long) ? long : null;
}

/** A keyword or an image as a style value: written as it is, with no off-kit marker. */
export const plainValue = (css: string): StyleValue => ({ raw: css, mark: false });

/**
 * Why `value` may not be written to `property`: `invalid` for a keyword outside its list, a token
 * or a marked value in a keyword or image property, and an image that is not `url(../img/<file>)`
 * of a file `hasImage` knows. `null` when it may, and for every token property.
 */
export function styleValueRefusal(
  property: string,
  value: StyleValue,
  hasImage: (file: string) => boolean,
): Refusal | null {
  const plain = 'raw' in value && value.mark === false ? value.raw : null;
  if (isKeywordProperty(property)) {
    return plain !== null && (keywordsOf(property) ?? []).includes(plain) ? null : 'invalid';
  }
  if (kindOf(property) === 'image') {
    const file = plain === null ? null : imageOfUrl(plain);
    return file !== null && plain === imageUrl(file) && hasImage(file) ? null : 'invalid';
  }
  return null;
}
