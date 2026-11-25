// The drag of a palette tile to the frame: movement past `DRAG_THRESHOLD` starts it, the frame
// decides the drop (`forwardDrag`). A drag ends in a click event; `takeSuppressed` swallows that one.

import type { EditorContext } from '../context.ts';
import { forwardDrag } from '../select/forward.ts';
import { DRAG_THRESHOLD, type Item, labelOf } from './rules.ts';

export type ItemDrag = {
  /** Wires the pointer events of `button` to drag `item`. */
  wire(button: HTMLElement, item: Item): void;
  /** The item being dragged now, or `null`. */
  current(): Item | null;
  /** Ends the drag the frame has answered. */
  clear(): void;
  /** True once after a drag: the click that follows it must do nothing. */
  takeSuppressed(): boolean;
};

export function createItemDrag(ctx: EditorContext): ItemDrag {
  let dragging: Item | null = null;
  let suppressClick = false;

  /** Pointer capture keeps the move events coming while the pointer is over the frame. */
  function wire(button: HTMLElement, item: Item): void {
    let start: { x: number; y: number } | null = null;
    let moving = false;
    const point = (event: PointerEvent): { x: number; y: number } => ({
      x: event.clientX,
      y: event.clientY,
    });
    const finish = (phase: 'end' | 'cancel', event: PointerEvent): void => {
      if (moving) {
        forwardDrag(ctx, phase, point(event));
        suppressClick = true;
        if (phase === 'cancel') dragging = null;
      }
      start = null;
      moving = false;
    };
    button.addEventListener('pointerdown', (event) => {
      if (event.button !== 0) return;
      start = point(event);
      button.setPointerCapture(event.pointerId);
    });
    button.addEventListener('pointermove', (event) => {
      if (start === null) return;
      if (moving) {
        forwardDrag(ctx, 'move', point(event));
        return;
      }
      if (Math.hypot(event.clientX - start.x, event.clientY - start.y) <= DRAG_THRESHOLD) return;
      moving = true;
      dragging = item;
      forwardDrag(ctx, 'start', point(event), { kind: 'insert', label: labelOf(item) });
    });
    button.addEventListener('pointerup', (event) => finish('end', event));
    button.addEventListener('pointercancel', (event) => finish('cancel', event));
    button.addEventListener('keydown', (event) => {
      if (event.key !== 'Escape' || !moving) return;
      forwardDrag(ctx, 'cancel', { x: 0, y: 0 });
      dragging = null;
      suppressClick = true;
      start = null;
      moving = false;
    });
  }

  return {
    wire,
    current: () => dragging,
    clear: () => {
      dragging = null;
    },
    takeSuppressed: () => {
      const was = suppressClick;
      suppressClick = false;
      return was;
    },
  };
}
