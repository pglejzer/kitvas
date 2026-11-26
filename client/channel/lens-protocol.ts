// The lens pins of the canvas (redesign spec, goal 9; plan 19, tasks 0 and 1): what the studio page
// asks a frame to draw over the draft for the lens that is on, and the one thing a frame says back,
// a click on a pin. A pin's texts are data: a frame writes them with `textContent`, and a tone is a
// name of the frame's own table (`client/frame/tones/tones.ts`), never a colour. Both sides read a
// message with the reader of its direction, which answers `undefined` for anything odd, as
// `live-protocol.ts` does.

import { isRecord as isObject } from '../../src/shared/values/guards.ts';

export const PIN_KINDS = ['kit', 'check', 'why', 'change'] as const;
export type PinKind = (typeof PIN_KINDS)[number];

/** `plain` draws no dot before the text. */
export const PIN_TONES = ['fix', 'review', 'good', 'plain'] as const;
export type PinTone = (typeof PIN_TONES)[number];

/** More pins than this are not sent; the lens pill says how many were left out. */
export const MAX_PINS = 200;
export const MAX_PIN_KEY = 120;
export const MAX_PIN_TEXT = 80;
export const MAX_PIN_SMALL = 160;
export const MAX_PIN_CODE = 24;

export type LensPin = {
  /** Unique among the pins sent; a click reports it back. */
  key: string;
  /** The element it sits on: the first one in the page that carries the id. */
  id: string;
  kind: PinKind;
  tone: PinTone;
  /** A word in the code face before the text: a property or a token. */
  code?: string;
  text: string;
  /** A second, quiet line; a pin with one is a card that wraps (Why). */
  small?: string;
  /** A dashed outline around the element (Changes). */
  outline?: boolean;
};

/** Studio to frame: the pins of the lens that is on; `[]` takes them all away. */
export type LensStudioBody = { type: 'lens-pins'; pins: LensPin[] };

/** Frame to studio: the person clicked the pin with this key. */
export type LensFrameBody = { type: 'pin'; key: string };

type Head = { kitvas: 1; channel: string };
export type LensStudioMessage = Head & LensStudioBody;
export type LensFrameMessage = Head & LensFrameBody;

type Loose = Record<string, unknown>;

/** The element ids the other protocols take (`live-protocol.ts`). */
const ELEMENT_ID = /^[A-Za-z0-9_.:/$-]{1,200}$/;
/** A key is a short name made by the page: an element id's characters and `#`. */
const PIN_KEY = new RegExp(`^[A-Za-z0-9_.:/$#-]{1,${MAX_PIN_KEY}}$`);

/** A text of one to `max` characters. */
const isWords = (value: unknown, max: number): value is string =>
  typeof value === 'string' && value.length > 0 && value.length <= max;
const oneOf = <T extends string>(list: readonly T[], value: unknown): value is T =>
  typeof value === 'string' && (list as readonly string[]).includes(value);
/** An optional text: `undefined` when it is left out, `null` when it is there and odd. */
const optional = (value: unknown, max: number): string | undefined | null => {
  if (value === undefined) return undefined;
  return isWords(value, max) ? value : null;
};

/** Words for a pin: on one line, trimmed, and cut to `max` characters with an ellipsis. */
export function fit(words: string, max: number): string {
  const line = words.replace(/\s+/g, ' ').trim();
  return line.length <= max ? line : `${line.slice(0, max - 1).trimEnd()}…`;
}

/** Whether `key` may name a pin: the page checks its own keys with this before it sends them. */
export const isPinKey = (key: unknown): key is string =>
  typeof key === 'string' && PIN_KEY.test(key);

/** One pin as a frame takes it; `undefined` when any part is odd. Other fields are left out. */
export function readLensPin(value: unknown): LensPin | undefined {
  if (!isObject(value)) return undefined;
  const { key, id, kind, tone, code, text, small, outline } = value;
  if (!isPinKey(key) || typeof id !== 'string' || !ELEMENT_ID.test(id)) return undefined;
  if (!oneOf(PIN_KINDS, kind) || !oneOf(PIN_TONES, tone) || !isWords(text, MAX_PIN_TEXT)) {
    return undefined;
  }
  const word = optional(code, MAX_PIN_CODE);
  const line = optional(small, MAX_PIN_SMALL);
  if (word === null || line === null) return undefined;
  if (outline !== undefined && outline !== true && outline !== false) return undefined;
  return {
    key,
    id,
    kind,
    tone,
    text,
    ...(word === undefined ? {} : { code: word }),
    ...(line === undefined ? {} : { small: line }),
    ...(outline === true || outline === false ? { outline } : {}),
  };
}

function ours(data: unknown, channel: string): Loose | undefined {
  return isObject(data) && data.kitvas === 1 && data.channel === channel ? data : undefined;
}

/**
 * A lens message from the page on `channel`; `undefined` for any other message or a bad one. More
 * than `MAX_PINS` pins, one odd pin or two pins with one key refuse the whole message.
 */
export function readLensStudio(data: unknown, channel: string): LensStudioMessage | undefined {
  const message = ours(data, channel);
  if (message?.type !== 'lens-pins') return undefined;
  const { pins } = message;
  if (!Array.isArray(pins) || pins.length > MAX_PINS) return undefined;
  const read: LensPin[] = [];
  const keys = new Set<string>();
  for (const one of pins) {
    const pin = readLensPin(one);
    if (!pin || keys.has(pin.key)) return undefined;
    keys.add(pin.key);
    read.push(pin);
  }
  return { kitvas: 1, channel, type: 'lens-pins', pins: read };
}

/** A lens message from a frame on `channel`: a click on a pin; `undefined` for anything else. */
export function readLensFrame(data: unknown, channel: string): LensFrameMessage | undefined {
  const message = ours(data, channel);
  if (message?.type !== 'pin' || !isPinKey(message.key)) return undefined;
  return { kitvas: 1, channel, type: 'pin', key: message.key };
}
