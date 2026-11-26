// The studio select's pure logic: what the search keeps, how options group, how a key moves the
// active option. No DOM here, so tests run it on plain data.

export type SelectItem = {
  value: string;
  name: string;
  group: string | null;
  detail: string | null;
  swatch: string | null;
  warn: string | null;
  /** The words of the mark of an item the project added to its kit (`ui/added-mark.ts`); none: no mark. */
  added?: string | null;
};

/** From this many items the list opens with a search field. */
export const SEARCH_FROM = 9;
/** How far PageUp and PageDown move. */
export const PAGE = 8;

/** The items whose name, value or group holds the query, ignoring case. An empty query keeps all. */
export function filterItems(items: readonly SelectItem[], query: string): SelectItem[] {
  const needle = query.trim().toLowerCase();
  if (needle === '') return [...items];
  return items.filter((item) => {
    const dotted = item.group === null ? item.name : `${item.group}.${item.name}`;
    return [item.name, item.value, item.group ?? '', dotted].some((part) =>
      part.toLowerCase().includes(needle),
    );
  });
}

/** Items in groups, in the order the groups first appear; items with no group form one group. */
export function groupItems(
  items: readonly SelectItem[],
): { group: string | null; items: SelectItem[] }[] {
  const groups: { group: string | null; items: SelectItem[] }[] = [];
  for (const item of items) {
    const found = groups.find((entry) => entry.group === item.group);
    if (found) found.items.push(item);
    else groups.push({ group: item.group, items: [item] });
  }
  return groups;
}

export type MoveKey = 'ArrowUp' | 'ArrowDown' | 'Home' | 'End' | 'PageUp' | 'PageDown';

/** The active option after a key, over `count` options; `null` when there are none. */
export function moveActive(active: number | null, key: MoveKey, count: number): number | null {
  if (count <= 0) return null;
  const last = count - 1;
  const clamp = (n: number): number => Math.min(last, Math.max(0, n));
  switch (key) {
    case 'Home':
      return 0;
    case 'End':
      return last;
    case 'ArrowDown':
      return active === null ? 0 : clamp(active + 1);
    case 'ArrowUp':
      return active === null ? last : clamp(active - 1);
    case 'PageDown':
      return active === null ? 0 : clamp(active + PAGE);
    case 'PageUp':
      return active === null ? last : clamp(active - PAGE);
  }
}
