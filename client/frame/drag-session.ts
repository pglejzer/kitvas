// The rules of a drag in the frame (spec 4b, decision 11; plan 14, task C2), with no DOM: what a
// press will do, when it becomes a drag, what a release posts. `drag.ts` gives it the pointer and
// the page; a test gives it fakes. Points, boxes and slots are viewport pixels of the frame.

import type { DragSource, StructureFrameMessage } from '../channel/structure-protocol.ts';
import { rectOf } from './rect.ts';
import type { Box, Point, Slot } from './slots.ts';

/** A press becomes a drag or a rectangle once the pointer is more than this far from it. */
export const THRESHOLD = 4;

export function passed(start: Point, point: Point): boolean {
  return Math.hypot(point.x - start.x, point.y - start.y) > THRESHOLD;
}

/** What a press will do if the pointer moves on: move these elements, or draw a rectangle. */
export type Press = { kind: 'move'; ids: string[] } | { kind: 'rect' };

export type PressInput = {
  /** The ids of the marked elements around the pressed point, the nearest first. */
  path: readonly string[];
  selection: readonly string[];
  movable(id: string): boolean;
  /** The ids of the element's parent's children in document order, itself among them. */
  siblings(id: string): readonly string[];
};

/**
 * A press inside a selected element grabs it, also by one of its children. The whole selection
 * moves when it is a run of neighbouring siblings that can all move, in their order; any other
 * selection moves only the grabbed element. A press elsewhere, or on an element that cannot move
 * (a section's root, a list item), draws a rectangle.
 */
export function pressOf({ path, selection, movable, siblings }: PressInput): Press {
  const chosen = new Set(selection);
  const grabbed = path.find((id) => chosen.has(id));
  if (grabbed === undefined || !movable(grabbed)) return { kind: 'rect' };
  if (chosen.size === 1) return { kind: 'move', ids: [grabbed] };
  const row = siblings(grabbed);
  const at = [...chosen].map((id) => row.indexOf(id));
  const together =
    !at.includes(-1) &&
    Math.max(...at) - Math.min(...at) + 1 === at.length &&
    [...chosen].every(movable);
  if (!together) return { kind: 'move', ids: [grabbed] };
  return { kind: 'move', ids: row.filter((id) => chosen.has(id)) };
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

/** What a session needs around it. */
export type SessionEnv = {
  channel: string;
  post(message: StructureFrameMessage): void;
  /** Always asked with the one source object of the drag: the slots keep a lookup on it. */
  slot(point: Point, source: DragSource): Slot | null;
  indicate(slot: Slot | null): void;
  /** The page's scroll offset: a rectangle keeps its first corner on the page while it scrolls. */
  scroll(): Point;
  /** Draws the rectangle; `null` takes it away. */
  outline(rect: Box | null): void;
  /** The ids a rectangle takes. */
  taken(rect: Box): string[];
  family(id: string): Family;
  /** A drag (its source) or a rectangle (`null`) began: the threshold is behind. */
  started(source: DragSource | null): void;
  ended(): void;
  /** The optimistic preview of a drop. */
  preview(source: DragSource, slot: Slot): void;
};

export type Session = {
  /** A drag or a rectangle runs (a press that has not moved far enough is neither). */
  active(): boolean;
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
    if (ending.kind === 'drag') env.indicate(null);
    if (ending.kind === 'rect') env.outline(null);
    if (ending.kind === 'drag' || ending.kind === 'rect') env.ended();
  }

  function move(point: Point): void {
    if (state.kind === 'pressed') {
      if (!passed(state.start, point)) return;
      const { press, origin, add } = state;
      if (press.kind === 'move') {
        const source: DragSource = { kind: 'move', ids: [...press.ids] };
        state = { kind: 'drag', source };
        env.started(source);
      } else {
        state = { kind: 'rect', origin, add };
        env.started(null);
      }
    }
    if (state.kind === 'drag') env.indicate(slotFor(state.source, point));
    if (state.kind === 'rect') env.outline(rectTo(state.origin, point));
  }

  return {
    active: () => state.kind === 'drag' || state.kind === 'rect',

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
      // Read before the gesture is put away, which removes the indicator and the dimming.
      const slot = ending.kind === 'drag' ? slotFor(ending.source, point) : null;
      const rect = ending.kind === 'rect' ? rectTo(ending.origin, point) : null;
      cancel();
      if (ending.kind === 'rect' && rect) {
        env.post({ ...head, type: 'rect', ids: env.taken(rect), add: ending.add });
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
