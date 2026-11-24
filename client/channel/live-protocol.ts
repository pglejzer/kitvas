// Stage 4c's frame messages (plan 16, C3): forced states, live measurements and the accessibility
// card, between the draft page and a prototype frame. `protocol.ts` hands these types to its
// parsers, as it does the canvas messages. They work in Edit only; the frame drops them otherwise.

/** The states the page can force on elements: Focus forces `:focus` and `:focus-visible`. */
export const FORCE_STATES = ['hover', 'focus', 'active'] as const;
export type ForceState = (typeof FORCE_STATES)[number];

/** What the frame measures after an edit (spec 4c, goals 5 and 8). */
export const LIVE_RULES = ['contrast', 'target-size', 'overflow', 'clipped', 'mismatch'] as const;
export type LiveRule = (typeof LIVE_RULES)[number];

/** One measured problem on one element. `values` carries what the message needs. */
export type LiveFact = {
  id: string;
  rule: LiveRule;
  severity: 'fix' | 'review';
  /** Contrast: `ratio`, `needed`, `color`, `background`. Target: `width`, `height`. Mismatch: `property`, `expected`, `actual`. */
  values: Record<string, string | number>;
};

/** A numbered live mark the page asks a frame to draw on an element (goal 5). */
export type LiveMark = { id: string; label: string; tone: 'fix' | 'review' };

/** A note's pin on an element (spec 4d, goal 3): its number in the Notes list. */
export type NotePin = { id: string; label: string };

/** A value the editor showed for an element, to compare with the build (goal 8). */
export type Expected = { id: string; property: string; value: string };

/** Where an element's accessible name comes from. */
export const NAME_SOURCES = [
  'aria-label',
  'aria-labelledby',
  'alt',
  'text',
  'title',
  'none',
] as const;
export type NameSource = (typeof NAME_SOURCES)[number];

/** The accessibility card of one element (goal 7), as the frame computes it. */
export type A11yCard = {
  role: string;
  name: string;
  nameFrom: NameSource;
  focusable: boolean;
  /** Its place in the tab order (1-based); `null` when it is not in it. */
  tabIndex: number | null;
  /** Text contrast; `null` for an element without text of its own. */
  contrast: { ratio: number; large: boolean } | null;
  /** The element's box when it is interactive; `null` otherwise. */
  target: { width: number; height: number } | null;
  /** An image's alt text; `null` for anything else (an empty string is a decorative image). */
  alt: string | null;
  /** A heading's level; `null` for anything else. */
  heading: number | null;
  /** The resolved text colour and the colour behind it, `rgb(…)`; the page warns a picker with them. */
  color: string | null;
  background: string | null;
};

type Head = { kitvas: 1; channel: string };

export type LiveStudioMessage = Head &
  /** Force `state` on `ids` (and only on them); `null` lets every element rest. */
  (
    | { type: 'force'; ids: string[]; state: ForceState | null }
    /** Measure `ids` and their descendants, and compare `expect` with the computed values. */
    | { type: 'measure-live'; request: number; ids: string[]; expect: Expected[] }
    /** The accessibility card of `id`. */
    | { type: 'a11y'; request: number; id: string }
    /** The live marks of this frame's width; an empty list takes them all away. */
    | { type: 'live-marks'; marks: LiveMark[] }
    /** The note pins of this frame (spec 4d); an empty list takes them all away. */
    | { type: 'pins'; pins: NotePin[] }
    /** Which properties the kit's own rules of the forced state hold on `id` (ADR 0055). */
    | { type: 'state-held'; request: number; id: string }
  );

export type LiveFrameMessage = Head &
  /** The answer to `measure-live`: the problems found, at the frame's own width. */
  (
    | { type: 'live-facts'; request: number; width: number; facts: LiveFact[] }
    /** The answer to `a11y`; `card: null` when the element is not there. */
    | { type: 'a11y-card'; request: number; id: string; card: A11yCard | null }
    /**
     * The answer to `state-held`: the longhands a forced-state rule heavier than the editor's
     * own sets on `id`, in `state` (the one forced now; `null`: none, and no longhands).
     */
    | {
        type: 'state-held';
        request: number;
        id: string;
        state: ForceState | null;
        longhands: string[];
      }
  );

type WithoutHead<M> = M extends unknown ? Omit<M, 'kitvas' | 'channel'> : never;
/** A live message to a frame without its head; the bridge adds it. */
export type LiveStudioBody = WithoutHead<LiveStudioMessage>;

export const LIVE_STUDIO_TYPES = new Set([
  'force',
  'measure-live',
  'a11y',
  'live-marks',
  'pins',
  'state-held',
]);
export const LIVE_FRAME_TYPES = new Set(['live-facts', 'a11y-card', 'state-held']);
/** Longhands one `state-held` answer may name. */
export const MAX_LONGHANDS = 120;
const LONGHAND = /^-?[a-z][a-z-]{0,59}$/;

/** Elements one message may name, facts one answer may carry, values one fact may hold. */
export const MAX_LIVE_IDS = 200;
export const MAX_FACTS = 500;
export const MAX_EXPECT = 200;
const MAX_VALUES = 8;
const MAX_TEXT = 200;

type Loose = Record<string, unknown>;

const ELEMENT_ID = /^[A-Za-z0-9_.:/$-]{1,200}$/;
const isObject = (value: unknown): value is Loose =>
  typeof value === 'object' && value !== null && !Array.isArray(value);
const isId = (value: unknown): value is string =>
  typeof value === 'string' && ELEMENT_ID.test(value);
const isText = (value: unknown, max = MAX_TEXT): value is string =>
  typeof value === 'string' && value.length <= max;
const isRequest = (value: unknown): value is number =>
  typeof value === 'number' && Number.isInteger(value) && value >= 0 && value <= 1e9;
const isNumber = (value: unknown): value is number =>
  typeof value === 'number' && Number.isFinite(value) && Math.abs(value) <= 1e6;
const isIds = (value: unknown, max: number): value is string[] =>
  Array.isArray(value) && value.length <= max && value.every(isId);
const oneOf = <T extends string>(list: readonly T[], value: unknown): value is T =>
  typeof value === 'string' && (list as readonly string[]).includes(value);

function values(value: unknown): Record<string, string | number> | undefined {
  if (!isObject(value)) return undefined;
  const entries = Object.entries(value);
  if (entries.length > MAX_VALUES) return undefined;
  const out: Record<string, string | number> = {};
  for (const [key, item] of entries) {
    if (!isText(key, 40) || !(isText(item) || isNumber(item))) return undefined;
    out[key] = item;
  }
  return out;
}

function fact(value: unknown): LiveFact | undefined {
  if (!isObject(value)) return undefined;
  const { id, rule, severity } = value;
  const held = values(value.values);
  if (!isId(id) || !oneOf(LIVE_RULES, rule) || !oneOf(['fix', 'review'], severity) || !held) {
    return undefined;
  }
  return { id, rule, severity, values: held };
}

function liveMark(value: unknown): LiveMark | undefined {
  if (!isObject(value)) return undefined;
  const { id, label, tone } = value;
  if (!isId(id) || !isText(label, 8) || !oneOf(['fix', 'review'], tone)) return undefined;
  return { id, label, tone };
}

function notePin(value: unknown): NotePin | undefined {
  if (!isObject(value)) return undefined;
  const { id, label } = value;
  return isId(id) && isText(label, 8) ? { id, label } : undefined;
}

function expected(value: unknown): Expected | undefined {
  if (!isObject(value)) return undefined;
  const { id, property, value: wanted } = value;
  if (!isId(id) || !isText(property, 48) || !isText(wanted)) return undefined;
  return { id, property, value: wanted };
}

const orNull = <T>(value: unknown, check: (one: unknown) => one is T): value is T | null =>
  value === null || check(value);

function card(value: unknown): A11yCard | null | undefined {
  if (value === null) return null;
  if (!isObject(value)) return undefined;
  const { role, name, nameFrom, focusable, tabIndex, contrast, target, alt, heading } = value;
  if (!isText(role, 40) || !isText(name, 500) || !oneOf(NAME_SOURCES, nameFrom)) return undefined;
  if (typeof focusable !== 'boolean' || !orNull(tabIndex, isNumber)) return undefined;
  if (!orNull(alt, (one): one is string => isText(one, 500))) return undefined;
  if (!orNull(heading, isNumber)) return undefined;
  const color = value.color;
  const background = value.background;
  if (!orNull(color, (one): one is string => isText(one, 80))) return undefined;
  if (!orNull(background, (one): one is string => isText(one, 80))) return undefined;
  let ratio: A11yCard['contrast'] = null;
  if (contrast !== null) {
    if (!isObject(contrast) || !isNumber(contrast.ratio) || typeof contrast.large !== 'boolean') {
      return undefined;
    }
    ratio = { ratio: contrast.ratio, large: contrast.large };
  }
  let box: A11yCard['target'] = null;
  if (target !== null) {
    if (!isObject(target) || !isNumber(target.width) || !isNumber(target.height)) return undefined;
    box = { width: target.width, height: target.height };
  }
  return {
    role,
    name,
    nameFrom,
    focusable,
    tabIndex,
    contrast: ratio,
    target: box,
    alt,
    heading,
    color,
    background,
  };
}

/** A live message from a frame, already known to be on `channel`; `undefined` for a bad one. */
export function parseLiveFrame(message: Loose, channel: string): LiveFrameMessage | undefined {
  const head: Head = { kitvas: 1, channel };
  switch (message.type) {
    case 'live-facts': {
      const { request, width, facts } = message;
      if (!isRequest(request) || !isNumber(width) || !Array.isArray(facts)) return undefined;
      if (facts.length > MAX_FACTS) return undefined;
      const parsed = facts.map(fact);
      if (!parsed.every((one): one is LiveFact => one !== undefined)) return undefined;
      return { ...head, type: 'live-facts', request, width, facts: parsed };
    }
    case 'a11y-card': {
      const { request, id } = message;
      const parsed = card(message.card);
      if (!isRequest(request) || !isId(id) || parsed === undefined) return undefined;
      return { ...head, type: 'a11y-card', request, id, card: parsed };
    }
    case 'state-held': {
      const { request, id, state, longhands } = message;
      if (!isRequest(request) || !isId(id) || !(state === null || oneOf(FORCE_STATES, state))) {
        return undefined;
      }
      if (!Array.isArray(longhands) || longhands.length > MAX_LONGHANDS) return undefined;
      const names = longhands.filter(
        (one): one is string => typeof one === 'string' && LONGHAND.test(one),
      );
      if (names.length !== longhands.length) return undefined;
      return { ...head, type: 'state-held', request, id, state, longhands: names };
    }
    default:
      return undefined;
  }
}

/** A live message from the page, already known to be on `channel`; `undefined` for a bad one. */
export function parseLiveStudio(message: Loose, channel: string): LiveStudioMessage | undefined {
  const head: Head = { kitvas: 1, channel };
  switch (message.type) {
    case 'force': {
      const { ids, state } = message;
      if (!isIds(ids, MAX_LIVE_IDS) || !(state === null || oneOf(FORCE_STATES, state))) {
        return undefined;
      }
      return { ...head, type: 'force', ids: [...ids], state };
    }
    case 'measure-live': {
      const { request, ids, expect } = message;
      if (!isRequest(request) || !isIds(ids, MAX_LIVE_IDS) || !Array.isArray(expect)) {
        return undefined;
      }
      if (expect.length > MAX_EXPECT) return undefined;
      const parsed = expect.map(expected);
      if (!parsed.every((one): one is Expected => one !== undefined)) return undefined;
      return { ...head, type: 'measure-live', request, ids: [...ids], expect: parsed };
    }
    case 'a11y': {
      const { request, id } = message;
      return isRequest(request) && isId(id) ? { ...head, type: 'a11y', request, id } : undefined;
    }
    case 'state-held': {
      const { request, id } = message;
      return isRequest(request) && isId(id)
        ? { ...head, type: 'state-held', request, id }
        : undefined;
    }
    case 'live-marks': {
      const { marks } = message;
      if (!Array.isArray(marks) || marks.length > MAX_LIVE_IDS) return undefined;
      const parsed = marks.map(liveMark);
      if (!parsed.every((one): one is LiveMark => one !== undefined)) return undefined;
      return { ...head, type: 'live-marks', marks: parsed };
    }
    case 'pins': {
      const { pins } = message;
      if (!Array.isArray(pins) || pins.length > MAX_LIVE_IDS) return undefined;
      const parsed = pins.map(notePin);
      if (!parsed.every((one): one is NotePin => one !== undefined)) return undefined;
      return { ...head, type: 'pins', pins: parsed };
    }
    default:
      return undefined;
  }
}

/** Whether a page message is a live one (the frame runtime routes it to `force.ts` or `live.ts`). */
export function isLiveStudio(message: { type: string }): message is LiveStudioMessage {
  return LIVE_STUDIO_TYPES.has(message.type);
}

/** Whether a frame message is a live one (the page routes it to the live module). */
export function isLiveFrame(message: { type: string }): message is LiveFrameMessage {
  return LIVE_FRAME_TYPES.has(message.type);
}
