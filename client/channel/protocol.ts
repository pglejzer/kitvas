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
const HASH = /^#kitvas=([A-Za-z0-9_-]{16,64})&studio=([1-9][0-9]{0,4})$/;
const ELEMENT_ID = /^[A-Za-z0-9_.:/-]{1,200}$/;
const STATE_ID = /^[a-z][a-z0-9-]{0,62}$/;

export const MAX_ITEMS = 2000;
export const MAX_TEXT = 200;
export const MAX_STYLE = 600;
/** The largest width or height, in CSS pixels, a message may carry. */
export const MAX_SIZE = 1e6;

export type Tone = 'fix' | 'review' | 'changed' | 'added';
export type Mark = { id: string; label: string; tone: Tone };
export type ElementSnapshot = {
  id: string;
  width: number;
  height: number;
  text: string;
  style: string;
};

export type FrameMessage =
  | { kitvas: 1; channel: string; type: 'ready'; state: string }
  | { kitvas: 1; channel: string; type: 'elements'; request: number; items: ElementSnapshot[] }
  | { kitvas: 1; channel: string; type: 'shown'; state: string }
  | { kitvas: 1; channel: string; type: 'example'; shown: boolean; height: number }
  | EditFrameMessage
  | CanvasFrameMessage
  | LiveFrameMessage;

export type StudioMessage =
  | { kitvas: 1; channel: string; type: 'measure'; request: number }
  | { kitvas: 1; channel: string; type: 'state'; state: string }
  | { kitvas: 1; channel: string; type: 'marks'; marks: Mark[] }
  | EditStudioMessage
  | CanvasStudioMessage
  | LiveStudioMessage;

export function frameHash(channel: string, studioPort: number): string {
  return `#kitvas=${channel}&studio=${studioPort}`;
}

export function readHash(hash: string): { channel: string; studioPort: number } | undefined {
  const match = HASH.exec(hash);
  if (!match?.[1] || !match[2]) return undefined;
  const studioPort = Number(match[2]);
  return studioPort <= 65535 ? { channel: match[1], studioPort } : undefined;
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
    const { state } = message;
    if (typeof state !== 'string' || !STATE_ID.test(state)) return undefined;
    return { kitvas: 1, channel, type: message.type, state };
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
  if (message.type === 'marks') {
    const { marks } = message;
    if (!Array.isArray(marks) || marks.length > MAX_ITEMS) return undefined;
    const parsed = marks.map(mark);
    if (parsed.some((item) => item === undefined)) return undefined;
    return { kitvas: 1, channel, type: 'marks', marks: parsed as Mark[] };
  }
  return undefined;
}
