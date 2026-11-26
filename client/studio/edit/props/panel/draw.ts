// When the properties panel draws (plan 18e, task 1, spec part A). Every change asks for a draw;
// the asks of one frame become one draw, and while an edit or a re-read is on its way the draw
// waits, so the panel never shows the old value of an element that is about to answer. Over
// injected ports, so it is tested without a browser; `panel.ts` wires it.

export type DrawScheduler = {
  /** A draw on the next frame; several requests before it draw once. */
  request(): void;
  /** No draw until `release`; counted, so two holds need two releases. */
  hold(): void;
  /** One count off, never below zero; draws once if a request came while held. */
  release(): void;
  held(): boolean;
};

export function createDrawScheduler(ports: {
  frame(run: () => void): void;
  draw(): void;
}): DrawScheduler {
  let holds = 0;
  let requested = false;
  let scheduled = false;

  function schedule(): void {
    if (scheduled) return;
    scheduled = true;
    ports.frame(() => {
      scheduled = false;
      // Held at the frame: the request stays, and the release schedules it again.
      if (holds > 0 || !requested) return;
      requested = false;
      ports.draw();
    });
  }

  return {
    request() {
      requested = true;
      if (holds === 0) schedule();
    },
    hold() {
      holds += 1;
    },
    release() {
      if (holds > 0) holds -= 1;
      if (holds === 0 && requested) schedule();
    },
    held: () => holds > 0,
  };
}
