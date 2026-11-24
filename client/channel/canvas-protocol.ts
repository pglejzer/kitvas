// The editor screen's canvas messages between the draft page and a prototype frame (plan 15, C1).
// They work in Preview and in Edit. A frame takes the pointer and the keys while the person is over
// it, so it forwards what belongs to the screen: the zoom wheel (Ctrl or Cmd with the wheel, and a
// pinch, which arrives as one), Space for panning, and the screen's own keys. The page asks where
// an element is, for "zoom to selection". `protocol.ts` hands these types to its parsers.

/** The screen's keys, the same in the page and in a frame (`shellKeyOf`). */
export const SHELL_KEYS = [
  'fit',
  'selection',
  'actual',
  'fold-left',
  'fold-right',
  'fold-both',
  'shortcuts',
] as const;
export type ShellKey = (typeof SHELL_KEYS)[number];

/** What `shellKeyOf` reads of a keyboard event; a plain object in tests. */
export type ShellKeyLike = {
  key: string;
  code: string;
  ctrlKey: boolean;
  metaKey: boolean;
  altKey: boolean;
  shiftKey: boolean;
};

/**
 * The screen key an event is, or `null`:
 * - Shift+1 fits the card to the canvas, Shift+2 zooms to the selection (by `code`, so the
 *   shifted character of the keyboard layout does not matter);
 * - Ctrl/Cmd+0 is 100 %;
 * - `[` and `]` fold the left and the right panel, Ctrl/Cmd+\ folds or opens both;
 * - `?` opens the list of shortcuts.
 * The caller skips events typed into a field.
 */
export function shellKeyOf(event: ShellKeyLike): ShellKey | null {
  if (event.altKey) return null;
  const command = event.ctrlKey || event.metaKey;
  if (command) {
    if (event.shiftKey) return null;
    if (event.key === '0') return 'actual';
    if (event.key === '\\') return 'fold-both';
    return null;
  }
  if (event.shiftKey && event.code === 'Digit1') return 'fit';
  if (event.shiftKey && event.code === 'Digit2') return 'selection';
  if (event.key === '?') return 'shortcuts';
  if (event.shiftKey) return null;
  if (event.key === '[') return 'fold-left';
  if (event.key === ']') return 'fold-right';
  return null;
}

type Head = { kitvas: 1; channel: string };

/** A box in the frame's viewport, in CSS pixels. */
export type FrameBox = { x: number; y: number; width: number; height: number };

export type CanvasFrameMessage = Head &
  (
    | /** Ctrl/Cmd+wheel or a pinch over the frame; `x`, `y` in the frame's viewport pixels. */
    {
        type: 'zoom-wheel';
        x: number;
        y: number;
        deltaY: number;
      } /** Space went down or up while the frame had the keys (Edit mode only, not in a field). */
    | {
        type: 'space';
        down: boolean;
      } /** A screen key pressed while the frame had the keys, not in a field. */
    | {
        type: 'shell-key';
        key: ShellKey;
      } /** The answer to `locate`: the element scrolled into view, or `null` when it is not there. */
    | { type: 'located'; request: number; box: FrameBox | null }
    /** The page in the frame scrolled; `ratio` 0 is the top, 1 the bottom (compare scrolls both). */
    | { type: 'scrolled'; ratio: number }
  );

export type CanvasStudioMessage = Head &
  (
    | { type: 'locate'; request: number; id: string }
    /** The canvas zoom, so the frame keeps its element labels one size on the screen. */
    | { type: 'zoom'; value: number }
    /** Scroll the page in the frame to `ratio` (0 top, 1 bottom): the other side of a compare. */
    | { type: 'scroll-to'; ratio: number }
  );

export const CANVAS_FRAME_TYPES = new Set([
  'zoom-wheel',
  'space',
  'shell-key',
  'located',
  'scrolled',
]);
export const CANVAS_STUDIO_TYPES = new Set(['locate', 'zoom', 'scroll-to']);
/** A `zoom` value outside this is refused (the canvas keeps 0.1 to 4). */
export const MIN_SCALE = 0.05;
export const MAX_SCALE = 8;

/** Frame coordinates and sizes stay inside this, in CSS pixels. */
export const MAX_CANVAS_PX = 100_000;
/** A wheel step larger than this is cut to it. */
export const MAX_DELTA = 10_000;

type Loose = Record<string, unknown>;

const ELEMENT_ID = /^[A-Za-z0-9_.:/$-]{1,200}$/;
const isObject = (value: unknown): value is Loose =>
  typeof value === 'object' && value !== null && !Array.isArray(value);
const isCoordinate = (value: unknown): value is number =>
  typeof value === 'number' && Number.isFinite(value) && Math.abs(value) <= MAX_CANVAS_PX;
const isSize = (value: unknown): value is number =>
  typeof value === 'number' && Number.isFinite(value) && value >= 0 && value <= MAX_CANVAS_PX;
const isRequest = (value: unknown): value is number =>
  typeof value === 'number' && Number.isInteger(value) && value >= 0 && value <= 1e9;
const isRatio = (value: unknown): value is number =>
  typeof value === 'number' && Number.isFinite(value) && value >= 0 && value <= 1;
const isShellKey = (value: unknown): value is ShellKey =>
  typeof value === 'string' && (SHELL_KEYS as readonly string[]).includes(value);

function frameBox(value: unknown): FrameBox | null | undefined {
  if (value === null) return null;
  if (!isObject(value)) return undefined;
  const { x, y, width, height } = value;
  if (!isCoordinate(x) || !isCoordinate(y) || !isSize(width) || !isSize(height)) return undefined;
  return { x, y, width, height };
}

/** A canvas message from a frame, already known to be on `channel`; `undefined` for a bad one. */
export function parseCanvasFrame(message: Loose, channel: string): CanvasFrameMessage | undefined {
  const head: Head = { kitvas: 1, channel };
  switch (message.type) {
    case 'zoom-wheel': {
      const { x, y, deltaY } = message;
      if (!isCoordinate(x) || !isCoordinate(y)) return undefined;
      if (typeof deltaY !== 'number' || !Number.isFinite(deltaY)) return undefined;
      const cut = Math.max(-MAX_DELTA, Math.min(MAX_DELTA, deltaY));
      return { ...head, type: 'zoom-wheel', x, y, deltaY: cut };
    }
    case 'space':
      return typeof message.down === 'boolean'
        ? { ...head, type: 'space', down: message.down }
        : undefined;
    case 'shell-key':
      return isShellKey(message.key) ? { ...head, type: 'shell-key', key: message.key } : undefined;
    case 'located': {
      const { request } = message;
      const box = frameBox(message.box);
      if (!isRequest(request) || box === undefined) return undefined;
      return { ...head, type: 'located', request, box };
    }
    case 'scrolled':
      return isRatio(message.ratio)
        ? { ...head, type: 'scrolled', ratio: message.ratio }
        : undefined;
    default:
      return undefined;
  }
}

/** A canvas message from the page, already known to be on `channel`; `undefined` for a bad one. */
export function parseCanvasStudio(
  message: Loose,
  channel: string,
): CanvasStudioMessage | undefined {
  if (message.type === 'zoom') {
    const { value } = message;
    const fine =
      typeof value === 'number' &&
      Number.isFinite(value) &&
      value >= MIN_SCALE &&
      value <= MAX_SCALE;
    return fine ? { kitvas: 1, channel, type: 'zoom', value } : undefined;
  }
  if (message.type === 'scroll-to') {
    return isRatio(message.ratio)
      ? { kitvas: 1, channel, type: 'scroll-to', ratio: message.ratio }
      : undefined;
  }
  if (message.type !== 'locate') return undefined;
  const { request, id } = message;
  if (!isRequest(request) || typeof id !== 'string' || !ELEMENT_ID.test(id)) return undefined;
  return { kitvas: 1, channel, type: 'locate', request, id };
}

/** Whether a page message is a canvas one (the frame runtime routes it to `canvas.ts`). */
export function isCanvasStudio(message: { type: string }): message is CanvasStudioMessage {
  return CANVAS_STUDIO_TYPES.has(message.type);
}

/** Whether a frame message is a canvas one (the page routes it to the canvas module). */
export function isCanvasFrame(message: { type: string }): message is CanvasFrameMessage {
  return CANVAS_FRAME_TYPES.has(message.type);
}
