// The editor's state on the draft page (plan 13, client contract). One store; every panel reads it
// and changes it through `set`, and hears every change through `subscribe`. Panels never call each
// other: they share this state, the bridge to the frame, and the history.

import type { EditOp, Refusal, StyleContext } from '../../../src/edit/index.ts';
import type { EditOutcome, EditState, Inspect } from '../../../src/studio/api/edit/edit-schemas.ts';
import type { LiveCodeFinding } from '../../../src/studio/api/edit/live-schemas.ts';
import type { Structure } from '../../../src/studio/api/edit/structure-schemas.ts';
import type { NoteView } from '../../../src/studio/api/notes/note-schemas.ts';
import type { Listening, RequestView } from '../../../src/studio/api/requests/request-schemas.ts';
import type { Waiver } from '../../../src/studio/api/waivers/waiver-schemas.ts';
import type { CopyRef, TreeNode } from '../../channel/edit-protocol.ts';
import type { A11yCard } from '../../channel/live-protocol.ts';
import type { StateHeld } from './props/state-held.ts';
import { settle } from './select/copies.ts';

/**
 * One undo step: the ops of one gesture (task H), with the text the change list shows.
 * `undoOps`: the exact inverse the server answered with (spec 4b, decision 4); undo and redo send
 * it, and the stack entry moved to the other stack carries the next answer's inverse (task D1).
 */
/**
 * `selectCreated`: select the elements the answer created (insert, paste, duplicate, wrap).
 * `flash`: a button made the change, not the person's hand on the element (a variant, a
 * suggestion, "Bring back"): once it is applied a ring flashes on what it touched (ADR 0057).
 * `renames`: what the step's own answer renamed (old id → new id), so its undo turns them round;
 * kept on the step, so the history kept across a reload has them too (ADR 0061).
 */
export type Gesture = {
  ops: EditOp[];
  label: string;
  undoOps?: EditOp[];
  selectCreated?: boolean;
  flash?: boolean;
  renames?: Readonly<Record<string, string>>;
};

/** What copy and cut keep (task D4): each element's source and the TSX file it came from. */
export type Clip = { items: { source: string; from: string }[]; text: string; at: number };

/** The context menu, open at page pixels, for an element or for none (task D3). */
export type Menu = {
  id: string | null;
  x: number;
  y: number;
  /** The copy under the pointer, when the frame named one. */
  copy?: CopyRef;
  /** The element's box in page pixels, when the menu came from the frame. */
  box?: { x: number; y: number; width: number; height: number };
};

/** One line of the session's change list (task J). */
/**
 * One live finding (spec 4c, goal 5). `source`: `frame` for a measurement in a card (`width` is the
 * card's), `code` for a code check of a changed file (`width` null). `id`: the element, when known.
 */
export type LiveItem = {
  id: string | null;
  rule: string;
  severity: 'fix' | 'review';
  width: number | null;
  message: string;
  source: 'frame' | 'code';
};

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
/**
 * A change, an undo or a redo the studio did not save: the request got no answer, or an error
 * (ADR 0061). Both stacks stay as they were; the next answered request clears it.
 */
export type Failed = { kind: 'apply' | 'undo' | 'redo'; gesture: Gesture; status: number };

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
  /**
   * Elements the canvas cannot select or drag and the editor will not change (spec 4d, goal 4:
   * kept in `view.json` by task C, so they survive a reload).
   */
  locked: string[];
  // Stage 4c (plan 16).
  /**
   * The one chosen copy of `selection[0]`, when the selection is that one id with one chosen
   * copy; else `null`. Worked out with `copies` by `select/copies.ts`, never set alone.
   */
  item: number | null;
  /**
   * The chosen copies of the selected ids (ADR 0065): what a click, Ctrl+click or the rectangle
   * took. An id of `selection` with no entry here is the element itself, every copy (a row of the
   * layers list, a key).
   */
  copies: CopyRef[];
  /** Where style edits go: the edit card's width (`null` all widths) and the state bar's state. */
  context: StyleContext;
  /** The session's live findings: the frame's measurements and the code checks of changed files. */
  live: LiveItem[];
  /** The draft's accepted findings (`waivers.json`). */
  waivers: Waiver[];
  /** The last applied request (edit, undo or redo): the elements it touched, after renames. */
  applied: { count: number; ids: string[]; live: LiveCodeFinding[] } | null;
  /** Builds the edit frames loaded since the editor started: live checks measure after each. */
  builds: number;
  /** The accessibility card of `selection[0]` from the edit card's frame (task C). */
  a11y: A11yCard | null;
  /** What the kit's own rules of the edited state hold on `selection[0]` (ADR 0055). */
  stateHeld: StateHeld | null;
  // Stage 4d (plan 17).
  /** The draft's requests to Claude, newest first (task A's routes; task B shows them). */
  requests: RequestView[];
  /** Whether a Claude Code session takes requests now. */
  listening: Listening;
  /** The draft's notes, with each element's id in the latest version (task C). */
  notes: NoteView[];
  /** Locked ids another writer changed since they were locked: `edit/locked-changed` (task C). */
  lockChanged: string[];
  /** The version the timeline shows, read only; `null` for the current one (task D). */
  viewing: number | null;
  /** The variant previewed in the frame now (task B). */
  variant: { request: string; index: number } | null;
  /** The frame box's scale, 0.25 to 2 (task D7). */
  zoom: number;
  menu: Menu | null;
  // Plan 18b (ADR 0061).
  /** The last change, undo or redo the studio did not save; `null` once a request is answered. */
  failed: Failed | null;
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
    locked: [],
    item: null,
    copies: [],
    context: { width: null, state: null },
    live: [],
    waivers: [],
    applied: null,
    builds: 0,
    a11y: null,
    stateHeld: null,
    requests: [],
    listening: { state: 'off', since: null },
    notes: [],
    lockChanged: [],
    viewing: null,
    variant: null,
    zoom: 1,
    menu: null,
    failed: null,
  };
}

export function createStore(slug: string): Store {
  let state = initialState(slug);
  const listeners = new Set<Listener>();
  return {
    get: () => state,
    set(patch) {
      const previous = state;
      const next = { ...state, ...patch };
      // The one place that sets a selection with its copies (ADR 0065). A selection set alone
      // names elements, not copies (a row of the layers list, a key), so it keeps none; `item`
      // follows from the two.
      if (patch.selection !== undefined || patch.copies !== undefined) {
        const settled = settle(next.selection, patch.copies ?? [], previous.copies);
        next.copies = settled.copies;
        next.item = settled.item;
      }
      state = next;
      for (const listener of [...listeners]) listener(state, previous);
    },
    subscribe(listener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
  };
}
