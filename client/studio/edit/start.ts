// Starts the editor on a draft page whose version can be edited (the page marked `main` with
// `data-edit-panel`, or rendered `aside[data-edit-panel]` before plan 15). Returns the editor's
// handle for the draft page: where the current frame's edit messages go, and the store, which the
// canvas keeps the zoom in and reads the selection from. `undefined` when there is no editor.

import type { EditFrameMessage } from '../../channel/edit-protocol.ts';
import type { LiveFrameMessage } from '../../channel/live-protocol.ts';
import type { Frame } from '../frames.ts';
import { mountAi } from './ai/ai.ts';
import { getEditState } from './api.ts';
import { mountAskBar } from './ask/bar.ts';
import { createBridge } from './bridge.ts';
import type { EditorContext } from './context.ts';
import { mountAsk } from './history/ask.ts';
import { mountChanges } from './history/changes.ts';
import { createHistory } from './history/history.ts';
import { mountKeep } from './history/keep.ts';
import { mountSession } from './history/session.ts';
import { mountFrameDrop } from './insert/frame-drop.ts';
import { mountImages } from './insert/images.ts';
import { mountPalette } from './insert/palette.ts';
import { mountLayers } from './layers/layers.ts';
import { mountLive } from './live/live.ts';
import { mountWaivers } from './live/waivers.ts';
import { mountNotes } from './notes/notes.ts';
import { mountContextBar } from './props/context/context-bar.ts';
import { mountStateHeld } from './props/context/state-held.ts';
import { mountProps } from './props/panel/panel.ts';
import { mountKeys } from './select/keys.ts';
import { mountMode } from './select/mode.ts';
import { modeStorage, opensInEdit, readMode } from './select/mode-memory.ts';
import { mountRect } from './select/rect.ts';
import { mountRelease } from './select/release.ts';
import { mountSelTools } from './seltools/seltools.ts';
import { createStore, type Store } from './store.ts';
import { mountGestureNote } from './structure/gesture-note.ts';
import { mountLists } from './structure/lists.ts';
import { mountMenu } from './structure/menu.ts';
import { mountRefusalNote } from './structure/refusal-note.ts';
import { mountReorder } from './structure/reorder.ts';
import { mountStructure } from './structure/structure.ts';
import { mountHandleWrites } from './style/handle-writes.ts';
import { mountConflict } from './sync/conflict.ts';
import { watchSources } from './sync/live-frame.ts';
import { mountTimeline } from './timeline/timeline.ts';
import { mountView } from './view/view.ts';
import { mountWhy } from './why/why.ts';

export type Editor = {
  /** An edit message of the current frame. */
  receive(message: EditFrameMessage): void;
  /** A live message of a card's frame (stage 4c). */
  receiveLive(frame: Frame, message: LiveFrameMessage): void;
  store: Store;
};

export function startEditor(main: HTMLElement, frame: Frame): Editor | undefined {
  // The editor screen (plan 15) marks `main` itself; the older page had an aside.
  const panel = main.hasAttribute('data-edit-panel')
    ? main
    : main.querySelector('aside[data-edit-panel]');
  const slug = main.dataset.draft;
  if (!(panel instanceof HTMLElement) || slug === undefined) return undefined;
  const store = createStore(slug);
  const bridge = createBridge(frame);
  const deps = { slug, main, panel, store, bridge };
  const ctx: EditorContext = { ...deps, history: createHistory(deps) };
  mountMode(ctx);
  // Back on the latest version the editor opens in the mode the person chose before.
  if (opensInEdit(readMode(modeStorage(), slug), true)) store.set({ on: true });
  mountLayers(ctx);
  mountProps(ctx);
  mountConflict(ctx);
  mountChanges(ctx);
  mountAsk(ctx);
  watchSources(ctx);
  // Structure (plan 14).
  mountStructure(ctx);
  mountPalette(ctx);
  mountFrameDrop(ctx);
  // The frame's pointer gestures (ADR 0059): the selection rectangle and a reordered list item.
  mountRect(ctx);
  mountRelease(ctx);
  mountReorder(ctx);
  mountMenu(ctx);
  mountKeys(ctx);
  // A refused edit, an action that is off and a handle that wrote nothing say why (ADR 0065).
  mountRefusalNote(ctx);
  mountGestureNote(ctx);
  // The zoom is the canvas's (`client/studio/canvas/`), which works without the editor too.
  mountHandleWrites(ctx);
  // The editor screen (plan 15).
  mountSession(ctx);
  // Stage 4c (plan 16).
  mountContextBar(ctx);
  mountStateHeld(ctx);
  // Stage 4d (plan 17).
  mountAi(ctx);
  // The tools on the canvas (plan 19): the ask bar under it, the action bar and the variant pill
  // on the selection.
  mountAskBar(ctx);
  mountSelTools(ctx);
  mountNotes(ctx);
  mountView(ctx);
  mountTimeline(ctx);
  mountWhy(ctx);
  mountLive(ctx);
  mountLists(ctx);
  mountImages(ctx);
  mountWaivers(ctx);
  // The undo history kept across a reload is read once the edit state below is known (ADR 0061).
  mountKeep(ctx);
  getEditState(slug).then((answer) => {
    if (answer.ok) store.set({ edit: answer.body, etags: answer.body.etags });
  });
  return {
    receive: (message) => bridge.receive(message),
    receiveLive: (from, message) => bridge.receiveLive(from, message),
    store,
  };
}
