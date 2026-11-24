// The editor screen's panel rules (plan 15, task A; plan 18, task A): widths, folds, the rail of
// the left panel and the tabs of the right one, over plain numbers and strings, so they are tested
// without a DOM. `panels.ts` applies them to the page.

export type Side = 'left' | 'right';
export const SIDES: readonly Side[] = ['left', 'right'];
export type Mode = 'preview' | 'edit';

/** The studio's `--st-size-left` and `--st-size-right`. */
export const DEFAULT_WIDTH: Readonly<Record<Side, number>> = { left: 248, right: 312 };
export const MIN_SIDE = 220;
export const MAX_SIDE = 720;
/** A panel takes at most this share of the window. */
export const MAX_SHARE = 0.45;
/** The canvas keeps at least this much between the panels. */
export const MIN_CANVAS = 320;
/** The rail (`--st-size-rail`): the left panel's icons, and what a folded right panel becomes. */
export const RAIL = 52;
/** The gap around the islands in Cards (`--st-size-gap`). */
export const GAP = 10;
/** What the body holds besides the panels and the canvas: the rail, and in Cards five gaps. */
export const CHROME = RAIL + 5 * GAP;
/** What a folded panel keeps: the left one nothing (the rail stays beside it), the right a rail. */
export const FOLDED: Readonly<Record<Side, number>> = { left: 0, right: RAIL };
/** One arrow key on a grip. */
export const GRIP_STEP = 16;
/** Below 1100 px the panels open over the canvas; the same line as the skin's media queries. */
export const NARROW_QUERY = '(max-width: 1099.98px)';

/** The left panel's panes, in the rail's order (C8). */
export const LEFT_PANES = ['layers', 'insert', 'why', 'notes'] as const;

/**
 * A panel's width in a room `room` wide, beside the other panel's `other`: 220 at least; at most
 * 720, 45 % of the room, and what leaves the canvas 320. The minimum wins in a room too small.
 */
export function clampSide(width: number, room: number, other: number): number {
  const wanted = Number.isFinite(width) ? Math.round(width) : MIN_SIDE;
  const most =
    Number.isFinite(room) && room > 0
      ? Math.min(MAX_SIDE, Math.floor(room * MAX_SHARE), room - other - MIN_CANVAS)
      : MAX_SIDE;
  return Math.max(MIN_SIDE, Math.min(wanted, most));
}

export type SideFold = { width: number; folded: boolean };

/**
 * Both open widths in a room `room` wide (the window without the rail and the gaps, `CHROME`),
 * the left first; a folded panel counts as what it keeps (`FOLDED`).
 */
export function fitSides(sides: Record<Side, SideFold>, room: number): Record<Side, number> {
  const right = sides.right.folded ? FOLDED.right : sides.right.width;
  const left = clampSide(sides.left.width, room, right);
  return {
    left,
    right: clampSide(sides.right.width, room, sides.left.folded ? FOLDED.left : left),
  };
}

/**
 * The width a key asks for on a grip, before clamping; `null` for a key the grip leaves alone.
 * The arrows step 16 px outwards or inwards: the left panel widens to the right, the right one to
 * the left. Home and End go to the least and the most.
 */
export function gripKey(key: string, side: Side, width: number): number | null {
  const wider = side === 'left' ? 'ArrowRight' : 'ArrowLeft';
  const narrower = side === 'left' ? 'ArrowLeft' : 'ArrowRight';
  if (key === wider) return width + GRIP_STEP;
  if (key === narrower) return width - GRIP_STEP;
  if (key === 'Home') return MIN_SIDE;
  if (key === 'End') return MAX_SIDE;
  return null;
}

/** The width after dragging a grip `dx` pixels from where a drag of a `start` wide panel began. */
export function dragWidth(side: Side, start: number, dx: number): number {
  return side === 'left' ? start + dx : start - dx;
}

/** What the person set for a panel; `null` where they set nothing and the defaults decide. */
export type SideSetting = { width: number | null; folded: boolean | null };
export type Settings = Record<Side, SideSetting>;

/** What `localStorage` offers that the layout uses; a fake in tests. */
export type StorageLike = {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
};

/** The same key and the same shape as the screen before plan 18, so a stored layout still loads. */
export const LAYOUT_KEY = 'kitvas.editor.layout';

export function noSettings(): Settings {
  return { left: { width: null, folded: null }, right: { width: null, folded: null } };
}

function settingOf(value: unknown): SideSetting {
  if (typeof value !== 'object' || value === null) return { width: null, folded: null };
  const { width, folded } = value as Record<string, unknown>;
  const fits =
    typeof width === 'number' && Number.isFinite(width) && width >= MIN_SIDE && width <= MAX_SIDE;
  return {
    width: fits ? Math.round(width) : null,
    folded: typeof folded === 'boolean' ? folded : null,
  };
}

/** The viewer's settings; none when storage is missing, broken or holds something else. */
export function readSettings(storage: StorageLike | null): Settings {
  if (storage === null) return noSettings();
  try {
    const raw = storage.getItem(LAYOUT_KEY);
    if (raw === null) return noSettings();
    const parsed: unknown = JSON.parse(raw);
    if (typeof parsed !== 'object' || parsed === null) return noSettings();
    const { left, right } = parsed as Record<string, unknown>;
    return { left: settingOf(left), right: settingOf(right) };
  } catch {
    return noSettings();
  }
}

/** Keeps the settings for the next visit; `false` when storage is missing or refuses. */
export function writeSettings(storage: StorageLike | null, settings: Settings): boolean {
  if (storage === null) return false;
  try {
    storage.setItem(LAYOUT_KEY, JSON.stringify(settings));
    return true;
  } catch {
    return false;
  }
}

type ModePanels = Record<Side, { folded: boolean; tab: string }>;

/** How each mode wants the panels: Preview shows the checks, Edit the tree and the properties. */
export const MODE_DEFAULTS: Readonly<Record<Mode, ModePanels>> = {
  preview: { left: { folded: true, tab: 'layers' }, right: { folded: false, tab: 'checks' } },
  edit: { left: { folded: false, tab: 'layers' }, right: { folded: false, tab: 'properties' } },
};

/** A panel as the page opens in `mode`: the person's width and fold, else the defaults. */
export function openingSide(setting: SideSetting, side: Side, mode: Mode): SideFold {
  return {
    width: setting.width ?? DEFAULT_WIDTH[side],
    folded: setting.folded ?? MODE_DEFAULTS[mode][side].folded,
  };
}

/**
 * A panel's fold after a switch to `mode`. The person's fold wins. Otherwise a mode opens a panel
 * it wants open, and never folds one that is open: switching back and forth moves nothing.
 */
export function foldOnSwitch(
  setting: SideSetting,
  side: Side,
  mode: Mode,
  folded: boolean,
): boolean {
  if (setting.folded !== null) return setting.folded;
  return MODE_DEFAULTS[mode][side].folded ? folded : false;
}

/** The pane a panel shows in `mode`: the one last picked there, else the mode's; only real ones. */
export function tabFor(
  side: Side,
  mode: Mode,
  picked: string | undefined,
  tabs: readonly string[],
): string {
  if (picked !== undefined && tabs.includes(picked)) return picked;
  const wanted = MODE_DEFAULTS[mode][side].tab;
  return tabs.includes(wanted) ? wanted : (tabs[0] ?? wanted);
}

/** Ctrl/Cmd+\: both panels fold, unless both are folded already; then both open. */
export function foldBoth(folded: Record<Side, boolean>): boolean {
  return !(folded.left && folded.right);
}

/** The tab an arrow key, Home or End moves to in a row of tabs; `null` for any other key. */
export function nextTab(tabs: readonly string[], current: string, key: string): string | null {
  if (tabs.length === 0) return null;
  const at = Math.max(0, tabs.indexOf(current));
  if (key === 'Home') return tabs[0] ?? null;
  if (key === 'End') return tabs[tabs.length - 1] ?? null;
  if (key === 'ArrowRight') return tabs[(at + 1) % tabs.length] ?? null;
  if (key === 'ArrowLeft') return tabs[(at - 1 + tabs.length) % tabs.length] ?? null;
  return null;
}

/** The left panel as the rail shows it: the pane it holds, and whether it is open. */
export type RailView = { tab: string; open: boolean };

/** A rail button is pressed when its pane is the one shown in an open panel: one at a time. */
export function railPressed(pane: string, view: RailView): boolean {
  return view.open && view.tab === pane;
}

/**
 * What a click on a rail button asks for: the panel open on its pane. A click on the pane already
 * shown folds the panel, as an editor's activity bar does.
 */
export function railClick(pane: string, view: RailView): RailView {
  if (railPressed(pane, view)) return { tab: pane, open: false };
  return { tab: pane, open: true };
}

/**
 * The side whose panel holds `pane` (`[data-open-pane]` in the bar, C8), the left first; `null`
 * for a pane the page lacks (Sketches outside a craft draft).
 */
export function sideOfPane(
  pane: string | undefined,
  panes: Readonly<Record<Side, readonly string[]>>,
): Side | null {
  if (pane === undefined || pane === '') return null;
  return SIDES.find((side) => panes[side].includes(pane)) ?? null;
}
