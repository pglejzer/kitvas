// The editor's messages between the draft page and its current frame (plan 13, C4). Like the rest
// of the channel, every message is checked for its shape before it is used, on both sides, and
// nothing a frame sends is put into the page as markup. `protocol.ts` hands edit types to these
// parsers.
//
// The page owns the selection and the history; the frame only reports what the person did in it
// (a click, a key, a finished inline text) and draws what the page tells it (outlines, previews).

import {
  parseStructureFrame,
  parseStructureStudio,
  STRUCTURE_FRAME_TYPES,
  STRUCTURE_STUDIO_TYPES,
  type StructureFrameMessage,
  type StructureStudioMessage,
} from './structure-protocol.ts';

const ELEMENT_ID = /^[A-Za-z0-9_.:/$-]{1,200}$/;
const PROPERTY = /^[a-z][a-z-]{0,47}$/;
/** `CLASS_NAME` of `src/edit/domain/ops.ts`: BEM names such as `plans__card` too. */
const CLASS = /^[a-z][a-z0-9_-]{0,63}$/;

export const MAX_SELECTED = 200;
/** The most lists around one element a `locate-copy` names (`MAX_LIST_DEPTH` of the edit ops). */
export const MAX_LIST_DEPTH = 8;
export const MAX_NODES = 2000;
export const MAX_NAME = 80;
export const MAX_INLINE_TEXT = 2000;
export const MAX_STYLES = 40;
export const MAX_STYLE_VALUE = 200;
export const MAX_PREVIEW = 40;

/** Keys the frame passes on while edit mode is on and focus is in the frame. */
export const EDIT_KEYS = [
  'clear',
  'parent',
  'child',
  'undo',
  'redo',
  // Structure (spec 4b): Delete, Ctrl+D, Ctrl+C, Ctrl+X, Ctrl+V, Alt+Up, Alt+Down, Ctrl+G,
  // Ctrl+Shift+G, Shift+F10 or the menu key.
  'delete',
  'duplicate',
  'copy',
  'cut',
  'paste',
  'move-up',
  'move-down',
  'wrap',
  'unwrap',
  'menu',
] as const;
export type EditKey = (typeof EDIT_KEYS)[number];

/** One element of the layers tree, in document order. */
export type TreeNode = {
  id: string;
  /** The nearest enclosing `[data-ks]` element's id; `null` at the top. */
  parent: string | null;
  /** An explicit name (`aria-label`), else the first heading inside, else its text, else the tag. */
  name: string;
  /** Elements in the page with this id: more than 1 for an item of a mapped list. */
  count: number;
};

/** A change shown in the frame at once, before the build confirms it (task E2). */
export type PreviewChange =
  | { id: string; kind: 'text'; value: string }
  | { id: string; kind: 'style'; property: string; value: string }
  | { id: string; kind: 'class'; className: string; on: boolean };

/** The keys held during a click, as a mouse event has them. */
export type ClickKeys = { shiftKey: boolean; ctrlKey: boolean; metaKey: boolean };

/**
 * A click held with Shift, Ctrl or Cmd adds to the selection, or takes a selected element out:
 * a pick's `add`, in the frame and in the layers alike.
 */
export const addsToSelection = (click: ClickKeys): boolean =>
  click.shiftKey || click.ctrlKey || click.metaKey;

/** What a pick says of the click: the element, the add modifier, a double click. */
export type PickLike = { id: string | null; add: boolean; double: boolean };

/** The element a pick opens an inline text edit on: a double click's, never one with `add`. */
export const textEditOf = (pick: PickLike): string | null =>
  pick.double && !pick.add ? pick.id : null;

type Head = { kitvas: 1; channel: string };

export type EditFrameMessage =
  | StructureFrameMessage
  | (Head &
      /**
       * `item` (spec 4c, goal 9): which rendered copy of `id` was picked when several elements
       * carry it (a `.map`), counted in document order from 0; absent when only one does.
       */
      (
        | { type: 'pick'; id: string | null; add: boolean; double: boolean; item?: number }
        | { type: 'hovered'; id: string | null }
        | { type: 'key'; key: EditKey }
        | { type: 'tree'; request: number; nodes: TreeNode[] }
        | {
            type: 'inspected';
            request: number;
            id: string;
            found: boolean;
            styles: Record<string, string>;
          }
        /**
         * The end of an inline text edit; `value: null` when the person cancelled it. `before`:
         * the text the editor started from (ADR 0060), the `before` of the op that writes it.
         */
        | { type: 'text'; id: string; value: string | null; before?: string }
        /**
         * The answer to `locate-copy` (ADR 0060): the copy's place among the copies of each root,
         * outer first, and the text it shows. `path: null` when a root around it is not there;
         * `text: null` when the copy is not there or holds elements, so it cannot be typed in.
         */
        | {
            type: 'copy-located';
            request: number;
            id: string;
            path: number[] | null;
            text: string | null;
          }
      ));

export type EditStudioMessage =
  | StructureStudioMessage
  | (Head &
      (
        | { type: 'edit'; on: boolean }
        /** `item`: only that rendered copy of `ids[0]` is outlined (a list item, spec 4c). */
        | { type: 'select'; ids: string[]; item?: number }
        | { type: 'hover'; id: string | null }
        | { type: 'tree'; request: number }
        | { type: 'inspect'; request: number; id: string }
        /**
         * Starts an inline text edit of the element; the frame answers with `text`. `item`: that
         * rendered copy of it (ADR 0060), else the chosen one.
         */
        | { type: 'edit-text'; id: string; item?: number }
        /**
         * ADR 0060: where copy `item` of `id` stands in the lists whose root elements are `roots`
         * (outer first): for each root, the place of the copy of it around the element among that
         * root's copies inside the copy of the root before it. The frame answers `copy-located`.
         */
        | { type: 'locate-copy'; request: number; id: string; item?: number; roots: string[] }
        /** ADR 0060: the last inline edit of `id` was not written, so its old text comes back. */
        | { type: 'text-back'; id: string }
        | { type: 'preview'; changes: PreviewChange[] }
        /** Takes every preview back: a refused edit, or a build that replaced the page. */
        | { type: 'unpreview' }
      ));

export const EDIT_FRAME_TYPES = new Set([
  'pick',
  'hovered',
  'key',
  'tree',
  'inspected',
  'text',
  'copy-located',
  ...STRUCTURE_FRAME_TYPES,
]);
export const EDIT_STUDIO_TYPES = new Set([
  'edit',
  'select',
  'hover',
  'tree',
  'inspect',
  'edit-text',
  'locate-copy',
  'text-back',
  'preview',
  'unpreview',
  ...STRUCTURE_STUDIO_TYPES,
]);

type Loose = Record<string, unknown>;

const isObject = (value: unknown): value is Loose =>
  typeof value === 'object' && value !== null && !Array.isArray(value);
const isId = (value: unknown): value is string =>
  typeof value === 'string' && ELEMENT_ID.test(value);
const isIdOrNull = (value: unknown): value is string | null => value === null || isId(value);
/** A list item's place (spec 4c): the same bound as the edit ops' `item`. */
const isItem = (value: unknown): value is number =>
  typeof value === 'number' && Number.isInteger(value) && value >= 0 && value <= 10_000;
const isText = (value: unknown, max: number): value is string =>
  typeof value === 'string' && value.length <= max;
const isCount = (value: unknown): value is number =>
  typeof value === 'number' && Number.isInteger(value) && value >= 0 && value <= 1e9;
/** A copy's place in each list around an element (ADR 0060): list item places, outer first. */
const isPath = (value: unknown): value is number[] =>
  Array.isArray(value) && value.length <= MAX_LIST_DEPTH && value.every(isItem);

function node(value: unknown): TreeNode | undefined {
  if (!isObject(value)) return undefined;
  const { id, parent, name, count } = value;
  if (!isId(id) || !isIdOrNull(parent) || !isText(name, MAX_NAME) || !isCount(count))
    return undefined;
  return { id, parent, name, count };
}

function styles(value: unknown): Record<string, string> | undefined {
  if (!isObject(value)) return undefined;
  const entries = Object.entries(value);
  if (entries.length > MAX_STYLES) return undefined;
  const out: Record<string, string> = {};
  for (const [property, text] of entries) {
    if (!PROPERTY.test(property) || !isText(text, MAX_STYLE_VALUE)) return undefined;
    out[property] = text;
  }
  return out;
}

function change(value: unknown): PreviewChange | undefined {
  if (!isObject(value) || !isId(value.id)) return undefined;
  const { id, kind } = value;
  if (kind === 'text' && isText(value.value, MAX_INLINE_TEXT))
    return { id, kind, value: value.value };
  if (kind === 'style' && typeof value.property === 'string' && PROPERTY.test(value.property)) {
    return isText(value.value, MAX_STYLE_VALUE) && !/[;{}<>]/.test(value.value)
      ? { id, kind, property: value.property, value: value.value }
      : undefined;
  }
  if (kind === 'class' && typeof value.className === 'string' && CLASS.test(value.className)) {
    return typeof value.on === 'boolean'
      ? { id, kind, className: value.className, on: value.on }
      : undefined;
  }
  return undefined;
}

/** An edit message from the frame, already known to be on `channel`; `undefined` for a bad one. */
export function parseEditFrame(message: Loose, channel: string): EditFrameMessage | undefined {
  const head: Head = { kitvas: 1, channel };
  switch (message.type) {
    case 'pick': {
      const { id, add, double } = message;
      if (!isIdOrNull(id) || typeof add !== 'boolean' || typeof double !== 'boolean')
        return undefined;
      const { item } = message;
      if (item === undefined) return { ...head, type: 'pick', id, add, double };
      if (!isItem(item)) return undefined;
      return { ...head, type: 'pick', id, add, double, item };
    }
    case 'hovered':
      return isIdOrNull(message.id) ? { ...head, type: 'hovered', id: message.id } : undefined;
    case 'key': {
      const key = EDIT_KEYS.find((name) => name === message.key);
      return key ? { ...head, type: 'key', key } : undefined;
    }
    case 'tree': {
      const { request, nodes } = message;
      if (!isCount(request) || !Array.isArray(nodes) || nodes.length > MAX_NODES) return undefined;
      const parsed = nodes.map(node);
      if (parsed.some((item) => item === undefined)) return undefined;
      return { ...head, type: 'tree', request, nodes: parsed as TreeNode[] };
    }
    case 'inspected': {
      const { request, id, found } = message;
      const read = styles(message.styles);
      if (!isCount(request) || !isId(id) || typeof found !== 'boolean' || !read) return undefined;
      return { ...head, type: 'inspected', request, id, found, styles: read };
    }
    case 'text': {
      const { id, value, before } = message;
      if (!isId(id) || !(value === null || isText(value, MAX_INLINE_TEXT))) return undefined;
      if (before === undefined) return { ...head, type: 'text', id, value };
      return isText(before, MAX_INLINE_TEXT)
        ? { ...head, type: 'text', id, value, before }
        : undefined;
    }
    case 'copy-located': {
      const { request, id, path, text } = message;
      if (!isCount(request) || !isId(id)) return undefined;
      if (!(path === null || isPath(path))) return undefined;
      if (!(text === null || isText(text, MAX_INLINE_TEXT))) return undefined;
      const place = path === null ? null : [...path];
      return { ...head, type: 'copy-located', request, id, path: place, text };
    }
    default:
      return parseStructureFrame(message, channel);
  }
}

/** An edit message from the page, already known to be on `channel`; `undefined` for a bad one. */
export function parseEditStudio(message: Loose, channel: string): EditStudioMessage | undefined {
  const head: Head = { kitvas: 1, channel };
  switch (message.type) {
    case 'edit':
      return typeof message.on === 'boolean'
        ? { ...head, type: 'edit', on: message.on }
        : undefined;
    case 'select': {
      const { ids } = message;
      if (!Array.isArray(ids) || ids.length > MAX_SELECTED || !ids.every(isId)) return undefined;
      const { item } = message;
      if (item === undefined) return { ...head, type: 'select', ids: [...ids] };
      if (!isItem(item)) return undefined;
      return { ...head, type: 'select', ids: [...ids], item };
    }
    case 'hover':
      return isIdOrNull(message.id) ? { ...head, type: 'hover', id: message.id } : undefined;
    case 'tree':
      return isCount(message.request)
        ? { ...head, type: 'tree', request: message.request }
        : undefined;
    case 'inspect':
      return isCount(message.request) && isId(message.id)
        ? { ...head, type: 'inspect', request: message.request, id: message.id }
        : undefined;
    case 'edit-text': {
      const { id, item } = message;
      if (!isId(id)) return undefined;
      if (item === undefined) return { ...head, type: 'edit-text', id };
      return isItem(item) ? { ...head, type: 'edit-text', id, item } : undefined;
    }
    case 'locate-copy': {
      const { request, id, item, roots } = message;
      if (!isCount(request) || !isId(id) || !Array.isArray(roots)) return undefined;
      if (roots.length > MAX_LIST_DEPTH || !roots.every(isId)) return undefined;
      const body = { ...head, type: 'locate-copy' as const, request, id, roots: [...roots] };
      if (item === undefined) return body;
      return isItem(item) ? { ...body, item } : undefined;
    }
    case 'text-back':
      return isId(message.id) ? { ...head, type: 'text-back', id: message.id } : undefined;
    case 'preview': {
      const { changes } = message;
      if (!Array.isArray(changes) || changes.length > MAX_PREVIEW) return undefined;
      const parsed = changes.map(change);
      if (parsed.some((item) => item === undefined)) return undefined;
      return { ...head, type: 'preview', changes: parsed as PreviewChange[] };
    }
    case 'unpreview':
      return { ...head, type: 'unpreview' };
    default:
      return parseStructureStudio(message, channel);
  }
}

type WithoutHead<M> = M extends unknown ? Omit<M, 'kitvas' | 'channel'> : never;
/** An edit message to a frame without its head; `sendEdit` (client/studio/frames.ts) adds it. */
export type EditStudioBody = WithoutHead<EditStudioMessage>;

/** Whether a checked frame message is one of the editor's. */
export function isEditFrameMessage(message: { type: string }): message is EditFrameMessage {
  return EDIT_FRAME_TYPES.has(message.type);
}
