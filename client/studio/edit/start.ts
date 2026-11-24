// Starts the editor on a draft page whose version can be edited (the page rendered
// `aside[data-edit-panel]`). Returns the handler the draft page passes the current frame's edit
// messages to; `undefined` when there is no editor on the page.

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
import { createStore } from './store.ts';
import { mountStructure } from './structure.ts';
import { mountZoom } from './zoom.ts';

export function startEditor(
  main: HTMLElement,
  frame: Frame,
): ((message: EditFrameMessage) => void) | undefined {
  const panel = main.querySelector('aside[data-edit-panel]');
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
  mountZoom(ctx);
  mountHandleWrites(ctx);
  getEditState(slug).then((answer) => {
    if (answer.ok) store.set({ edit: answer.body, etags: answer.body.etags });
  });
  return (message) => bridge.receive(message);
}
