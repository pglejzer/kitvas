// Raw lengths in the properties panel (plan 15, task C): a number and a unit. A raw length takes
// px, rem or %; `auto` only for width and height. A raw length is off-kit and marked so; `auto`
// belongs to the size scale, as the size handles write it. Pure: no DOM.

import type { StyleProperty } from '../../../../src/edit/index.ts';

export const LENGTH_UNITS = ['px', 'rem', '%'] as const;
export type LengthUnit = (typeof LENGTH_UNITS)[number];

const AUTO_SIZES: ReadonlySet<StyleProperty> = new Set(['width', 'height']);
const MARGINS: ReadonlySet<StyleProperty> = new Set([
  'margin',
  'margin-block',
  'margin-inline',
  'margin-top',
  'margin-right',
  'margin-bottom',
  'margin-left',
]);

/** One rem in px, as the browser's default root size. */
const REM = 16;

/** The units the property's raw length offers, `auto` last for width and height. */
export function unitsFor(property: StyleProperty): string[] {
  return AUTO_SIZES.has(property) ? [...LENGTH_UNITS, 'auto'] : [...LENGTH_UNITS];
}

/** Only a margin may be negative. */
export const allowsNegative = (property: StyleProperty): boolean => MARGINS.has(property);

const LENGTH = /^(-?(?:\d+\.?\d*|\.\d+))(px|rem|%)?$/;

/** A length read as amount and unit (a bare `0` is `0px`), `auto`, or `null` for anything else. */
export function readLength(css: string): { amount: number; unit: LengthUnit } | 'auto' | null {
  const text = css.trim().toLowerCase();
  if (text === 'auto') return 'auto';
  const match = LENGTH.exec(text);
  if (!match?.[1]) return null;
  const amount = Number(match[1]);
  const unit = match[2];
  if (!Number.isFinite(amount)) return null;
  if (unit === undefined) return amount === 0 ? { amount: 0, unit: 'px' } : null;
  return unit === 'px' || unit === 'rem' || unit === '%' ? { amount, unit } : null;
}

/** A length in px: px, rem at 16 px, a bare 0; `null` for %, `auto` and the rest. */
export function lengthPx(css: string): number | null {
  const read = readLength(css);
  if (read === null || read === 'auto' || read.unit === '%') return null;
  return read.unit === 'rem' ? read.amount * REM : read.amount;
}
