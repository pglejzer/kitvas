// What a frame tells the studio about one element, cut to the protocol's limits. No DOM here:
// `measure.ts` reads the page and hands the raw values to these functions.

import {
  type ElementSnapshot,
  MAX_ITEMS,
  MAX_STYLE,
  MAX_TEXT,
  parseFrameMessage,
} from '../../channel/protocol.ts';

/** The computed properties a snapshot carries, in this order. */
export const STYLE_PROPERTIES = [
  'color',
  'background-color',
  'font-size',
  'font-weight',
  'line-height',
  'padding',
  'margin',
  'border-width',
  'border-color',
  'border-radius',
  'gap',
  'display',
  'opacity',
] as const;

/** The largest size the protocol accepts. */
const MAX_SIZE = 1e6;

/** What the page gives for one `[data-ks]` element. */
export type RawElement = {
  id: string;
  width: number;
  height: number;
  text: string | null;
  /** A computed property's value, as `getComputedStyle(element).getPropertyValue` gives it. */
  read(name: string): string;
};

/** `text` cut to `max` UTF-16 units, never between the two halves of a surrogate pair. */
export function cut(text: string, max: number): string {
  if (text.length <= max) return text;
  const last = text.charCodeAt(max - 1);
  const splitsPair = last >= 0xd800 && last <= 0xdbff;
  return text.slice(0, splitsPair ? max - 1 : max);
}

/** An element's text: trimmed, white space runs as one space, cut to the protocol's limit. */
export function snapshotText(raw: string | null): string {
  return cut((raw ?? '').replace(/\s+/g, ' ').trim(), MAX_TEXT);
}

/** `name:value;` for each property of the list, cut to the protocol's limit. */
export function snapshotStyle(read: (name: string) => string): string {
  const pairs = STYLE_PROPERTIES.map((name) => `${name}:${read(name).trim()};`);
  return cut(pairs.join(''), MAX_STYLE);
}

/** A size in CSS pixels, rounded to 0.5 px, in the range the protocol accepts. */
export function snapshotSize(value: number): number {
  if (!Number.isFinite(value) || value <= 0) return 0;
  return Math.min(Math.round(value * 2) / 2, MAX_SIZE);
}

/** The protocol's own check, so an item the studio would refuse never goes out. */
function accepted(item: ElementSnapshot): boolean {
  const probe = { kitvas: 1, channel: 'probe', type: 'elements', request: 0, items: [item] };
  return parseFrameMessage(probe, 'probe') !== undefined;
}

/** One element as the protocol carries it; `undefined` when its id is not one the studio takes. */
export function toSnapshot(raw: RawElement): ElementSnapshot | undefined {
  const item: ElementSnapshot = {
    id: raw.id,
    width: snapshotSize(raw.width),
    height: snapshotSize(raw.height),
    text: snapshotText(raw.text),
    style: snapshotStyle(raw.read),
  };
  return accepted(item) ? item : undefined;
}

/**
 * The snapshots of `raws` in their order, at most `MAX_ITEMS`. An element whose id the studio
 * would refuse is left out. `raws` is read lazily: nothing past the limit is measured.
 */
export function takeSnapshots(raws: Iterable<RawElement>): ElementSnapshot[] {
  const items: ElementSnapshot[] = [];
  for (const raw of raws) {
    const item = toSnapshot(raw);
    if (item) items.push(item);
    if (items.length >= MAX_ITEMS) break;
  }
  return items;
}
