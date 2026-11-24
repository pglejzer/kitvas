// A drag that starts on the page, forwarded into the frame (spec 4b, decision 11; plan 14, task
// D7), in the frame's own CSS pixels: the page pointer minus the frame's box, divided by the zoom.
// Stage 4c: it goes to the card the pointer is over. A drag that moves into another card ends in
// the card it leaves and starts again in the one it enters, so a drop lands where it is seen.

import type { DragPhase, DragSource } from '../../../channel/structure-protocol.ts';
import { cardAt } from '../../canvas/card-rules.ts';
import { type Frame, sendEdit } from '../../frames.ts';
import type { EditorContext } from '../context.ts';

export type Point = { x: number; y: number };

export function toFramePoint(
  point: Point,
  frame: { left: number; top: number },
  zoom: number,
): Point {
  // The frame's rectangle is already scaled by the page, so the offset is divided as well.
  const scale = zoom > 0 && Number.isFinite(zoom) ? zoom : 1;
  return { x: (point.x - frame.left) / scale, y: (point.y - frame.top) / scale };
}

/** The card a drag is in, and what it carries, so a move into another card can start there. */
type Held = { frame: Frame; source: DragSource | null };
const drags = new WeakMap<object, Held>();

/** The cards of the context's bridge; the edit card alone for a bridge that names none. */
function cardsOf(ctx: EditorContext): Frame[] {
  const { bridge } = ctx;
  return typeof bridge.frames === 'function' ? bridge.frames() : [bridge.frame];
}

/** The card under `point`; the card the drag is in (or the edit card) over none of them. */
export function cardUnder(cards: readonly Frame[], point: Point, fallback: Frame): Frame {
  const rectOf = (frame: Frame) => frame.element.getBoundingClientRect();
  return cards.length > 1 ? (cardAt(cards, rectOf, point) ?? fallback) : fallback;
}

/** Sends one `drag` message for a page pointer at `point` (client pixels); `source` on `start`. */
export function forwardDrag(
  ctx: EditorContext,
  phase: DragPhase,
  point: Point,
  source: DragSource | null = null,
): void {
  const { bridge } = ctx;
  const held = drags.get(bridge);
  const frame = cardUnder(cardsOf(ctx), point, held?.frame ?? bridge.frame);
  const zoom = ctx.store.get().zoom;
  const to = (target: Frame, step: DragPhase, carried: DragSource | null): void => {
    const at = toFramePoint(point, target.element.getBoundingClientRect(), zoom);
    const body = { type: 'drag' as const, phase: step, source: carried, x: at.x, y: at.y };
    // The edit card through the bridge; another card straight, as the bridge sends to one card.
    if (target === bridge.frame) bridge.send(body);
    else sendEdit(target, body);
  };
  if (phase === 'start') {
    drags.set(bridge, { frame, source });
    to(frame, 'start', source);
    return;
  }
  if (held && held.frame !== frame && held.source) {
    to(held.frame, 'cancel', null);
    to(frame, 'start', held.source);
    held.frame = frame;
  }
  to(frame, phase, null);
  if (phase === 'end' || phase === 'cancel') drags.delete(bridge);
}
