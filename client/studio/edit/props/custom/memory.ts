// One memory for every "Custom..." of the properties panel (plan 19, task T5; spec goal 14). The
// list's foot item and the stepper's button both go through it, by the row's key, so a redraw
// draws the editor open and puts the cursor in it. It closes when a token is picked, when
// "Custom..." is pressed again, when the selection changes, on Escape (`cancel`: the cursor goes
// back to the opener), and on a press outside it or a blur of the window (`drop`: `outside.ts`
// hides the editor in place, so the press that closed it still reaches its own control; no redraw,
// no cursor moved). Pure: no DOM.

export type CustomMemory = {
  has(row: string): boolean;
  /** The stepper's button: opens a closed editor (with the cursor in it), closes an open one. */
  toggle(row: string): void;
  open(row: string): void;
  close(row: string): void;
  /**
   * Escape in the editor: closes it as `close` does, and the cursor goes back to what opened it
   * after the redraw. `false` when the memory did not hold the row (nothing is drawn again).
   */
  cancel(row: string): boolean;
  /**
   * A press outside: forgets the row without a redraw and without asking for the cursor, so the
   * press keeps its own target. `false` when the memory did not hold the row.
   */
  drop(row: string): boolean;
  /** Forgets every row: another element is selected. */
  clear(): void;
  /** The row whose editor should take the cursor after the next draw, once; else `null`. */
  takeFocus(): string | null;
  /** The row whose opener ("Custom..." or its list) takes the cursor after the next draw, once. */
  takeBack(): string | null;
};

/** `redraw` asks the panel to draw again; it is called after every change. */
export function createCustomMemory(redraw: () => void): CustomMemory {
  const rows = new Set<string>();
  let focus: string | null = null;
  let back: string | null = null;
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
    cancel(row) {
      if (!rows.has(row)) return false;
      back = row;
      rows.delete(row);
      if (focus === row) focus = null;
      redraw();
      return true;
    },
    drop(row) {
      if (!rows.delete(row)) return false;
      if (focus === row) focus = null;
      return true;
    },
    clear() {
      rows.clear();
      focus = null;
      back = null;
    },
    takeFocus() {
      const row = focus;
      focus = null;
      return row;
    },
    takeBack() {
      const row = back;
      back = null;
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
