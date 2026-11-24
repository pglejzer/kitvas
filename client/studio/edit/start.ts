// Starts the editor on a draft page whose version can be edited (the page marked `main` with
// `data-edit-panel`, or rendered `aside[data-edit-panel]` before plan 15). Returns the editor's
// handle for the draft page: where the current frame's edit messages go, and the store, which the
// canvas keeps the zoom in and reads the selection from. `undefined` when there is no editor.

import type { EditFrameMessage } from '../../channel/edit-protocol.ts';
import type { Frame } from '../frames.ts';
import { getEditState } from './api.ts';
import { mountAsk } from './ask.ts';
import { createBridge } from './bridge.ts';
import { mountChanges } from './changes.ts';
import { mountConflict } from './conflict.ts';
import type { EditorContext } from './context.ts';
import { mountFrameDrop } from './frame-drop.ts';
import { mountHandleWrites } from './handle-writes.ts';
import { createHistory } from './history.ts';
import { mountKeys } from './keys.ts';
import { mountLayers } from './layers.ts';
import { watchSources } from './live-frame.ts';
import { mountMenu } from './menu.ts';
import { mountMode } from './mode.ts';
import { mountPalette } from './palette.ts';
import { mountProps } from './props-panel.ts';
import { mountSession } from './session.ts';
import { createStore, type Store } from './store.ts';
import { mountStructure } from './structure.ts';

export type Editor = {
  /** An edit message of the current frame. */
  receive(message: EditFrameMessage): void;
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
  getEditState(slug).then((answer) => {
    if (answer.ok) store.set({ edit: answer.body, etags: answer.body.etags });
  });
  return { receive: (message) => bridge.receive(message), store };
}
