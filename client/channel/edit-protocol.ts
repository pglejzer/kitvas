// The editor's messages between the draft page and its current frame (plan 13, C4). Like the rest
// of the channel, every message is checked for its shape before it is used, on both sides, and
// nothing a frame sends is put into the page as markup. `protocol.ts` hands edit types to these
// parsers.
//
// The page owns the selection and the history; the frame only reports what the person did in it
// (a click, a key, a finished inline text) and draws what the page tells it (outlines, previews).

const ELEMENT_ID = /^[A-Za-z0-9_.:/$-]{1,200}$/;
const PROPERTY = /^[a-z][a-z-]{0,47}$/;
const CLASS = /^[a-z][a-z0-9-]{0,63}$/;

export const MAX_SELECTED = 200;
export const MAX_NODES = 2000;
export const MAX_NAME = 80;
export const MAX_INLINE_TEXT = 2000;
export const MAX_STYLES = 40;
export const MAX_STYLE_VALUE = 200;
export const MAX_PREVIEW = 40;

/** Keys the frame passes on while edit mode is on and focus is in the frame. */
export const EDIT_KEYS = ['clear', 'parent', 'child', 'undo', 'redo'] as const;
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

type Head = { kitvas: 1; channel: string };

export type EditFrameMessage = Head &
  (
    | { type: 'pick'; id: string | null; add: boolean; double: boolean }
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
    /** The end of an inline text edit; `value: null` when the person cancelled it. */
    | { type: 'text'; id: string; value: string | null }
  );

export type EditStudioMessage = Head &
  (
    | { type: 'edit'; on: boolean }
    | { type: 'select'; ids: string[] }
    | { type: 'hover'; id: string | null }
    | { type: 'tree'; request: number }
    | { type: 'inspect'; request: number; id: string }
    /** Starts an inline text edit of the element; the frame answers with `text`. */
    | { type: 'edit-text'; id: string }
    | { type: 'preview'; changes: PreviewChange[] }
    /** Takes every preview back: a refused edit, or a build that replaced the page. */
    | { type: 'unpreview' }
  );

export const EDIT_FRAME_TYPES = new Set(['pick', 'hovered', 'key', 'tree', 'inspected', 'text']);
export const EDIT_STUDIO_TYPES = new Set([
  'edit',
  'select',
  'hover',
  'tree',
  'inspect',
  'edit-text',
  'preview',
  'unpreview',
]);

type Loose = Record<string, unknown>;

const isObject = (value: unknown): value is Loose =>
  typeof value === 'object' && value !== null && !Array.isArray(value);
const isId = (value: unknown): value is string =>
  typeof value === 'string' && ELEMENT_ID.test(value);
const isIdOrNull = (value: unknown): value is string | null => value === null || isId(value);
const isText = (value: unknown, max: number): value is string =>
  typeof value === 'string' && value.length <= max;
const isCount = (value: unknown): value is number =>
  typeof value === 'number' && Number.isInteger(value) && value >= 0 && value <= 1e9;

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
      return { ...head, type: 'pick', id, add, double };
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
      const { id, value } = message;
      if (!isId(id) || !(value === null || isText(value, MAX_INLINE_TEXT))) return undefined;
      return { ...head, type: 'text', id, value };
    }
    default:
      return undefined;
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
      return { ...head, type: 'select', ids: [...ids] };
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
    case 'edit-text':
      return isId(message.id) ? { ...head, type: 'edit-text', id: message.id } : undefined;
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
      return undefined;
  }
}

type WithoutHead<M> = M extends unknown ? Omit<M, 'kitvas' | 'channel'> : never;
/** An edit message to a frame without its head; `sendEdit` (client/studio/frames.ts) adds it. */
export type EditStudioBody = WithoutHead<EditStudioMessage>;

/** Whether a checked frame message is one of the editor's. */
export function isEditFrameMessage(message: { type: string }): message is EditFrameMessage {
  return EDIT_FRAME_TYPES.has(message.type);
}
