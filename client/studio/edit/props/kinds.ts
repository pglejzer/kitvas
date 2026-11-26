// The value kinds of the style properties, for the properties panel (plan 15, task C): which
// properties take a token, a keyword or an image, the keyword lists, the kit words a covering
// prop uses for them, and the image address. Pure: no DOM.
//
// The kinds, the keyword lists, the kit words and the image address are the server's own
// (`src/edit/domain/types.ts` and `style/style-values.ts`, ADR 0080). A keyword or an image is
// written as it is, never with the off-kit marker (`plainValue`).

import { keywordOfWord } from '../../../../src/edit/domain/style/style-values.ts';
import { keywordsOf, PROPERTY_KIND } from '../../../../src/edit/domain/types.ts';
import type { PropValue, StyleKind, StyleProperty } from '../../../../src/edit/index.ts';

export {
  imageOfUrl,
  imageUrl,
  plainValue,
} from '../../../../src/edit/domain/style/style-values.ts';
export { keywordsOf } from '../../../../src/edit/domain/types.ts';

/** Each property's kind: its token type, `keyword` or `image`. */
export const KIND: Record<StyleProperty, StyleKind> = PROPERTY_KIND;

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
