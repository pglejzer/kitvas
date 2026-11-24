// A duplicated list item must not repeat a React `key` (spec 4d, goal 8). An item that carries a
// literal `key: 'x'` of its own gets `'x-2'` in the copy (`-3`, … while the name is taken). A key
// read from another field of the item is left as it is: the person decides, and the panel says so.

import type { ArrayView, ItemView } from './find.ts';
import { encodeString, stringAt, tokenSpan, valueToken } from './text.ts';

/** The property whose literal string an item carries as its React key. */
export const KEY_FIELD = 'key';

/** The key of `item`, when it is an object literal with a literal `key: '…'`. */
function keyOf(array: ArrayView, item: ItemView): string | null {
  const token = valueToken(array, item, KEY_FIELD);
  return token === null ? null : stringAt(array.reader, token);
}

/**
 * The text of `item` for its copy: the same text with a free key. The text of an item without a
 * literal key is returned as written.
 */
export function copyText(text: string, array: ArrayView, item: ItemView): string {
  const own = text.slice(item.span.start, item.span.end);
  const token = valueToken(array, item, KEY_FIELD);
  const key = token === null ? null : stringAt(array.reader, token);
  if (token === null || key === null) return own;
  const taken = new Set(array.items.map((each) => keyOf(array, each)));
  let n = 2;
  while (taken.has(`${key}-${n}`)) n += 1;
  const span = tokenSpan(array.reader, token);
  const written = encodeString(`${key}-${n}`, text.charAt(span.start));
  const from = span.start - item.span.start;
  return own.slice(0, from) + written + own.slice(span.end - item.span.start);
}
