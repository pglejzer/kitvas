// A small log of the pointer gestures in the frame (ADR 0066): the last changes of state of the
// drag session or of a handle, each with why the gesture ended. It is kept in memory and posted to
// the studio once when a gesture ends without its drop or its write, so a gesture that was lost
// can be read afterwards. No DOM here; `drag.ts` and `handles.ts` say what happened. The message
// and its words are `client/channel/gesture-protocol.ts`.

import {
  type GestureEnd,
  type GestureLogMessage,
  type GestureState,
  type GestureStep,
  type GestureTool,
  MAX_GESTURE_AT,
  MAX_GESTURE_STEPS,
} from '../../channel/gesture-protocol.ts';

export type {
  GestureEnd,
  GestureLogMessage,
  GestureState,
  GestureStep,
  GestureTool,
} from '../../channel/gesture-protocol.ts';
export {
  GESTURE_ENDS,
  GESTURE_STATES,
  GESTURE_TOOLS,
  MAX_GESTURE_AT,
  MAX_GESTURE_STEPS,
} from '../../channel/gesture-protocol.ts';

export type GestureLogDeps = {
  tool: GestureTool;
  channel: string;
  /** Milliseconds on a clock that only goes forward (`performance.now()`). */
  now(): number;
  post(message: GestureLogMessage): void;
};

export type GestureLog = {
  /** The gesture is in `state` now; `why` names something that went wrong on the way. */
  step(state: GestureState, why?: GestureEnd): void;
  /**
   * The gesture ended for `why`. `kept`: with its drop, its write or its click. One that was not
   * kept is posted, once, with the steps before it.
   */
  end(why: GestureEnd, kept: boolean): void;
  /** The steps kept, the oldest first. */
  steps(): GestureStep[];
};

export function createGestureLog(deps: GestureLogDeps): GestureLog {
  let log: GestureStep[] = [];

  function add(state: GestureState, why: GestureEnd | null): void {
    const now = deps.now();
    const at = Number.isFinite(now) ? Math.min(Math.max(0, Math.round(now)), MAX_GESTURE_AT) : 0;
    log = [...log, { at, state, why }].slice(-MAX_GESTURE_STEPS);
  }

  return {
    step(state, why) {
      add(state, why ?? null);
    },

    end(why, kept) {
      add('idle', why);
      if (kept) return;
      const { tool, channel } = deps;
      deps.post({ kitvas: 1, channel, type: 'gesture-log', tool, steps: [...log] });
    },

    steps: () => [...log],
  };
}
