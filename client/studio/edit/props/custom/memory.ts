// One memory for every "Custom..." of the properties panel (plan 19, task T5; spec goal 14). The
// list's foot item and the stepper's button both go through it, by the row's key, so a redraw
// draws the editor open and puts the cursor in it. It closes when a token is picked, when
// "Custom..." is pressed again, or when the selection changes. Pure: no DOM.

export type CustomMemory = {
  has(row: string): boolean;
  /** The stepper's button: opens a closed editor (with the cursor in it), closes an open one. */
  toggle(row: string): void;
  open(row: string): void;
  close(row: string): void;
  /** Forgets every row: another element is selected. */
  clear(): void;
  /** The row whose editor should take the cursor after the next draw, once; else `null`. */
  takeFocus(): string | null;
};

/** `redraw` asks the panel to draw again; it is called after every change. */
export function createCustomMemory(redraw: () => void): CustomMemory {
  const rows = new Set<string>();
  let focus: string | null = null;
  return {
    has: (row) => rows.has(row),
    toggle(row) {
      if (rows.delete(row)) {
        if (focus === row) focus = null;
      } else {
        rows.add(row);
        focus = row;
      }
      redraw();
    },
    open(row) {
      rows.add(row);
      focus = row;
      redraw();
    },
    close(row) {
      if (!rows.delete(row)) return;
      if (focus === row) focus = null;
      redraw();
    },
    clear() {
      rows.clear();
      focus = null;
    },
    takeFocus() {
      const row = focus;
      focus = null;
      return row;
    },
  };
}

/** What choosing an item of a token list does to the editor under it. */
export type ListChoice = 'show' | 'hide' | 'token';

/**
 * `custom` is the foot item, `raw` the item that names the value now in the source. "Custom..."
 * pressed while its editor is shown closes it; a token closes it too.
 */
export function listChoice(
  value: string,
  shown: boolean,
  items: { custom: string; raw: string },
): ListChoice {
  if (value === items.custom) return shown ? 'hide' : 'show';
  return value === items.raw ? 'show' : 'token';
}
