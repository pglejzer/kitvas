// The editor's structure messages between the draft page and its current frame (spec 4b; plan 14,
// C11). Checked for their shape on both sides like every message of the channel;
// `edit-protocol.ts` hands these types to the parsers here.
//
// The frame owns the pointer while a drag, a handle or a selection rectangle is on it: it finds the
// drop slot from the real layout and reports the drop. The page owns the writes: it turns a drop, a
// reordered list item or a handle into ops. A drag that starts on the page (the palette, the tree)
// is forwarded into the frame as `drag` messages in the frame's own CSS pixels.

import type { CopyRef } from './edit-protocol.ts';

const ELEMENT_ID = /^[A-Za-z0-9_.:/$-]{1,200}$/;
const PROPERTY = /^[a-z][a-z-]{0,47}$/;
const TOKEN_VAR = /^--kit-[A-Za-z0-9_-]{1,80}$/;

export const MAX_ENTRIES = 2000;
export const MAX_IDS = 200;
/** The most copies a `rect` names: `MAX_COPIES` of `edit-protocol.ts`. */
export const MAX_PICKS = 200;
/** The most lists around one element: `MAX_LIST_DEPTH` of `edit-protocol.ts`. */
export const MAX_LISTS = 8;
export const MAX_SCALE = 100;
export const MAX_LABEL = 80;
export const MAX_RAW = 200;
/** Frame coordinates and token sizes stay inside this, in CSS pixels. */
export const MAX_PX = 100_000;
/** A list item's place: the same bound as the edit ops' `item`. */
export const MAX_ITEM = 10_000;
/** The most properties a `handles` message names in one of its lists. */
export const MAX_HANDLE_PROPERTIES = 16;

export const PLACES = ['before', 'after', 'first', 'last'] as const;
export type Place = (typeof PLACES)[number];

/** What the frame needs of one element to offer drop slots (from `GET …/structure`). */
export type FrameEntry = {
  id: string;
  /**
   * It can be dragged: no refusal for a move. True for a plain child inside a list item's template
   * too: only the element's own place decides.
   */
  movable: boolean;
  /**
   * The ids of the root elements of the `.map` lists around the element, outer first, its own id
   * last when it is such a root. `[]` outside any list; `null` when a list around it cannot be
   * counted (a fragment root, a condition at the top of the callback, `flatMap`).
   */
  lists: string[] | null;
  /** The root a `.map` callback returns, of a list the editor can write: it drags as an item. */
  item: boolean;
  /** It takes an element dropped inside. */
  accepts: boolean;
  /** Its children mix text and elements: no slots between them. */
  mixed: boolean;
  interactive: boolean;
  root: 'section' | 'slot' | null;
};

/** One step of a kit scale, its size in CSS pixels as the frame computes it. */
export type ScaleStep = { name: string; var: string; px: number };

export type DragSource = { kind: 'move'; ids: string[] } | { kind: 'insert'; label: string };
export type DragPhase = 'start' | 'move' | 'end' | 'cancel';
export type HandleValue = { token: string } | { raw: string };

/** A box in frame pixels (the frame's own client coordinates). */
export type MenuBox = { x: number; y: number; width: number; height: number };

type Head = { kitvas: 1; channel: string };

export type StructureStudioMessage = Head &
  (
    | { type: 'structure'; entries: FrameEntry[] }
    | { type: 'tokens'; space: ScaleStep[]; size: ScaleStep[] }
    /** A drag from the page, forwarded: `source` on `start` only; `x`, `y` in frame pixels. */
    | { type: 'drag'; phase: DragPhase; source: DragSource | null; x: number; y: number }
    /**
     * The page heard the pointer let go over the frame, where the frame could not hear it: a
     * press, a drag or a handle of the frame's own pointer ends there (ADR 0066). `x`, `y` in
     * frame pixels; `shift` and `alt` as they were held.
     */
    | { type: 'release'; x: number; y: number; shift: boolean; alt: boolean }
    /**
     * The last drop was not taken (refused, in conflict or lost): the frame puts the nodes its
     * preview moved back where they stood and removes an insert's placeholder. Sent to the edit
     * card only and never replayed: it is about one drop.
     */
    | { type: 'drop-back' }
    /** Elements shown with `display: none` in the frame only (spec 4b, decision 14). */
    | { type: 'hide'; ids: string[] }
    /** Locked elements: the canvas cannot select or drag them, while editing only. */
    | { type: 'lock'; ids: string[] }
    /**
     * Handles on the selected element; off while a drag or an inline text edit runs. `blocked`:
     * the CSS properties no handle can write on it, whose handles are not drawn. `stepped`: the
     * ones a kit prop covers, which take a step of the scale and never free pixels.
     */
    | { type: 'handles'; on: boolean; blocked: string[]; stepped: string[] }
  );

export type StructureFrameMessage = Head &
  /** A drag ended on a slot. A drag that ends on no slot sends nothing. */
  (
    | { type: 'drop'; source: DragSource; anchor: string; place: Place }
    /**
     * A list item was dropped (ADR 0065): `from` is the path of the dragged copy of `id` (its
     * place in each `.map` list around it, outer first) and `to` the path it has after the drop,
     * of the same length. The same numbers before the last one: another place in its list. Other
     * numbers there: the same list of another parent. A drop on its own place sends nothing.
     */
    | { type: 'reorder'; id: string; from: number[]; to: number[] }
    /** A handle moved (`done: false`, previewed in the frame) or was let go (`done: true`, to write). */
    | { type: 'handle'; id: string; property: string; value: HandleValue; done: boolean }
    /**
     * Each copy a selection rectangle took, in document order, at most `MAX_PICKS`; `add` with
     * Shift, Ctrl or Cmd held.
     */
    | { type: 'rect'; picks: CopyRef[]; add: boolean }
    /**
     * A context menu was asked for, on an element or on none, at frame pixels. `item` and `path`
     * name the copy under the pointer as a `pick` does, `box` is the element's box.
     */
    | {
        type: 'menu';
        id: string | null;
        x: number;
        y: number;
        item?: number;
        path?: number[];
        box?: MenuBox;
      }
  );

export const STRUCTURE_FRAME_TYPES = new Set(['drop', 'reorder', 'handle', 'rect', 'menu']);
export const STRUCTURE_STUDIO_TYPES = new Set([
  'structure',
  'tokens',
  'drag',
  'release',
  'drop-back',
  'hide',
  'lock',
  'handles',
]);

type Loose = Record<string, unknown>;

const isObject = (value: unknown): value is Loose =>
  typeof value === 'object' && value !== null && !Array.isArray(value);
const isId = (value: unknown): value is string =>
  typeof value === 'string' && ELEMENT_ID.test(value);
const isIds = (value: unknown): value is string[] =>
  Array.isArray(value) && value.length <= MAX_IDS && value.every(isId);
const isPx = (value: unknown): value is number =>
  typeof value === 'number' && Number.isFinite(value) && Math.abs(value) <= MAX_PX;
const isPlace = (value: unknown): value is Place => PLACES.some((place) => place === value);
const isRoot = (value: unknown): value is FrameEntry['root'] =>
  value === null || value === 'section' || value === 'slot';
const isItem = (value: unknown): value is number =>
  typeof value === 'number' && Number.isInteger(value) && value >= 0 && value <= MAX_ITEM;
/** A copy's place in each list around an element (ADR 0060): list item places, outer first. */
const isPath = (value: unknown): value is number[] =>
  Array.isArray(value) && value.length <= MAX_LISTS && value.every(isItem);
const isLists = (value: unknown): value is string[] =>
  Array.isArray(value) && value.length <= MAX_LISTS && value.every(isId);
const isProperties = (value: unknown): value is string[] =>
  Array.isArray(value) &&
  value.length <= MAX_HANDLE_PROPERTIES &&
  value.every((name) => typeof name === 'string' && PROPERTY.test(name));

function entry(value: unknown): FrameEntry | undefined {
  if (!isObject(value)) return undefined;
  const { id, movable, lists, item, accepts, mixed, interactive, root } = value;
  if (!isId(id) || !isRoot(root)) return undefined;
  if (typeof movable !== 'boolean' || typeof accepts !== 'boolean') return undefined;
  if (typeof mixed !== 'boolean' || typeof interactive !== 'boolean') return undefined;
  if (typeof item !== 'boolean') return undefined;
  if (!(lists === null || isLists(lists))) return undefined;
  const around = lists === null ? null : [...lists];
  return { id, movable, lists: around, item, accepts, mixed, interactive, root };
}

/** One copy a rectangle took: the id, and its `item` and `path` when the frame gave them. */
function copyRef(value: unknown): CopyRef | undefined {
  if (!isObject(value)) return undefined;
  const { id, item, path } = value;
  if (!isId(id)) return undefined;
  if (!(item === undefined || isItem(item))) return undefined;
  if (!(path === undefined || isPath(path))) return undefined;
  return {
    id,
    ...(item === undefined ? {} : { item }),
    ...(path === undefined ? {} : { path: [...path] }),
  };
}

/** The box of the element under a context menu: four numbers, no negative size. */
function menuBox(value: unknown): MenuBox | undefined {
  if (!isObject(value)) return undefined;
  const { x, y, width, height } = value;
  if (!isPx(x) || !isPx(y) || !isPx(width) || !isPx(height)) return undefined;
  return width >= 0 && height >= 0 ? { x, y, width, height } : undefined;
}

function step(value: unknown): ScaleStep | undefined {
  if (!isObject(value)) return undefined;
  const { name, px } = value;
  if (typeof name !== 'string' || name.length === 0 || name.length > MAX_LABEL) return undefined;
  if (typeof value.var !== 'string' || !TOKEN_VAR.test(value.var)) return undefined;
  return isPx(px) && px >= 0 ? { name, var: value.var, px } : undefined;
}

function scale(value: unknown): ScaleStep[] | undefined {
  if (!Array.isArray(value) || value.length > MAX_SCALE) return undefined;
  const parsed = value.map(step);
  return parsed.every((item) => item !== undefined) ? (parsed as ScaleStep[]) : undefined;
}

function source(value: unknown): DragSource | undefined {
  if (!isObject(value)) return undefined;
  if (value.kind === 'move' && isIds(value.ids) && value.ids.length > 0) {
    return { kind: 'move', ids: [...value.ids] };
  }
  if (value.kind === 'insert' && typeof value.label === 'string') {
    return value.label.length > 0 && value.label.length <= MAX_LABEL
      ? { kind: 'insert', label: value.label }
      : undefined;
  }
  return undefined;
}

function handleValue(value: unknown): HandleValue | undefined {
  if (!isObject(value)) return undefined;
  if (typeof value.token === 'string' && TOKEN_VAR.test(value.token)) {
    return { token: value.token };
  }
  if (typeof value.raw === 'string') {
    const raw = value.raw;
    return raw.length > 0 && raw.length <= MAX_RAW && !/[;{}<>]/.test(raw) ? { raw } : undefined;
  }
  return undefined;
}

/** A structure message from the frame, already known to be on `channel`; `undefined` for a bad one. */
export function parseStructureFrame(
  message: Loose,
  channel: string,
): StructureFrameMessage | undefined {
  const head: Head = { kitvas: 1, channel };
  switch (message.type) {
    case 'drop': {
      const from = source(message.source);
      const { anchor, place } = message;
      if (!from || !isId(anchor) || !isPlace(place)) return undefined;
      return { ...head, type: 'drop', source: from, anchor, place };
    }
    case 'reorder': {
      const { id, from, to } = message;
      if (!isId(id) || !isPath(from) || !isPath(to)) return undefined;
      if (from.length === 0 || from.length !== to.length) return undefined;
      return { ...head, type: 'reorder', id, from: [...from], to: [...to] };
    }
    case 'handle': {
      const { id, property, done } = message;
      const value = handleValue(message.value);
      if (!isId(id) || typeof property !== 'string' || !PROPERTY.test(property)) return undefined;
      if (!value || typeof done !== 'boolean') return undefined;
      return { ...head, type: 'handle', id, property, value, done };
    }
    case 'rect': {
      const { picks, add } = message;
      if (!Array.isArray(picks) || picks.length > MAX_PICKS || typeof add !== 'boolean') {
        return undefined;
      }
      const parsed = picks.map(copyRef);
      if (parsed.some((pick) => pick === undefined)) return undefined;
      return { ...head, type: 'rect', picks: parsed as CopyRef[], add };
    }
    case 'menu': {
      const { id, x, y, item, path } = message;
      if (!(id === null || isId(id)) || !isPx(x) || !isPx(y)) return undefined;
      if (!(item === undefined || isItem(item))) return undefined;
      if (!(path === undefined || isPath(path))) return undefined;
      const box = message.box === undefined ? undefined : menuBox(message.box);
      if (message.box !== undefined && box === undefined) return undefined;
      return {
        ...head,
        type: 'menu',
        id,
        x,
        y,
        ...(item === undefined ? {} : { item }),
        ...(path === undefined ? {} : { path: [...path] }),
        ...(box === undefined ? {} : { box }),
      };
    }
    default:
      return undefined;
  }
}

/** A structure message from the page, already known to be on `channel`; `undefined` for a bad one. */
export function parseStructureStudio(
  message: Loose,
  channel: string,
): StructureStudioMessage | undefined {
  const head: Head = { kitvas: 1, channel };
  switch (message.type) {
    case 'structure': {
      const { entries } = message;
      if (!Array.isArray(entries) || entries.length > MAX_ENTRIES) return undefined;
      const parsed = entries.map(entry);
      if (parsed.some((item) => item === undefined)) return undefined;
      return { ...head, type: 'structure', entries: parsed as FrameEntry[] };
    }
    case 'tokens': {
      const space = scale(message.space);
      const size = scale(message.size);
      return space && size ? { ...head, type: 'tokens', space, size } : undefined;
    }
    case 'drag': {
      const { phase, x, y } = message;
      if (phase !== 'start' && phase !== 'move' && phase !== 'end' && phase !== 'cancel') {
        return undefined;
      }
      if (!isPx(x) || !isPx(y)) return undefined;
      if (phase !== 'start') return { ...head, type: 'drag', phase, source: null, x, y };
      const from = source(message.source);
      return from ? { ...head, type: 'drag', phase, source: from, x, y } : undefined;
    }
    case 'release': {
      const { x, y, shift, alt } = message;
      if (!isPx(x) || !isPx(y) || typeof shift !== 'boolean' || typeof alt !== 'boolean') {
        return undefined;
      }
      return { ...head, type: 'release', x, y, shift, alt };
    }
    case 'drop-back':
      return { ...head, type: 'drop-back' };
    case 'hide':
      return isIds(message.ids) ? { ...head, type: 'hide', ids: [...message.ids] } : undefined;
    case 'lock':
      return isIds(message.ids) ? { ...head, type: 'lock', ids: [...message.ids] } : undefined;
    case 'handles': {
      const { on, blocked, stepped } = message;
      if (typeof on !== 'boolean' || !isProperties(blocked) || !isProperties(stepped)) {
        return undefined;
      }
      return { ...head, type: 'handles', on, blocked: [...blocked], stepped: [...stepped] };
    }
    default:
      return undefined;
  }
}
