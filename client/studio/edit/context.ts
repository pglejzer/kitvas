// What every panel of the editor gets (plan 13, client contract).

import type { EditOutcome } from '../../../src/studio/api/edit/edit-schemas.ts';
import type { Bridge } from './bridge.ts';
import type { Gesture, Store } from './store.ts';

/** Task H: the only way panels send edits. Undo and redo send inverses through the same path. */
export type History = {
  /**
   * Sends the gesture's ops with the editor's ETags. Applied: the gesture goes on the undo stack,
   * redo is cleared, the ETags and `edit.session` are updated. Conflict: `conflict` is set.
   * Refused: `refused` is set. `null` when the request did not get an answer.
   */
  apply(gesture: Gesture): Promise<EditOutcome | null>;
  undo(): Promise<void>;
  redo(): Promise<void>;
  /** The conflict choice "keep mine": the same ops again with `force`. */
  keepMine(): Promise<void>;
  /** The conflict choice "keep theirs": the gesture is dropped, the new ETag kept. */
  keepTheirs(): void;
};

export type EditorContext = {
  slug: string;
  /** `main.draft-page`. */
  main: HTMLElement;
  /** The screen, `main[data-edit-panel]` (src/studio/pages/draft/draft-page.ts), with both side panels. */
  panel: HTMLElement;
  store: Store;
  bridge: Bridge;
  history: History;
};

/** The parts of the context the history is made from. */
export type HistoryDeps = Omit<EditorContext, 'history'>;
