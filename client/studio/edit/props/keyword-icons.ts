// Keywords drawn as icons in Properties (plan 18, task C; spec goal 6): a direction is an arrow,
// an alignment is bars against a line. A row of keywords is drawn as icons only when every
// keyword in it has one; otherwise each keyword shows as its word, so a row never mixes the two.
// The button of an icon still says the keyword, as its accessible name and its tooltip. Pure.

import type { StyleProperty } from '../../../../src/edit/index.ts';
import type { IconName } from '../../../../src/studio/pages/icons/paths.ts';

/** The icons of one property's keywords. */
type Icons = ReadonlyMap<string, IconName>;

const DIRECTION: Icons = new Map<string, IconName>([
  ['row', 'arrow-right'],
  ['row-reverse', 'arrow-left'],
  ['column', 'arrow-down'],
  ['column-reverse', 'arrow-up'],
]);

const START_END: Icons = new Map<string, IconName>([
  ['flex-start', 'align-start'],
  ['center', 'align-center'],
  ['flex-end', 'align-end'],
]);

const JUSTIFY: Icons = new Map<string, IconName>([
  ...START_END,
  ['space-between', 'align-between'],
]);

const ALIGN: Icons = new Map<string, IconName>([...START_END, ['stretch', 'align-stretch']]);

const TEXT_ALIGN: Icons = new Map<string, IconName>([
  ['left', 'align-start'],
  ['center', 'align-center'],
  ['right', 'align-end'],
  ['justify', 'align-stretch'],
]);

/** The icon of each keyword that has one, by property. */
export const KEYWORD_ICONS: Readonly<Partial<Record<StyleProperty, Icons>>> = {
  'flex-direction': DIRECTION,
  'justify-content': JUSTIFY,
  'align-items': ALIGN,
  'align-self': ALIGN,
  'text-align': TEXT_ALIGN,
};

/** The icon a keyword of the property is drawn with; `null` for one that shows as its word. */
export function keywordIcon(property: StyleProperty, keyword: string): IconName | null {
  return KEYWORD_ICONS[property]?.get(keyword) ?? null;
}

/**
 * The icons of a row of keywords, in its order, when every one of them has an icon; `null` when
 * one has none (or there are none), and the row shows words.
 */
export function segmentIcons(
  property: StyleProperty,
  keywords: readonly string[],
): IconName[] | null {
  const icons: IconName[] = [];
  for (const keyword of keywords) {
    const one = keywordIcon(property, keyword);
    if (one === null) return null;
    icons.push(one);
  }
  return icons.length > 0 ? icons : null;
}
