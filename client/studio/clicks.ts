// Which clicks on a link the page may handle itself instead of the browser.

/** The parts of a click that decide it; a `MouseEvent` has them all. */
export type ClickInfo = {
  button: number;
  altKey: boolean;
  ctrlKey: boolean;
  metaKey: boolean;
  shiftKey: boolean;
  defaultPrevented: boolean;
};

/** The main button with no key held: no new tab, window or download asked for. */
export function isPlainClick(click: ClickInfo): boolean {
  return (
    !click.defaultPrevented &&
    click.button === 0 &&
    !click.altKey &&
    !click.ctrlKey &&
    !click.metaKey &&
    !click.shiftKey
  );
}
