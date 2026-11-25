// Where the select's list goes: under its trigger, or above when there is no room, always inside
// the window. Pure, so a test can run it on numbers.

export const LIST_MIN_WIDTH = 240;
export const LIST_MAX_HEIGHT = 320;
export const GAP = 4;
export const EDGE = 8;

export type Box = { left: number; top: number; width: number; height: number };

export function placeList(
  trigger: Box,
  view: { width: number; height: number },
  content: number,
): { left: number; top: number; width: number; maxHeight: number; above: boolean } {
  const width = Math.min(Math.max(trigger.width, LIST_MIN_WIDTH), view.width - 2 * EDGE);
  const left = Math.max(EDGE, Math.min(trigger.left, view.width - width - EDGE));
  const below = view.height - (trigger.top + trigger.height) - GAP - EDGE;
  const aboveRoom = trigger.top - GAP - EDGE;
  const wanted = Math.min(content, LIST_MAX_HEIGHT);
  const above = below < wanted && aboveRoom > below;
  const maxHeight = Math.min(LIST_MAX_HEIGHT, above ? aboveRoom : below);
  const top = above
    ? trigger.top - GAP - Math.min(wanted, maxHeight)
    : trigger.top + trigger.height + GAP;
  return { left, top, width, maxHeight, above };
}
