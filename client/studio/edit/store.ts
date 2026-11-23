// The editor's state on the draft page (plan 13, client contract). One store; every panel reads it
// and changes it through `set`, and hears every change through `subscribe`. Panels never call each
// other: they share this state, the bridge to the frame, and the history.

import type { EditOp, Refusal } from '../../../src/edit/index.ts';
import type { EditOutcome, EditState, Inspect } from '../../../src/studio/api/edit-schemas.ts';
import type { TreeNode } from '../../channel/edit-protocol.ts';

/** One undo step: the ops of one gesture (task H), with the text the change list shows. */
export type Gesture = { ops: EditOp[]; label: string };

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
};

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
