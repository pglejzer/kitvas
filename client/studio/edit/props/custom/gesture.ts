// One gesture of the colour picker (plan 19, task T5; spec goal 14): while the pointer or a key
// moves, the canvas shows the colour (`preview`); the release, Enter or a blur writes it once, as
// one undo step; Escape takes the preview back and writes nothing. Pure: no DOM.

export type Gesture = {
  /** The colour now, shown on the canvas and held for the write. */
  move(css: string): void;
  /** Writes the last colour if it differs from what was written before; once per gesture. */
  end(): void;
  /** Escape: the old value is shown again and nothing is written. */
  cancel(): void;
  /** The value the source holds as far as this picker knows (what Escape returns to). */
  held(): string | null;
};

export function createGesture(options: {
  /** The value in the source when the picker opened, or `null`. */
  value: string | null;
  preview(css: string | null): void;
  write(css: string): void;
}): Gesture {
  let held = options.value;
  let pending: string | null = null;
  return {
    move(css) {
      pending = css;
      options.preview(css);
    },
    end() {
      const css = pending;
      pending = null;
      if (css === null) return;
      if (css === held) {
        options.preview(null);
        return;
      }
      held = css;
      options.write(css);
    },
    cancel() {
      if (pending !== null) options.preview(null);
      pending = null;
    },
    held: () => held,
  };
}
