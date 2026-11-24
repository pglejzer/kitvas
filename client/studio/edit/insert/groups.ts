// How the Insert pane groups what the kit offers (plan 18, task B): pure, tested without a DOM.

export type Group<T> = { category: string; items: T[] };

/**
 * `items` in groups by `category`, the groups in the order their first item appears and each
 * group's items in their own order. An item without a category goes to `fallback`.
 */
export function groupByCategory<T extends { category: string }>(
  items: readonly T[],
  fallback: string,
): Group<T>[] {
  const groups = new Map<string, T[]>();
  for (const item of items) {
    const name = item.category.trim() === '' ? fallback : item.category;
    const group = groups.get(name);
    if (group) group.push(item);
    else groups.set(name, [item]);
  }
  return [...groups].map(([category, grouped]) => ({ category, items: grouped }));
}

/** A group's name as its heading: a kit writes a category in small letters ("layout"). */
export function groupTitle(category: string): string {
  const name = category.trim();
  return name.slice(0, 1).toUpperCase() + name.slice(1);
}
