// What the frame draws for the studio and takes off the page while a drag runs (ADR 0066): the
// marks, the note pins, the numbers of the live panel. Each keeps what it was last told to draw
// and draws it again when the drag ends. No DOM here: the caller says how a value is drawn.

export type Hushed<T> = {
  /** What is drawn from now on: at once, or when the hush ends. */
  set(value: T): void;
  /** `true` draws nothing until `false`, which draws the last value again. */
  hush(on: boolean): void;
};

/** `none`: the value that draws nothing. */
export function hushed<T>(draw: (value: T) => void, none: T): Hushed<T> {
  let last = none;
  let quiet = false;
  return {
    set(value) {
      last = value;
      if (!quiet) draw(value);
    },
    hush(on) {
      if (on === quiet) return;
      quiet = on;
      draw(on ? none : last);
    },
  };
}
