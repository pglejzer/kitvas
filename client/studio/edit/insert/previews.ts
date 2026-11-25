// What the Insert pane decides about previews and tabs, pure and tested without a DOM: which
// preview a component has, where an icon sits on the sheet, when to ask the palette again, which
// tab shows and the tab the person picked (kept for the browser tab).

import type { Palette } from '../../../../src/studio/api/edit/structure-schemas.ts';

export type Previews = Palette['previews'];
export type IconSheet = NonNullable<Previews['icons']>;

/** Ask again every this many milliseconds while previews are being made. */
export const POLL_MS = 2000;
/** ... and at most this many times. */
export const POLL_MAX = 45;
/** The size a glyph tile draws an icon at. */
export const GLYPH_PX = 24;

/** The preview image address of a component; `null` when it has none. */
export function previewOf(previews: Previews | undefined, name: string): string | null {
  const address = previews?.components[name];
  return address === undefined || address === '' ? null : address;
}

/** What a tile's preview box shows: the image, a still skeleton while making, or the name. */
export type PreviewState = { kind: 'image'; src: string } | { kind: 'making' } | { kind: 'none' };

export function previewState(previews: Previews | undefined, name: string): PreviewState {
  const src = previewOf(previews, name);
  if (src !== null) return { kind: 'image', src };
  return previews?.state === 'making' ? { kind: 'making' } : { kind: 'none' };
}

/** Where an icon is on its sheet, scaled to `size` px a cell: the background offset and width. */
export type GlyphBox = { x: number; y: number; width: number };

export function glyphBox(sheet: IconSheet | null, name: string, size = GLYPH_PX): GlyphBox | null {
  if (sheet === null || sheet.columns < 1 || sheet.cell < 1) return null;
  const index = sheet.names.indexOf(name);
  if (index === -1) return null;
  const scale = size / sheet.cell;
  const x = (index % sheet.columns) * sheet.cell;
  const y = Math.floor(index / sheet.columns) * sheet.cell;
  return { x: -x * scale, y: -y * scale, width: sheet.columns * size };
}

/** The names with a glyph on the sheet, and the ones that fall back to text chips; order kept. */
export function splitIcons(
  names: readonly string[],
  sheet: IconSheet | null,
): { glyphs: string[]; chips: string[] } {
  const glyphs: string[] = [];
  const chips: string[] = [];
  for (const name of names) {
    (glyphBox(sheet, name) === null ? chips : glyphs).push(name);
  }
  return { glyphs, chips };
}

/** Ask the palette again only while previews are being made and the cap is not reached. */
export function pollDecision(
  state: Previews['state'] | undefined,
  asked: number,
): 'again' | 'stop' {
  return state === 'making' && asked < POLL_MAX ? 'again' : 'stop';
}

/** The pane's tabs, in the order of the tab row. */
export const TABS = ['components', 'sections', 'icons', 'images'] as const;
export type TabId = (typeof TABS)[number];

/** How many things each tab has under the search; the Images tab is not searched. */
export type TabCounts = Record<'components' | 'sections' | 'icons', number>;

/**
 * The tab that shows: the picked one, except while the search has text and the picked tab has no
 * hit: then the first tab with hits (the Images tab never has hits). With no hit anywhere the
 * picked tab stays.
 */
export function shownTab(picked: TabId, counts: TabCounts, searching: boolean): TabId {
  if (!searching || picked === 'images' || counts[picked] > 0) return picked;
  return TABS.find((tab) => tab !== 'images' && counts[tab] > 0) ?? picked;
}

/** The tab after an arrow key from `from` (wraps round); `null` for any other key. */
export function arrowTab(from: TabId, key: string): TabId | null {
  const at = TABS.indexOf(from);
  if (key === 'ArrowRight') return TABS[(at + 1) % TABS.length] ?? null;
  if (key === 'ArrowLeft') return TABS[(at + TABS.length - 1) % TABS.length] ?? null;
  if (key === 'Home') return TABS[0] ?? null;
  if (key === 'End') return TABS[TABS.length - 1] ?? null;
  return null;
}

/** The part of `sessionStorage` the tab memory uses; replaceable in tests. */
export type TabStorage = {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
};

export const TAB_KEY = 'kitvas.insert.tab';

/** The browser tab's storage, or `null` where reading it throws (blocked site data, a sandbox). */
export function tabStorage(): TabStorage | null {
  try {
    return typeof sessionStorage === 'undefined' ? null : sessionStorage;
  } catch {
    return null;
  }
}

/** The tab a stored value names; missing, throwing or junk storage is Components. */
export function readTab(storage: TabStorage | null): TabId {
  try {
    const raw = storage?.getItem(TAB_KEY) ?? null;
    return TABS.find((tab) => tab === raw) ?? 'components';
  } catch {
    return 'components';
  }
}

export function writeTab(storage: TabStorage | null, tab: TabId): void {
  try {
    storage?.setItem(TAB_KEY, tab);
  } catch {
    // Without storage the choice is not kept; nothing else depends on it.
  }
}
