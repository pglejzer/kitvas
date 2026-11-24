// `kitvas rework propose`: the protected list kitvas proposes from the original's inventory (spec
// 5.3). Pure: the person confirms or edits it through the skill, which writes `protected.json`.

import { VIEWPORTS } from '../domain/page/page.ts';
import type { Inventory, ProtectedItem } from '../domain/rework/before.ts';
import { type InventoryItem, normalise, priceValue } from '../domain/rework/inventory.ts';

const [, LAPTOP] = VIEWPORTS;

/** Kind and text as a person reads them; a price by its value, so `$1,299.00` and `$1299` are one. */
function sameKey(item: InventoryItem): string {
  const value = item.kind === 'price' ? priceValue(item.text) : null;
  return `${item.kind}:${value === null ? normalise(item.text) : String(value)}`;
}

/** Items with text, without repeats across widths, in inventory order. */
function distinct(items: readonly InventoryItem[]): InventoryItem[] {
  const seen = new Set<string>();
  const kept: InventoryItem[] = [];
  for (const item of items) {
    if (item.text.trim() === '') continue;
    const key = sameKey(item);
    if (seen.has(key)) continue;
    seen.add(key);
    kept.push(item);
  }
  return kept;
}

/**
 * The links of the header, per width: the links before the first h1 of that width, else before its
 * first heading. A width without a heading gives none, because its footer links would count too.
 */
function headerLinks(items: readonly InventoryItem[]): InventoryItem[] {
  const widths = [...new Set(items.map((item) => item.width))];
  return widths.flatMap((width) => {
    const here = items.filter((item) => item.width === width);
    const h1 = here.findIndex((item) => item.kind === 'heading' && item.level === 1);
    const cut = h1 !== -1 ? h1 : here.findIndex((item) => item.kind === 'heading');
    return cut === -1 ? [] : here.slice(0, cut).filter((item) => item.kind === 'link');
  });
}

/** The main action: the first one seen at the laptop width, else the first one at all. */
function mainAction(items: readonly InventoryItem[]): InventoryItem | undefined {
  const actions = items.filter((item) => item.kind === 'action' && item.text.trim() !== '');
  return actions.find((item) => item.width === LAPTOP.width) ?? actions[0];
}

const protectedItem = (id: string, item: InventoryItem): ProtectedItem => ({
  id,
  kind: item.kind,
  find: item.text.trim(),
});

const numbered = (prefix: string, items: InventoryItem[]): ProtectedItem[] =>
  items.map((item, index) => protectedItem(`${prefix}-${index + 1}`, item));

/**
 * The proposal: the brand mark (`brand`), the main action (`cta`), every price (`price-1`, …),
 * every field (`field-1`, …) and the header's links (`nav-1`, …). Repeats across the widths are
 * dropped by kind and normalised text.
 */
export function proposeProtected(inventory: Inventory): ProtectedItem[] {
  const { items } = inventory;
  const proposal: ProtectedItem[] = [];
  const [brand] = distinct(items.filter((item) => item.kind === 'brand'));
  if (brand) proposal.push(protectedItem('brand', brand));
  const action = mainAction(items);
  if (action) proposal.push(protectedItem('cta', action));
  proposal.push(...numbered('price', distinct(items.filter((item) => item.kind === 'price'))));
  proposal.push(...numbered('field', distinct(items.filter((item) => item.kind === 'field'))));
  proposal.push(...numbered('nav', distinct(headerLinks(items))));
  return proposal;
}
