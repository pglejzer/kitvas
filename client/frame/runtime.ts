// The prototype's side of the studio channel, bundled into every prototype as `kitvas-frame`.
// The generated entry hands it the draft's states and a `mount` that makes the draft's root; a
// root's `render` commits synchronously. Without `#kitvas=<channel>&studio=<port>` at the end of
// the address it only renders: the checks open prototypes that way, and so does a person opening
// the page on its own.
//
// One runtime runs a document. After an edit the studio asks for the new build with `swap`
// (ADR 0058): that build's bundle runs as one more script of the same document, finds this
// runtime and only hands itself over (`page/swap.ts`), and its render takes the place of the one
// shown. The listeners, the overlays and the page's scroll stay as they are.

import { isCanvasStudio } from '../channel/canvas-protocol.ts';
import { type ForceState, isLiveStudio, MAX_LONGHANDS } from '../channel/live-protocol.ts';
import { type FrameMessage, parseStudioMessage, readHash } from '../channel/protocol.ts';
import { createMotion } from './drag/motion.ts';
import { createEdit } from './edit/edit.ts';
import { createPreview } from './edit/preview.ts';
import { createStructure } from './edit/structure.ts';
import { createFlash } from './flash/flash.ts';
import { createForce } from './live/force.ts';
import { createLive } from './live/live.ts';
import { createPins } from './live/pins.ts';
import { createCanvas } from './page/canvas.ts';
import { createMarks } from './page/marks.ts';
import { measureElements, settle } from './page/measure.ts';
import { type Bundle, createSwap, pagePorts, register, running } from './page/swap.ts';
import { setTones } from './tones/tones.ts';

export type { Mounted } from './page/swap.ts';

/** What the generated entry hands over (`src/render/domain/mount.ts`). */
export type FrameInput = Bundle;

/**
 * `ready` goes out again after these delays until the studio says anything: the studio's script
 * may start after the frame, and a message sent before its listener exists is lost.
 */
const READY_AGAIN_MS = [500, 1500, 4000];

export function startFrame(input: FrameInput): void {
  // A runtime already runs this document: its `swap` asked for this bundle, and it takes it.
  const first = running();
  if (first) {
    first(input);
    return;
  }
  const { initial, runtime } = input;
  let { states } = input;
  let mounted = input.mount();
  mounted.render(initial);
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
  const preview = createPreview();
  // Edit mode stays off, with no listener on the page, until the studio turns it on.
  const edit = createEdit({ channel, post, preview });
  const structure = createStructure({ channel, post });
  // The screen's canvas (plan 15): forwards the zoom wheel, Space and the screen's keys.
  const canvas = createCanvas({ channel, post });
  // Stage 4c (plan 16): forced states, live measurements and the accessibility card.
  const force = createForce();
  const live = createLive({ channel, post });
  const pins = createPins();
  // The ring on an element a change was just applied to (ADR 0057).
  const flash = createFlash();
  let current = initial;
  let heard = false;
  /** What the studio forced last, to force it again on the elements of a new render. */
  let forced: { ids: string[]; state: ForceState } | null = null;

  const show = (state: string): void => {
    if (!states.includes(state)) return;
    if (state !== current) {
      const moved = motion.change(() => mounted.render(state));
      current = state;
      document.documentElement.dataset.state = state;
      marks.follow(moved);
      edit.follow(moved);
    }
    // Also when the state did not change, so the studio is never left waiting.
    post({ kitvas: 1, channel, type: 'shown', state });
  };

  const answer = async (request: number): Promise<void> => {
    await settle();
    post({ kitvas: 1, channel, type: 'elements', request, items: measureElements() });
  };

  const swap = createSwap({
    page: pagePorts(),
    runtime,
    // One step with no paint inside it: the old render out, the new sheet on, the new render in.
    take(bundle, sheet) {
      const left = window.scrollX;
      const top = window.scrollY;
      // What the previews remember are elements of the render that leaves.
      preview.clear();
      mounted.unmount();
      sheet.use();
      mounted = bundle.mount();
      states = bundle.states;
      // A state the new build no longer has: the one its own page would open with.
      if (!states.includes(current)) current = bundle.initial;
      mounted.render(current);
      // The page was empty for a moment, which took its scroll.
      window.scrollTo({ left, top, behavior: 'instant' });
      // The twins were made from the sheet that left, and the attribute sat on elements that did.
      force.clear();
      if (forced) force.set(forced.ids, forced.state);
    },
    answer(build, step) {
      if (step !== 'ready') post({ kitvas: 1, channel, type: 'swap', live: build, step });
      // As after a load: the studio tells this page again what it draws, and reads its tree.
      else post({ kitvas: 1, channel, type: 'ready', state: current, live: build });
    },
  });
  register(swap.hand);

  window.addEventListener('message', (event) => {
    if (event.source !== studio || event.origin !== studioOrigin) return;
    const message = parseStudioMessage(event.data, channel);
    if (!message) return;
    heard = true;
    if (message.type === 'measure') answer(message.request);
    else if (message.type === 'state') show(message.state);
    else if (message.type === 'marks') marks.draw(message.marks);
    else if (message.type === 'tones') setTones({ theme: message.theme, accent: message.accent });
    else if (message.type === 'flash') flash.show(message.ids);
    else if (message.type === 'swap') swap.ask(message.live);
    else if (isLiveStudio(message)) {
      if (message.type === 'force') {
        const { ids, state } = message;
        forced = state === null || ids.length === 0 ? null : { ids, state };
        force.set(ids, state);
      } else if (message.type === 'pins') pins.set(message.pins);
      else if (message.type === 'state-held') {
        const { request, id } = message;
        const longhands = force.held(id).slice(0, MAX_LONGHANDS);
        post({
          kitvas: 1,
          channel,
          type: 'state-held',
          request,
          id,
          state: force.state(),
          longhands,
        });
      } else {
        // A live check measures the forced state as it is now (ADR 0055).
        if (message.type === 'measure-live') force.flush();
        live.handle(message);
      }
    } else if (isCanvasStudio(message)) {
      // The labels and the handles keep one size on the screen at any canvas zoom.
      if (message.type === 'zoom') {
        edit.scale(1 / message.value);
        structure.scale(1 / message.value);
      } else canvas.handle(message);
    }
    // Every other message the parser lets through is one of the editor's.
    else {
      if (message.type === 'edit') {
        canvas.edit(message.on);
        if (!message.on) {
          force.clear();
          forced = null;
        }
      }
      edit.handle(message);
      structure.handle(message);
    }
  });

  const announce = (): void => {
    if (!heard) post({ kitvas: 1, channel, type: 'ready', state: current });
  };
  // `render` has committed the first state by now.
  announce();
  for (const delay of READY_AGAIN_MS) setTimeout(announce, delay);
}
