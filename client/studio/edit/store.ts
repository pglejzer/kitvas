// The editor's state on the draft page (plan 13, client contract). One store; every panel reads it
// and changes it through `set`, and hears every change through `subscribe`. Panels never call each
// other: they share this state, the bridge to the frame, and the history.

import type { EditOp, Refusal } from '../../../src/edit/index.ts';
import type { EditOutcome, EditState, Inspect } from '../../../src/studio/api/edit-schemas.ts';
import type { Structure } from '../../../src/studio/api/structure-schemas.ts';
import type { TreeNode } from '../../channel/edit-protocol.ts';

/**
 * One undo step: the ops of one gesture (task H), with the text the change list shows.
 * `undoOps`: the exact inverse the server answered with (spec 4b, decision 4); undo and redo send
 * it, and the stack entry moved to the other stack carries the next answer's inverse (task D1).
 */
/** `selectCreated`: select the elements the answer created (insert, paste, duplicate, wrap). */
export type Gesture = { ops: EditOp[]; label: string; undoOps?: EditOp[]; selectCreated?: boolean };

/** What copy and cut keep (task D4): each element's source and the TSX file it came from. */
export type Clip = { items: { source: string; from: string }[]; text: string; at: number };

/** The context menu, open at page pixels, for an element or for none (task D3). */
export type Menu = { id: string | null; x: number; y: number };

/** One line of the session's change list (task J). */
export type ChangeEntry = {
  by: 'person' | 'claude';
  /** The element; `null` for a change by Claude to a whole file. */
  id: string | null;
  label: string;
  /** For `by: 'claude'`: the files that changed. */
  files: string[];
  offKit: boolean;
  at: number;
};

export type Conflict = { gesture: Gesture; outcome: Extract<EditOutcome, { outcome: 'conflict' }> };
export type Refused = { gesture: Gesture; index: number; reason: Refusal };

export type EditorState = {
  slug: string;
  /** Edit mode is on. */
  on: boolean;
  /** From `GET …/edits`; `null` until it is read. */
  edit: EditState | null;
  /** ETags as the editor last heard them, by path. */
  etags: Record<string, string>;
  selection: string[];
  hovered: string | null;
  tree: TreeNode[];
  /** The source view of `selection[0]`; `null` while none is selected or it is being read. */
  inspected: Inspect | null;
  /** Computed styles of `selection[0]` from the frame (`inspected` message). */
  computed: Record<string, string> | null;
  undo: Gesture[];
  redo: Gesture[];
  changes: ChangeEntry[];
  conflict: Conflict | null;
  refused: Refused | null;
  /** An edit request is on its way; panels do not send another. */
  busy: boolean;
  /** From `GET …/structure`, read again after every applied edit and `source` event (task D1). */
  structure: Structure | null;
  clipboard: Clip | null;
  /** Elements hidden in the frame only (spec 4b, decision 14). */
  hidden: string[];
  /** The frame box's scale, 0.25 to 2 (task D7). */
  zoom: number;
  menu: Menu | null;
};

/** The element an op is about, for the change list and "Ask Claude"; `null` for section and file ops. */
export function elementOf(op: EditOp): string | null {
  if ('id' in op) return op.id;
  if ('first' in op) return op.first;
  if ('anchor' in op) return op.anchor;
  return null;
}

export type Listener = (state: EditorState, previous: EditorState) => void;

export type Store = {
  get(): EditorState;
  set(patch: Partial<EditorState>): void;
  /** Returns the way to stop listening. */
  subscribe(listener: Listener): () => void;
};

export function initialState(slug: string): EditorState {
  return {
    slug,
    on: false,
    edit: null,
    etags: {},
    selection: [],
    hovered: null,
    tree: [],
    inspected: null,
    computed: null,
    undo: [],
    redo: [],
    changes: [],
    conflict: null,
    refused: null,
    busy: false,
    structure: null,
    clipboard: null,
    hidden: [],
    zoom: 1,
    menu: null,
  };
}

export function createStore(slug: string): Store {
  let state = initialState(slug);
  const listeners = new Set<Listener>();
  return {
    get: () => state,
    set(patch) {
      const previous = state;
      state = { ...state, ...patch };
      for (const listener of [...listeners]) listener(state, previous);
    },
    subscribe(listener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
  };
}
