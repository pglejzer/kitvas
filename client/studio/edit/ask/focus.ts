// The way to the ask bar (redesign spec, goal 10; plan 19): the bar says how the cursor gets into
// it (`setAskFocus`); the key and the action bar's Ask Claude call `focusAsk`. With no bar on the
// page, or one that is off, nothing happens and the caller hears `false`.

let focus: (() => boolean) | null = null;

export function setAskFocus(next: (() => boolean) | null): void {
  focus = next;
}

/** Puts the cursor in the ask bar; false when the bar is off or not on the page. */
export function focusAsk(): boolean {
  return focus === null ? false : focus();
}
