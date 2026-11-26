// A gesture in a "Custom..." editor holds the panel's draws (ADR 0077). A draw puts a new editor
// in the place of the open one; when it came while the pointer or an arrow key was down, the
// release never reached the editor that began the gesture, so the value stayed a preview on the
// canvas and was never written. The live checks answer about a second after a write, which is
// when a person is already in the next drag.

import type { DrawScheduler } from '../panel/draw.ts';

const ARROWS = new Set(['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown']);

/** What the hold listens on beyond the panel: the window, or a stand-in under test. */
export type HoldView = {
  addEventListener(type: string, listener: () => void, capture?: boolean): void;
  removeEventListener(type: string, listener: () => void, capture?: boolean): void;
};

/** One hold from a press (or an arrow key down) in an editor to its release, wherever that lands. */
export function createGestureHold(
  scheduler: Pick<DrawScheduler, 'hold' | 'release'>,
  view: HoldView,
): { pointerDown(): void; keyDown(key: string): void } {
  let pointer = false;
  let key = false;
  return {
    pointerDown() {
      if (pointer) return;
      pointer = true;
      scheduler.hold();
      const done = (): void => {
        view.removeEventListener('pointerup', done, true);
        view.removeEventListener('pointercancel', done, true);
        pointer = false;
        scheduler.release();
      };
      view.addEventListener('pointerup', done, true);
      view.addEventListener('pointercancel', done, true);
    },
    keyDown(name) {
      if (key || !ARROWS.has(name)) return;
      key = true;
      scheduler.hold();
      const done = (): void => {
        view.removeEventListener('keyup', done, true);
        view.removeEventListener('blur', done);
        key = false;
        scheduler.release();
      };
      view.addEventListener('keyup', done, true);
      // The key may come up in another window: the blur ends the hold.
      view.addEventListener('blur', done);
    },
  };
}

/** Wires the hold to the panel's scroll box: only gestures that begin inside an open editor. */
export function holdDrawsWhileEditing(
  box: HTMLElement,
  scheduler: Pick<DrawScheduler, 'hold' | 'release'>,
): void {
  const hold = createGestureHold(scheduler, window);
  const inEditor = (target: EventTarget | null): boolean =>
    target instanceof Element && target.closest('[data-custom-editor]') !== null;
  box.addEventListener(
    'pointerdown',
    (event) => {
      if (inEditor(event.target)) hold.pointerDown();
    },
    true,
  );
  box.addEventListener(
    'keydown',
    (event) => {
      if (inEditor(event.target)) hold.keyDown(event.key);
    },
    true,
  );
}
