// When the live checks measure (spec 4c, anti-goal 3; plan 16, task C): after a build, never
// before it, a moment after the cards loaded it, and never while a drag or typing goes on. The
// rules are here over an injected clock, so they are tested without a browser; `live.ts` tells
// the loop what happens and does the measuring when the loop says so.

/** How long after the cards show a build the measuring waits for another one. */
export const DEBOUNCE_MS = 250;
/** Typing this recently holds the measuring back until the keys rest. */
export const TYPING_MS = 700;

export type LoopIo = {
  /** Calls `fn` once after `ms`; the function it returns cancels that call. */
  after(ms: number, fn: () => void): () => void;
  now(): number;
};

export type LoopHooks = {
  /** Measures now. */
  measure(): void;
  /** There are findings to look at again after a build no edit of this page asked for. */
  worth(): boolean;
};

export type LiveLoop = {
  /** An edit, undo or redo was applied while the cards had shown `builds` builds. */
  applied(builds: number): void;
  /** The cards show a new build; `builds` counts them. */
  built(builds: number): void;
  /** A drag on the page or a handle in a frame started (`true`) or ended. */
  dragging(on: boolean): void;
  /** A key went down on the page. */
  typed(): void;
  /** Edit went off: nothing waits any more. */
  stop(): void;
};

export function createLiveLoop(io: LoopIo, hooks: LoopHooks): LiveLoop {
  /** The build count when the latest request was applied; only a later build shows it. */
  let appliedAt = -1;
  /** An applied request has not been measured yet. */
  let waiting = false;
  let dragging = false;
  let typedAt = Number.NEGATIVE_INFINITY;
  /** The timer went off during a drag: the end of the drag measures. */
  let held = false;
  let cancel: (() => void) | null = null;

  const disarm = (): void => {
    cancel?.();
    cancel = null;
  };

  const arm = (ms: number): void => {
    disarm();
    cancel = io.after(ms, fire);
  };

  function fire(): void {
    cancel = null;
    if (dragging) {
      held = true;
      return;
    }
    const rest = io.now() - typedAt;
    if (rest < TYPING_MS) {
      arm(TYPING_MS - rest);
      return;
    }
    waiting = false;
    hooks.measure();
  }

  return {
    applied(builds) {
      appliedAt = builds;
      waiting = true;
      held = false;
      // Its build is still to come; an earlier build's measuring would show the page before it.
      disarm();
    },
    built(builds) {
      if (builds <= appliedAt) return;
      if (!waiting && !hooks.worth()) return;
      held = false;
      arm(DEBOUNCE_MS);
    },
    dragging(on) {
      dragging = on;
      if (on || !held) return;
      held = false;
      arm(DEBOUNCE_MS);
    },
    typed() {
      typedAt = io.now();
    },
    stop() {
      disarm();
      held = false;
      waiting = false;
    },
  };
}
