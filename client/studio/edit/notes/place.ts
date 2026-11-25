// Where the note form stands and which keys save it: pure rules, so the dialog's script stays
// short. Pixels are the window's.

/** The gap between the form and what it stands beside, and to the window's edge. */
export const FORM_GAP = 12;

export type Box = { x: number; y: number; width: number; height: number };
export type Size = { width: number; height: number };

/** Ctrl+Enter and Cmd+Enter save; Enter alone is a new line. */
export function savesNote(event: {
  key: string;
  ctrlKey: boolean;
  metaKey: boolean;
  isComposing?: boolean;
}): boolean {
  return event.key === 'Enter' && (event.ctrlKey || event.metaKey) && event.isComposing !== true;
}

/**
 * What a form opened from a context menu stands beside: the element's box when the menu has one,
 * else the point of the click as a box with no size.
 */
export function menuAnchor(click: { x: number; y: number; box?: Box }): Box {
  return click.box ?? { x: click.x, y: click.y, width: 0, height: 0 };
}

function within(value: number, low: number, high: number): number {
  return Math.max(low, Math.min(value, high));
}

/**
 * The form's top left corner beside `anchor` (the element, or the point of the click as a box
 * with no size): to its right, else to its left, else under it, else over it. Always whole inside
 * the window. When no side has room (a window the form hardly fits), it stands at the window's
 * edge on the side with more room.
 */
export function placeBeside(anchor: Box, size: Size, view: Size): { left: number; top: number } {
  const top = within(anchor.y, FORM_GAP, Math.max(FORM_GAP, view.height - size.height - FORM_GAP));
  const right = anchor.x + anchor.width + FORM_GAP;
  if (right + size.width + FORM_GAP <= view.width) return { left: right, top };
  const left = anchor.x - FORM_GAP - size.width;
  if (left >= FORM_GAP) return { left, top };
  const sideLeft = within(
    anchor.x,
    FORM_GAP,
    Math.max(FORM_GAP, view.width - size.width - FORM_GAP),
  );
  const under = anchor.y + anchor.height + FORM_GAP;
  if (under + size.height + FORM_GAP <= view.height) return { left: sideLeft, top: under };
  const over = anchor.y - FORM_GAP - size.height;
  if (over >= FORM_GAP) return { left: sideLeft, top: over };
  // No side has room: the form stands at the window's edge on the side with more room.
  const roomRight = view.width - (anchor.x + anchor.width);
  const roomLeft = anchor.x;
  return roomRight >= roomLeft
    ? { left: within(right, FORM_GAP, Math.max(FORM_GAP, view.width - size.width - FORM_GAP)), top }
    : { left: FORM_GAP, top };
}

/**
 * The form's top left corner with no element: at the side of the canvas the notes panel is on,
 * next to the panel, in the middle of the window's height.
 */
export function placeBesidePanel(
  panel: Box,
  size: Size,
  view: Size,
): { left: number; top: number } {
  const top = within(
    (view.height - size.height) / 2,
    FORM_GAP,
    Math.max(FORM_GAP, view.height - size.height - FORM_GAP),
  );
  const onRight = panel.x + panel.width / 2 > view.width / 2;
  const wanted = onRight ? panel.x - FORM_GAP - size.width : panel.x + panel.width + FORM_GAP;
  const left = within(wanted, FORM_GAP, Math.max(FORM_GAP, view.width - size.width - FORM_GAP));
  return { left, top };
}
