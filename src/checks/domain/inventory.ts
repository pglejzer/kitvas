// What a page holds, as a list a person would recognise: headings, texts, links, actions, fields,
// images, prices and the brand mark. Read from a live page for `rework` (ADR 0045) and compared
// with a version by the protected rule.

import { type Zod, z } from '../../shared/index.ts';

export const INVENTORY_KINDS = [
  'heading',
  'text',
  'link',
  'action',
  'field',
  'image',
  'price',
  'brand',
] as const;
export type InventoryKind = (typeof INVENTORY_KINDS)[number];

export const InventoryItemSchema = z.strictObject({
  kind: z.enum(INVENTORY_KINDS),
  /** The visible text, the accessible name of an action, a field's label, an image's alt. */
  text: z.string(),
  href: z.string().optional(),
  /** Heading level, 1 to 6. */
  level: z.number().int().min(1).max(6).optional(),
  /** The width it was seen at. */
  width: z.number().int(),
  /** `measured` from a live page; `read` by the skill from an image. */
  read: z.enum(['measured', 'read']),
});

export type InventoryItem = Zod.infer<typeof InventoryItemSchema>;

/** Text as it is compared between a page and a version: case, spacing, quotes and dashes folded. */
export function normalise(text: string): string {
  return text
    .normalize('NFKC')
    .toLowerCase()
    .replace(/[‘’‚‛′]/g, "'")
    .replace(/[“”„‟″]/g, '"')
    .replace(/[‐-―−]/g, '-')
    .replace(/\s+/g, ' ')
    .trim();
}

/** Currency symbols as escapes, and the codes a price may carry. */
const CURRENCY_SYMBOLS = /[$€£¥₹₩₽]/g;
const CURRENCY_WORDS =
  /z\u0142|(?<![a-z])(?:usd|eur|gbp|pln|chf|czk|sek|nok|dkk|jpy|cad|aud|rub|uah|huf|ron|kr|zl)(?![a-z])/g;

/**
 * The number in a price text, or null when the text is no price: no digits, or letters other than
 * a currency code, or anything but digits and separators once the currency is taken away. The last
 * separator followed by exactly two digits is the decimal one; every other separator groups.
 */
export function priceValue(text: string): number | null {
  const rest = text
    .normalize('NFKC')
    .toLowerCase()
    .replace(CURRENCY_SYMBOLS, ' ')
    .replace(CURRENCY_WORDS, ' ')
    .trim();
  if (!/^\d(?:[\d\s.,]*\d)?$/.test(rest)) return null;
  const at = Math.max(rest.lastIndexOf('.'), rest.lastIndexOf(','), rest.lastIndexOf(' '));
  const decimal = at >= 0 && /^\d{2}$/.test(rest.slice(at + 1)) && /^[.,]$/.test(rest.charAt(at));
  const whole = (decimal ? rest.slice(0, at) : rest).replace(/\D/g, '');
  const value = Number(decimal ? `${whole}.${rest.slice(at + 1)}` : whole);
  return Number.isFinite(value) ? value : null;
}
