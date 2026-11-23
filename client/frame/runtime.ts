// The prototype's side of the studio channel, bundled into every prototype as `kitvas-frame`.
// The generated entry hands it the draft's states and a `render` that commits synchronously.
// Without `#kitvas=<channel>&studio=<port>` at the end of the address it only renders: the checks
// open prototypes that way, and so does a person opening the page on its own.

import { type FrameMessage, parseStudioMessage, readHash } from '../channel/protocol.ts';
import { createMarks } from './marks.ts';
import { measureElements, settle } from './measure.ts';
import { createMotion } from './motion.ts';

export type FrameInput = {
  states: string[];
  initial: string;
  /** Renders one state; when it returns, the state is in the DOM. */
  render(state: string): void;
};

/**
 * `ready` goes out again after these delays until the studio says anything: the studio's script
 * may start after the frame, and a message sent before its listener exists is lost.
 */
const READY_AGAIN_MS = [500, 1500, 4000];

export function startFrame({ states, initial, render }: FrameInput): void {
  render(initial);
  const link = readHash(location.hash);
  // Not framed, or no channel asked for: nothing more to do.
  if (!link || window.parent === window) return;

  const { channel } = link;
  const studio = window.parent;
  // The studio and the prototype origin share the host name; only the port differs. `URL` writes
  // it the way `event.origin` does (no `:80`).
  const studioOrigin = new URL(`http://${location.hostname}:${link.studioPort}`).origin;
  const post = (message: FrameMessage): void => {
    studio.postMessage(message, studioOrigin);
  };
  const marks = createMarks();
  const motion = createMotion();
  let current = initial;
  let heard = false;

  const show = (state: string): void => {
    if (!states.includes(state)) return;
    if (state !== current) {
      const moved = motion.change(() => render(state));
      current = state;
      document.documentElement.dataset.state = state;
      marks.follow(moved);
    }
    // Also when the state did not change, so the studio is never left waiting.
    post({ kitvas: 1, channel, type: 'shown', state });
  };

  const answer = async (request: number): Promise<void> => {
    await settle();
    post({ kitvas: 1, channel, type: 'elements', request, items: measureElements() });
  };

  window.addEventListener('message', (event) => {
    if (event.source !== studio || event.origin !== studioOrigin) return;
    const message = parseStudioMessage(event.data, channel);
    if (!message) return;
    heard = true;
    if (message.type === 'measure') answer(message.request);
    else if (message.type === 'state') show(message.state);
    else marks.draw(message.marks);
  });

  const announce = (): void => {
    if (!heard) post({ kitvas: 1, channel, type: 'ready', state: current });
  };
  // `render` has committed the first state by now.
  announce();
  for (const delay of READY_AGAIN_MS) setTimeout(announce, delay);
}
