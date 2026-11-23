// The editor's line to the current frame: messages out through `sendEdit`, edit messages in from
// the draft page's one listener (client/studio/draft-page.ts), handed to every panel that listens.

import type { EditFrameMessage, EditStudioBody } from '../../channel/edit-protocol.ts';
import { type Frame, sendEdit } from '../frames.ts';

export type FrameListener = (message: EditFrameMessage) => void;

export type Bridge = {
  /** The current frame; the live loop (task E) loads it again after a build. */
  frame: Frame;
  send(body: EditStudioBody): void;
  /** Returns the way to stop listening. */
  on(listener: FrameListener): () => void;
  /** Called by the draft page for every edit message of the current frame. */
  receive(message: EditFrameMessage): void;
  /** A fresh number for a `tree` or `inspect` request; an answer to an older one is dropped. */
  nextRequest(): number;
};

export function createBridge(frame: Frame): Bridge {
  const listeners = new Set<FrameListener>();
  let requests = 0;
  return {
    frame,
    send: (body) => sendEdit(frame, body),
    on(listener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    receive(message) {
      for (const listener of [...listeners]) listener(message);
    },
    nextRequest: () => {
      requests += 1;
      return requests;
    },
  };
}
