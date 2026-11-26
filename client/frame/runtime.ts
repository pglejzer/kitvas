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
//
// The lens pins (plan 19, `lens/pins.ts`) have a reader of their own (`lens-protocol.ts`), asked
// before the others; their overlay is made first, so its listeners on the window run first.

import { isCanvasStudio } from '../channel/canvas-protocol.ts';
import { type LensPin, readLensStudio } from '../channel/lens-protocol.ts';
import {
  type ForceState,
  isLiveStudio,
  MAX_LONGHANDS,
  type NotePin,
} from '../channel/live-protocol.ts';
import { type FrameMessage, type Mark, parseStudioMessage, readHash } from '../channel/protocol.ts';
import { createMotion } from './drag/motion/motion.ts';
import { createEdit } from './edit/edit.ts';
import { createPreview } from './edit/preview.ts';
import { createStructure } from './edit/structure.ts';
import { createFlash } from './flash/flash.ts';
import { createLensPins } from './lens/pins.ts';
import { createForce } from './live/force.ts';
import { createLive } from './live/live.ts';
import { createPins } from './live/pins.ts';
import { createCanvas } from './page/canvas.ts';
import { hushed } from './page/hush.ts';
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
  // A page the studio loaded again opens where it was, once; a shorter page ends at its bottom.
  if (link?.scroll) {
    window.scrollTo({ left: link.scroll.x, top: link.scroll.y, behavior: 'instant' });
  }
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
  // First of all: a press on a lens pin is stopped before the editor and the gestures hear it.
  const lensPins = createLensPins({
    report: (key) => studio.postMessage({ kitvas: 1, channel, type: 'pin', key }, studioOrigin),
  });
  const marks = createMarks();
  const motion = createMotion();
  const preview = createPreview();
  // Edit mode stays off, with no listener on the page, until the studio turns it on.
  const edit = createEdit({ channel, post, preview });
  // Stage 4c (plan 16): live measurements, the accessibility card and the note pins.
  const live = createLive({ channel, post });
  const pins = createPins();
  // What the studio has the frame draw leaves the page while a drag runs (ADR 0066).
  const shownMarks = hushed<Mark[]>((value) => marks.draw(value), []);
  const shownPins = hushed<NotePin[]>((value) => pins.set(value), []);
  const shownLens = hushed<LensPin[]>((value) => lensPins.set(value), []);
  // Made before the canvas: its listeners on the window run before the canvas's keys.
  const structure = createStructure({
    channel,
    post,
    quiet(on) {
      edit.quiet(on);
      shownMarks.hush(on);
      shownPins.hush(on);
      shownLens.hush(on);
    },
    // A gesture that was lost (`drag/gesture/gesture-log.ts`): its last steps, for whoever reads them.
    report: (message) => studio.postMessage(message, studioOrigin),
  });
  // The screen's canvas (plan 15): forwards the zoom wheel, Space and the screen's keys.
  const canvas = createCanvas({ channel, post });
  // Stage 4c (plan 16): forced states.
  const force = createForce();
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
      lensPins.follow(moved);
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
      // A press that has not become a drag yet does not hold the page: its log hears of the build.
      structure.swapped();
      // The pins find their elements in the new render.
      lensPins.swapped();
    },
    scroll: () => ({ x: window.scrollX, y: window.scrollY }),
    answer(build, step, scroll) {
      if (step !== 'ready') {
        post(
          scroll
            ? { kitvas: 1, channel, type: 'swap', live: build, step, scroll }
            : { kitvas: 1, channel, type: 'swap', live: build, step },
        );
      }
      // As after a load: the studio tells this page again what it draws, and reads its tree.
      else post({ kitvas: 1, channel, type: 'ready', state: current, live: build });
    },
  });
  register(swap.hand);

  window.addEventListener('message', (event) => {
    if (event.source !== studio || event.origin !== studioOrigin) return;
    // The lens's pins, in Preview as in Edit (plan 19).
    const lens = readLensStudio(event.data, channel);
    if (lens) {
      heard = true;
      shownLens.set(lens.pins);
      return;
    }
    const message = parseStudioMessage(event.data, channel);
    if (!message) return;
    heard = true;
    if (message.type === 'measure') answer(message.request);
    else if (message.type === 'state') show(message.state);
    else if (message.type === 'marks') shownMarks.set(message.marks);
    else if (message.type === 'tones') setTones({ theme: message.theme, accent: message.accent });
    else if (message.type === 'flash') flash.show(message.ids);
    else if (message.type === 'swap') swap.ask(message.live);
    else if (isLiveStudio(message)) {
      if (message.type === 'force') {
        const { ids, state } = message;
        forced = state === null || ids.length === 0 ? null : { ids, state };
        force.set(ids, state);
      } else if (message.type === 'pins') shownPins.set(message.pins);
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
