// Starts the editor on a draft page whose version can be edited (the page marked `main` with
// `data-edit-panel`, or rendered `aside[data-edit-panel]` before plan 15). Returns the editor's
// handle for the draft page: where the current frame's edit messages go, and the store, which the
// canvas keeps the zoom in and reads the selection from. `undefined` when there is no editor.

import type { EditFrameMessage } from '../../channel/edit-protocol.ts';
import type { LiveFrameMessage } from '../../channel/live-protocol.ts';
import type { Frame } from '../frames.ts';
import { getEditState } from './api.ts';
import { createBridge } from './bridge.ts';
import type { EditorContext } from './context.ts';
import { mountAsk } from './history/ask.ts';
import { mountChanges } from './history/changes.ts';
import { createHistory } from './history/history.ts';
import { mountSession } from './history/session.ts';
import { mountFrameDrop } from './insert/frame-drop.ts';
import { mountImages } from './insert/images.ts';
import { mountPalette } from './insert/palette.ts';
import { mountLayers } from './layers/layers.ts';
import { mountLive } from './live/live.ts';
import { mountWaivers } from './live/waivers.ts';
import { mountContextBar } from './props/context-bar.ts';
import { mountProps } from './props/panel.ts';
import { mountStateHeld } from './props/state-held.ts';
import { mountKeys } from './select/keys.ts';
import { mountMode } from './select/mode.ts';
import { createStore, type Store } from './store.ts';
import { mountLists } from './structure/lists.ts';
import { mountMenu } from './structure/menu.ts';
import { mountStructure } from './structure/structure.ts';
import { mountHandleWrites } from './style/handle-writes.ts';
import { mountConflict } from './sync/conflict.ts';
import { watchSources } from './sync/live-frame.ts';

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
  mountMenu(ctx);
  mountKeys(ctx);
  // The zoom is the canvas's (`client/studio/canvas/`), which works without the editor too.
  mountHandleWrites(ctx);
  // The editor screen (plan 15).
  mountSession(ctx);
  // Stage 4c (plan 16).
  mountContextBar(ctx);
  mountStateHeld(ctx);
  mountLive(ctx);
  mountLists(ctx);
  mountImages(ctx);
  mountWaivers(ctx);
  getEditState(slug).then((answer) => {
    if (answer.ok) store.set({ edit: answer.body, etags: answer.body.etags });
  });
  return {
    receive: (message) => bridge.receive(message),
    receiveLive: (from, message) => bridge.receiveLive(from, message),
    store,
  };
}
