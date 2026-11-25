// A release the page hears over a card (ADR 0066). A press that began in a frame belongs to the
// frame, and so does its release. The browser now and then hands that release to the page instead,
// with the frame's element as its target: the frame then waits for an end that never comes, and a
// drag or a handle stays held until the next press. The page passes such a release on, in the
// frame's own pixels. A frame with no press of its own does nothing with it, so the end of a drag
// that began on the page (the palette, a layer) costs one message and changes nothing.

import type { EditStudioBody } from '../../../channel/edit-protocol.ts';
import { type Frame, sendEdit } from '../../frames.ts';
import type { EditorContext } from '../context.ts';
import { type Point, toFramePoint } from './forward.ts';

/** What the page reads from the release: where it was, and the keys held with it. */
export type PageRelease = Point & { shift: boolean; alt: boolean };

type ReleaseBody = Extract<EditStudioBody, { type: 'release' }>;

/** The card whose own element a pointer event of the page hit. */
export function cardOf(cards: readonly Frame[], target: unknown): Frame | undefined {
  return cards.find((card) => card.element === target);
}

/** The message for a release at `at` (client pixels) over a card whose box starts at `box`. */
export function releaseBody(
  at: PageRelease,
  box: { left: number; top: number },
  zoom: number,
): ReleaseBody {
  const point = toFramePoint(at, box, zoom);
  return { type: 'release', x: point.x, y: point.y, shift: at.shift, alt: at.alt };
}

/**
 * Passes a release on to the card it hit, and says which one; `undefined` when the target is no
 * card. `send` is the way to one card (`sendEdit`), a parameter so a test can listen.
 */
export function passRelease(
  ctx: EditorContext,
  target: unknown,
  at: PageRelease,
  send: (frame: Frame, body: ReleaseBody) => void = sendEdit,
): Frame | undefined {
  const frame = cardOf(ctx.bridge.frames(), target);
  if (!frame) return undefined;
  send(frame, releaseBody(at, frame.element.getBoundingClientRect(), ctx.store.get().zoom));
  return frame;
}

export function mountRelease(ctx: EditorContext): void {
  window.addEventListener(
    'pointerup',
    (event) => {
      const { clientX: x, clientY: y, shiftKey: shift, altKey: alt } = event;
      passRelease(ctx, event.target, { x, y, shift, alt });
    },
    { capture: true },
  );
}
