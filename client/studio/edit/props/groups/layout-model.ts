// The Layout group's rows with human labels (plan 18f, task 2; spec S4.6 item 4): Direction,
// Align, Justify, Wrap and Gap, each a second view of one CSS property with the keywords people
// use most. They show for what the element lays out: a flex box all five, a grid Align, Justify
// and Gap, anything else none of them. Every raw property stays in "All layout properties".
// Pure: no DOM (`layout-rows.ts` draws).

import type { StyleProperty } from '../../../../../src/edit/index.ts';

export type LayoutKind = 'flex' | 'grid' | 'other' | 'unknown';

/** What the element lays out, by its `display`; `unknown` while the value is not known. */
export function layoutKind(display: string | null | undefined): LayoutKind {
  const value = (display ?? '').trim().toLowerCase();
  if (value === '') return 'unknown';
  if (value === 'flex' || value === 'inline-flex') return 'flex';
  if (value === 'grid' || value === 'inline-grid') return 'grid';
  return 'other';
}

/**
 * A row with a human label: the label's key under `props.layout.`, its property, the keywords it
 * offers (`null`: the property's token field), and how they are drawn.
 */
export type HumanRow = {
  id: 'direction' | 'align' | 'justify' | 'wrap' | 'gap';
  property: StyleProperty;
  keywords: readonly string[] | null;
  look: 'icons' | 'words' | 'switch' | 'field';
  kinds: readonly LayoutKind[];
};

export const HUMAN_ROWS: readonly HumanRow[] = [
  {
    id: 'direction',
    property: 'flex-direction',
    keywords: ['row', 'column'],
    look: 'icons',
    kinds: ['flex'],
  },
  {
    id: 'align',
    property: 'align-items',
    keywords: ['flex-start', 'center', 'flex-end', 'stretch'],
    look: 'icons',
    kinds: ['flex', 'grid'],
  },
  {
    id: 'justify',
    property: 'justify-content',
    keywords: ['flex-start', 'center', 'flex-end', 'space-between'],
    look: 'icons',
    kinds: ['flex', 'grid'],
  },
  {
    id: 'wrap',
    property: 'flex-wrap',
    keywords: ['nowrap', 'wrap'],
    look: 'switch',
    kinds: ['flex'],
  },
  { id: 'gap', property: 'gap', keywords: null, look: 'field', kinds: ['flex', 'grid'] },
];

/** The human rows for what the element lays out; all of them while that is not known. */
export function humanRows(kind: LayoutKind): HumanRow[] {
  if (kind === 'unknown') return [...HUMAN_ROWS];
  return HUMAN_ROWS.filter((row) => row.kinds.includes(kind));
}
