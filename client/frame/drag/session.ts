// The rules of a drag in the frame (ADR 0059), with no DOM: what a press will do, when it becomes
// a drag, what a release posts. `drag.ts` gives it the pointer and the page; a test gives it
// fakes. Points, boxes and slots are viewport pixels of the frame.

import type { EditFrameMessage } from '../../channel/edit-protocol.ts';
import type { DragSource } from '../../channel/structure-protocol.ts';
import { rectOf, type Taken } from '../page/rect.ts';
import type { ItemSlot } from './item-slots.ts';
import type { Box, Point, Slot } from './slots.ts';

/** A press becomes a drag or a rectangle once the pointer is more than this far, on the screen. */
export const THRESHOLD = 4;

/** `scale`: frame pixels per pixel on the screen, the inverse of the canvas zoom. */
export function passed(start: Point, point: Point, scale = 1): boolean {
  return Math.hypot(point.x - start.x, point.y - start.y) > THRESHOLD * scale;
}

/** The element a drag picks first, with its copy when several elements carry the id. */
export type Picked = { id: string; item?: number };

/**
 * What a press will do if the pointer moves on: move these elements, reorder one list item, or
 * draw a rectangle. `pick`: the element was not selected, so the drag selects it first.
 */
export type Press =
  | { kind: 'move'; ids: string[]; pick: Picked | null }
  | { kind: 'item'; id: string; from: number; pick: Picked }
  | { kind: 'rect' };

export type PressInput = {
  /** The ids of the marked elements around the pressed point, the nearest first. */
  path: readonly string[];
  selection: readonly string[];
  /** A key that adds to the selection is held: Shift, Ctrl or Cmd. */
  add: boolean;
  movable(id: string): boolean;
  /** One copy per item of a literal data list (`FrameEntry.item`). */
  item(id: string): boolean;
  /** The element a section returns. */
  section(id: string): boolean;
  /** The ids of the element's parent's children in document order, itself among them. */
  siblings(id: string): readonly string[];
  /** Which rendered copy of `id` is in the path; `undefined` when only one element carries it. */
  copy(id: string): number | undefined;
};

function pickOf(input: PressInput, id: string): Picked {
  const item = input.copy(id);
  return item === undefined ? { id } : { id, item };
}

function itemPress(input: PressInput, id: string): Press {
  // Picked also when it is selected: the pressed copy may be another one than the chosen one.
  return { kind: 'item', id, from: input.copy(id) ?? 0, pick: pickOf(input, id) };
}

/**
 * The whole selection moves when it is a run of neighbouring siblings that can all move, in their
 * order; any other selection moves only the grabbed element.
 */
function runOf(input: PressInput, grabbed: string, chosen: ReadonlySet<string>): string[] {
  if (chosen.size === 1) return [grabbed];
  const row = input.siblings(grabbed);
  const at = [...chosen].map((id) => row.indexOf(id));
  const together =
    !at.includes(-1) &&
    Math.max(...at) - Math.min(...at) + 1 === at.length &&
    [...chosen].every(input.movable);
  return together ? row.filter((id) => chosen.has(id)) : [grabbed];
}

/**
 * What a press does, from the pressed element outwards:
 * 1. With Shift, Ctrl or Cmd it draws a rectangle that adds to the selection, wherever it starts.
 * 2. A selected element around the point is grabbed, also by one of its children: it moves (or
 *    the selected run does), or reorders when it is a list item.
 * 3. Else the nearest element that can move is dragged, or the nearest list item, whichever
 *    comes first; the drag selects it.
 * 4. With none up to the section's root, it draws a rectangle.
 * An element that is a list item reorders, whatever else the structure says of it.
 */
export function pressOf(input: PressInput): Press {
  const { path, movable, item } = input;
  if (input.add) return { kind: 'rect' };
  const chosen = new Set(input.selection);
  const grabbed = path.find((id) => chosen.has(id));
  if (grabbed !== undefined && item(grabbed)) return itemPress(input, grabbed);
  if (grabbed !== undefined && movable(grabbed)) {
    return { kind: 'move', ids: runOf(input, grabbed, chosen), pick: null };
  }
  for (const id of path) {
    if (item(id)) return itemPress(input, id);
    if (movable(id)) return { kind: 'move', ids: [id], pick: pickOf(input, id) };
    if (input.section(id)) break;
  }
  return { kind: 'rect' };
}

/** Where an element stands: its parent's id (`null` at the top) and that parent's children. */
export type Family = { parent: string | null; row: readonly string[] };

/**
 * The slot is where the dragged run of siblings (`ids`, in order) already stands: before the
 * element after it, after the one before it, or first or last in its parent while it is that.
 */
export function samePlace(
  ids: readonly string[],
  slot: Pick<Slot, 'anchor' | 'place'>,
  { parent, row }: Family,
): boolean {
  const first = ids[0];
  const last = ids.at(-1);
  if (first === undefined || last === undefined) return false;
  const from = row.indexOf(first);
  const to = row.indexOf(last);
  // Anything but one run of neighbours has no single place to compare with.
  if (from < 0 || to - from + 1 !== ids.length) return false;
  if (slot.place === 'before') return row[to + 1] === slot.anchor;
  if (slot.place === 'after') return from > 0 && row[from - 1] === slot.anchor;
  if (parent !== slot.anchor) return false;
  return slot.place === 'first' ? from === 0 : to === row.length - 1;
}

/** One copy of a list item on its way to another place among the copies. */
export type ItemSource = { kind: 'item'; id: string; from: number };

/** What a session needs around it. */
export type SessionEnv = {
  channel: string;
  post(message: EditFrameMessage): void;
  /** Frame pixels per pixel on the screen: the inverse of the canvas zoom. */
  scale(): number;
  /** Always asked with the one source object of the drag: the slots keep a lookup on it. */
  slot(point: Point, source: DragSource): Slot | null;
  /** The place among the copies of the dragged item under the point. */
  itemSlot(point: Point, source: ItemSource): ItemSlot | null;
  indicate(slot: Slot | null): void;
  /** The page's scroll offset: a rectangle keeps its first corner on the page while it scrolls. */
  scroll(): Point;
  /** Draws the rectangle and outlines what it would take; `null` takes both away. */
  outline(rect: Box | null, boxes: readonly Box[]): void;
  /** What a rectangle takes. */
  taken(rect: Box): Taken;
  family(id: string): Family;
  /** A drag (its source) or a rectangle (`null`) began: the threshold is behind. */
  started(source: DragSource | ItemSource | null): void;
  ended(): void;
  /** The optimistic preview of a drop. */
  preview(source: DragSource, slot: Slot): void;
  /** The optimistic preview of a reordered item. */
  previewItem(source: ItemSource, slot: ItemSlot): void;
};

export type Session = {
  /** A drag or a rectangle runs (a press that has not moved far enough is neither). */
  active(): boolean;
  /** A rectangle is being drawn. */
  drawing(): boolean;
  /** `add`: Shift, Ctrl or Cmd was held, so a rectangle adds to the selection. */
  press(press: Press, point: Point, add: boolean): void;
  /** A drag that starts at once: one the page forwards. */
  begin(source: DragSource, point: Point): void;
  /** Also called again with the same point after a scroll: the slot is another one then. */
  move(point: Point): void;
  release(point: Point): void;
  cancel(): void;
};

type State =
  | { kind: 'idle' }
  | { kind: 'pressed'; press: Press; start: Point; origin: Point; add: boolean }
  | { kind: 'drag'; source: DragSource }
  | { kind: 'item'; source: ItemSource }
  | { kind: 'rect'; origin: Point; add: boolean };

const IDLE: State = { kind: 'idle' };

/** One gesture at a time. */
export function createSession(env: SessionEnv): Session {
  const head = { kitvas: 1 as const, channel: env.channel };
  let state: State = IDLE;

  function slotFor(source: DragSource, point: Point): Slot | null {
    const slot = env.slot(point, source);
    // Next to itself is no place to go.
    if (slot && source.kind === 'move' && source.ids.includes(slot.anchor)) return null;
    return slot;
  }

  /** What the indicator draws for an item's place: the line beside the copy. */
  function lineFor(source: ItemSource, point: Point): Slot | null {
    const slot = env.itemSlot(point, source);
    return slot && { anchor: source.id, place: slot.place, line: slot.line, box: null };
  }

  /** The rectangle from its first corner, which is kept on the page, to the pointer. */
  function rectTo(origin: Point, point: Point): Box {
    const scroll = env.scroll();
    return rectOf({ x: origin.x - scroll.x, y: origin.y - scroll.y }, point);
  }

  function stays(source: DragSource, slot: Slot): boolean {
    const first = source.kind === 'move' ? source.ids[0] : undefined;
    if (source.kind !== 'move' || first === undefined) return false;
    return samePlace(source.ids, slot, env.family(first));
  }

  function cancel(): void {
    const ending = state;
    state = IDLE;
    if (ending.kind === 'drag' || ending.kind === 'item') env.indicate(null);
    if (ending.kind === 'rect') env.outline(null, []);
    if (ending.kind === 'drag' || ending.kind === 'item' || ending.kind === 'rect') env.ended();
  }

  /** The threshold is behind: the press becomes what `pressOf` said it would. */
  function start(press: Press, origin: Point, add: boolean): void {
    if (press.kind === 'rect') {
      state = { kind: 'rect', origin, add };
      env.started(null);
      return;
    }
    // First, so the panels follow the element before it goes anywhere.
    if (press.pick) env.post({ ...head, type: 'pick', ...press.pick, add: false, double: false });
    if (press.kind === 'move') {
      const source: DragSource = { kind: 'move', ids: [...press.ids] };
      state = { kind: 'drag', source };
      env.started(source);
      return;
    }
    const source: ItemSource = { kind: 'item', id: press.id, from: press.from };
    state = { kind: 'item', source };
    env.started(source);
  }

  function move(point: Point): void {
    if (state.kind === 'pressed') {
      if (!passed(state.start, point, env.scale())) return;
      start(state.press, state.origin, state.add);
    }
    if (state.kind === 'drag') env.indicate(slotFor(state.source, point));
    if (state.kind === 'item') env.indicate(lineFor(state.source, point));
    if (state.kind === 'rect') {
      const rect = rectTo(state.origin, point);
      env.outline(rect, env.taken(rect).boxes);
    }
  }

  return {
    active: () => state.kind === 'drag' || state.kind === 'item' || state.kind === 'rect',
    drawing: () => state.kind === 'rect',

    press(press, point, add) {
      cancel();
      const scroll = env.scroll();
      const origin = { x: point.x + scroll.x, y: point.y + scroll.y };
      state = { kind: 'pressed', press, start: point, origin, add };
    },

    begin(source, point) {
      cancel();
      state = { kind: 'drag', source };
      env.started(source);
      move(point);
    },

    move,

    release(point) {
      const ending = state;
      // Read before the gesture is put away, which removes the indicator, the outlines and the
      // dimming.
      const slot = ending.kind === 'drag' ? slotFor(ending.source, point) : null;
      const place = ending.kind === 'item' ? env.itemSlot(point, ending.source) : null;
      const taken = ending.kind === 'rect' ? env.taken(rectTo(ending.origin, point)) : null;
      cancel();
      if (ending.kind === 'rect' && taken) {
        env.post({ ...head, type: 'rect', ids: taken.ids, add: ending.add });
      }
      if (ending.kind === 'item' && place) {
        const { id, from } = ending.source;
        // A drop on its own place changes nothing: no write, no move.
        if (place.to === from) return;
        env.post({ ...head, type: 'reorder', id, item: from, to: place.to });
        env.previewItem(ending.source, place);
      }
      if (ending.kind !== 'drag' || !slot) return;
      const { source } = ending;
      // A drop where the element already stands changes nothing: no write, no move.
      if (stays(source, slot)) return;
      // Posted first: the write must not depend on the preview going well.
      env.post({ ...head, type: 'drop', source, anchor: slot.anchor, place: slot.place });
      env.preview(source, slot);
    },

    cancel,
  };
}
