// The editor screen's keys on the page (plan 15, C2). A key reaches the page two ways: pressed on
// the page itself, or pressed in a frame and forwarded as a `shell-key` message. Both end here, so
// each listener (the panels, the canvas) hears every key once, whichever way it came.

import type { ShellKey } from '../../channel/canvas-protocol.ts';

type Listener = (key: ShellKey) => void;

const listeners = new Set<Listener>();

/** Listens for screen keys; returns the function that stops listening. */
export function onShellKey(listener: Listener): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

/** Hands a screen key to every listener. */
export function emitShellKey(key: ShellKey): void {
  for (const listener of listeners) listener(key);
}
