// A drag that starts on the page, forwarded into the frame (spec 4b, decision 11; plan 14, task D7), in the
// frame's own CSS pixels: the page pointer minus the frame's box, divided by the zoom.

import type { DragPhase, DragSource } from '../../channel/structure-protocol.ts';
import type { EditorContext } from './context.ts';

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

/** Sends one `drag` message for a page pointer at `point` (client pixels); `source` on `start`. */
export function forwardDrag(
  ctx: EditorContext,
  phase: DragPhase,
  point: Point,
  source: DragSource | null = null,
): void {
  const box = ctx.bridge.frame.element.getBoundingClientRect();
  const at = toFramePoint(point, box, ctx.store.get().zoom);
  ctx.bridge.send({
    type: 'drag',
    phase,
    source: phase === 'start' ? source : null,
    x: at.x,
    y: at.y,
  });
}
