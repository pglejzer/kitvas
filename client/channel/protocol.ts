// Messages between a studio page and a prototype frame. Both sides check every message they get.
// Nothing secret goes through here: the channel id only tells two frames on one page apart.
// The example frames of the kit page only send `example`; the studio sends them nothing.
// The editor's messages are in `edit-protocol.ts` and the editor screen's canvas messages in
// `canvas-protocol.ts`; the two parsers here hand them over.

import {
  CANVAS_FRAME_TYPES,
  CANVAS_STUDIO_TYPES,
  type CanvasFrameMessage,
  type CanvasStudioMessage,
  parseCanvasFrame,
  parseCanvasStudio,
} from './canvas-protocol.ts';
import {
  EDIT_FRAME_TYPES,
  EDIT_STUDIO_TYPES,
  type EditFrameMessage,
  type EditStudioMessage,
  parseEditFrame,
  parseEditStudio,
} from './edit-protocol.ts';
import {
  LIVE_FRAME_TYPES,
  LIVE_STUDIO_TYPES,
  type LiveFrameMessage,
  type LiveStudioMessage,
  parseLiveFrame,
  parseLiveStudio,
} from './live-protocol.ts';

/** `#kitvas=<channel>&studio=<port>` at the end of a frame's address turns the channel on. */
const HASH =
  /^#kitvas=([A-Za-z0-9_-]{16,64})&studio=([1-9][0-9]{0,4})(?:&scroll=([0-9]{1,7}),([0-9]{1,7}))?$/;
const ELEMENT_ID = /^[A-Za-z0-9_.:/-]{1,200}$/;
const STATE_ID = /^[a-z][a-z0-9-]{0,62}$/;

export const MAX_ITEMS = 2000;
export const MAX_TEXT = 200;
export const MAX_STYLE = 600;
/** The largest width or height, in CSS pixels, a message may carry. */
export const MAX_SIZE = 1e6;
/** The most elements one `flash` names: more rings at once than this point at nothing. */
export const MAX_FLASH = 24;

/** The elements one `flash` names: each id once, the first `MAX_FLASH` (a longer list is refused). */
export function flashIds(ids: readonly string[]): string[] {
  return [...new Set(ids)].slice(0, MAX_FLASH);
}

export type Tone = 'fix' | 'review' | 'changed' | 'added';
export type Mark = { id: string; label: string; tone: Tone };
export type ElementSnapshot = {
  id: string;
  width: number;
  height: number;
  text: string;
  style: string;
};

/**
 * How a frame answers a `swap` whose build is not in its page (ADR 0058). `held`: a gesture runs,
 * and the frame says `free` when it ends. `free`: the studio may ask again. `failed`: the frame
 * cannot take the build in place, so the studio loads the page again.
 */
export const SWAP_STEPS = ['held', 'free', 'failed'] as const;
export type SwapStep = (typeof SWAP_STEPS)[number];

export type FrameMessage =
  /** `live`: the build a `swap` asked for is in the page now; absent after a load. */
  | { kitvas: 1; channel: string; type: 'ready'; state: string; live?: number }
  | { kitvas: 1; channel: string; type: 'elements'; request: number; items: ElementSnapshot[] }
  | { kitvas: 1; channel: string; type: 'shown'; state: string }
  | { kitvas: 1; channel: string; type: 'example'; shown: boolean; height: number }
  /**
   * The answer to a `swap` that did not end in `ready`. `scroll`: where the page is scrolled, sent
   * with `failed` so the page loaded again opens there.
   */
  | { kitvas: 1; channel: string; type: 'swap'; live: number; step: SwapStep; scroll?: Scroll }
  | EditFrameMessage
  | CanvasFrameMessage
  | LiveFrameMessage;

/** The studio's theme as a frame hears it: the one that shows, never "system". */
export const FRAME_THEMES = ['light', 'dark'] as const;
export type FrameTheme = (typeof FRAME_THEMES)[number];

/** The studio's accents (the same words as `VIEW_ACCENTS` of the settings). */
export const FRAME_ACCENTS = ['copper', 'teal', 'coral', 'rose'] as const;
export type FrameAccent = (typeof FRAME_ACCENTS)[number];

export type StudioMessage =
  | { kitvas: 1; channel: string; type: 'measure'; request: number }
  /** The studio's theme and accent, by name: the frame's own table has the colours. */
  | { kitvas: 1; channel: string; type: 'tones'; theme: FrameTheme; accent: FrameAccent }
  /** A change was just applied to these elements: a ring flashes once on each (ADR 0057). */
  | { kitvas: 1; channel: string; type: 'flash'; ids: string[] }
  | { kitvas: 1; channel: string; type: 'state'; state: string }
  | { kitvas: 1; channel: string; type: 'marks'; marks: Mark[] }
  /**
   * Take the build on disk into the page as it is, without loading the page again (ADR 0058).
   * `live` numbers the build; the frame answers `ready` with it, or `swap` with a step.
   */
  | { kitvas: 1; channel: string; type: 'swap'; live: number }
  | EditStudioMessage
  | CanvasStudioMessage
  | LiveStudioMessage;

/** How far a page is scrolled, in CSS pixels. */
export type Scroll = { x: number; y: number };

/** The farthest scroll, in CSS pixels, a message or an address may carry. */
export const MAX_SCROLL = 1e6;

/** A scroll as whole, non-negative numbers within `MAX_SCROLL`; `undefined` for anything else. */
export function cleanScroll(x: unknown, y: unknown): Scroll | undefined {
  if (typeof x !== 'number' || typeof y !== 'number') return undefined;
  if (!Number.isFinite(x) || !Number.isFinite(y)) return undefined;
  const clamp = (value: number): number => Math.min(MAX_SCROLL, Math.max(0, Math.round(value)));
  return { x: clamp(x), y: clamp(y) };
}

/** `scroll`, when given, makes the page open there (`&scroll=<x>,<y>`). */
export function frameHash(channel: string, studioPort: number, scroll?: Scroll): string {
  const base = `#kitvas=${channel}&studio=${studioPort}`;
  const where = scroll ? cleanScroll(scroll.x, scroll.y) : undefined;
  return where ? `${base}&scroll=${where.x},${where.y}` : base;
}

export function readHash(
  hash: string,
): { channel: string; studioPort: number; scroll?: Scroll } | undefined {
  const match = HASH.exec(hash);
  if (!match?.[1] || !match[2]) return undefined;
  const studioPort = Number(match[2]);
  if (studioPort > 65535) return undefined;
  const scroll =
    match[3] !== undefined && match[4] !== undefined
      ? cleanScroll(Number(match[3]), Number(match[4]))
      : undefined;
  return scroll ? { channel: match[1], studioPort, scroll } : { channel: match[1], studioPort };
}

/** `hash` with its scroll set to `scroll`; the same when `hash` is no frame hash. */
export function withScroll(hash: string, scroll: Scroll): string {
  const link = readHash(hash);
  return link ? frameHash(link.channel, link.studioPort, scroll) : hash;
}

type Loose = Record<string, unknown>;

const isObject = (value: unknown): value is Loose =>
  typeof value === 'object' && value !== null && !Array.isArray(value);
const isText = (value: unknown, max: number): value is string =>
  typeof value === 'string' && value.length <= max;
const isCount = (value: unknown): value is number =>
  typeof value === 'number' && Number.isInteger(value) && value >= 0 && value <= 1e9;
const isSize = (value: unknown): value is number =>
  typeof value === 'number' && Number.isFinite(value) && value >= 0 && value <= MAX_SIZE;

function ours(data: unknown, channel: string): Loose | undefined {
  return isObject(data) && data.kitvas === 1 && data.channel === channel ? data : undefined;
}

function snapshot(value: unknown): ElementSnapshot | undefined {
  if (!isObject(value)) return undefined;
  const { id, width, height, text, style } = value;
  if (typeof id !== 'string' || !ELEMENT_ID.test(id)) return undefined;
  if (!isSize(width) || !isSize(height)) return undefined;
  if (!isText(text, MAX_TEXT) || !isText(style, MAX_STYLE)) return undefined;
  return { id, width, height, text, style };
}

function mark(value: unknown): Mark | undefined {
  if (!isObject(value)) return undefined;
  const { id, label, tone } = value;
  if (typeof id !== 'string' || !ELEMENT_ID.test(id) || !isText(label, 8)) return undefined;
  if (tone !== 'fix' && tone !== 'review' && tone !== 'changed' && tone !== 'added')
    return undefined;
  return { id, label, tone };
}

/** What the studio accepts from a frame; `undefined` for anything else. */
export function parseFrameMessage(data: unknown, channel: string): FrameMessage | undefined {
  const message = ours(data, channel);
  if (!message) return undefined;
  if (typeof message.type === 'string' && EDIT_FRAME_TYPES.has(message.type)) {
    return parseEditFrame(message, channel);
  }
  if (typeof message.type === 'string' && CANVAS_FRAME_TYPES.has(message.type)) {
    return parseCanvasFrame(message, channel);
  }
  if (typeof message.type === 'string' && LIVE_FRAME_TYPES.has(message.type)) {
    return parseLiveFrame(message, channel);
  }
  if (message.type === 'ready' || message.type === 'shown') {
    const { state, live } = message;
    if (typeof state !== 'string' || !STATE_ID.test(state)) return undefined;
    // Only a `ready` that answers a `swap` names a build.
    if (message.type === 'ready' && live !== undefined) {
      return isCount(live) ? { kitvas: 1, channel, type: 'ready', state, live } : undefined;
    }
    return { kitvas: 1, channel, type: message.type, state };
  }
  if (message.type === 'swap') {
    const { live } = message;
    const step = SWAP_STEPS.find((name) => name === message.step);
    if (!isCount(live) || !step) return undefined;
    // A scroll that is no number is left out: the answer still counts.
    const scroll = isObject(message.scroll)
      ? cleanScroll(message.scroll.x, message.scroll.y)
      : undefined;
    return scroll
      ? { kitvas: 1, channel, type: 'swap', live, step, scroll }
      : { kitvas: 1, channel, type: 'swap', live, step };
  }
  if (message.type === 'elements') {
    const { request, items } = message;
    if (!isCount(request) || !Array.isArray(items) || items.length > MAX_ITEMS) return undefined;
    const parsed = items.map(snapshot);
    if (parsed.some((item) => item === undefined)) return undefined;
    return { kitvas: 1, channel, type: 'elements', request, items: parsed as ElementSnapshot[] };
  }
  if (message.type === 'example') {
    const { shown, height } = message;
    if (typeof shown !== 'boolean' || !isSize(height)) return undefined;
    return { kitvas: 1, channel, type: 'example', shown, height };
  }
  return undefined;
}

/** What a frame accepts from the studio; `undefined` for anything else. */
export function parseStudioMessage(data: unknown, channel: string): StudioMessage | undefined {
  const message = ours(data, channel);
  if (!message) return undefined;
  if (typeof message.type === 'string' && EDIT_STUDIO_TYPES.has(message.type)) {
    return parseEditStudio(message, channel);
  }
  if (typeof message.type === 'string' && CANVAS_STUDIO_TYPES.has(message.type)) {
    return parseCanvasStudio(message, channel);
  }
  if (typeof message.type === 'string' && LIVE_STUDIO_TYPES.has(message.type)) {
    return parseLiveStudio(message, channel);
  }
  if (message.type === 'measure') {
    return isCount(message.request)
      ? { kitvas: 1, channel, type: 'measure', request: message.request }
      : undefined;
  }
  if (message.type === 'state') {
    const { state } = message;
    return typeof state === 'string' && STATE_ID.test(state)
      ? { kitvas: 1, channel, type: 'state', state }
      : undefined;
  }
  if (message.type === 'tones') {
    const theme = FRAME_THEMES.find((name) => name === message.theme);
    const accent = FRAME_ACCENTS.find((name) => name === message.accent);
    return theme && accent ? { kitvas: 1, channel, type: 'tones', theme, accent } : undefined;
  }
  if (message.type === 'swap') {
    return isCount(message.live)
      ? { kitvas: 1, channel, type: 'swap', live: message.live }
      : undefined;
  }
  if (message.type === 'flash') {
    const { ids } = message;
    if (!Array.isArray(ids) || ids.length > MAX_FLASH) return undefined;
    const checked = ids.filter((id): id is string => typeof id === 'string' && ELEMENT_ID.test(id));
    return checked.length === ids.length
      ? { kitvas: 1, channel, type: 'flash', ids: checked }
      : undefined;
  }
  if (message.type === 'marks') {
    const { marks } = message;
    if (!Array.isArray(marks) || marks.length > MAX_ITEMS) return undefined;
    const parsed = marks.map(mark);
    if (parsed.some((item) => item === undefined)) return undefined;
    return { kitvas: 1, channel, type: 'marks', marks: parsed as Mark[] };
  }
  return undefined;
}
