// Dragging in the frame (ADRs 0059 and 0066): a press on an element that moves more than 4 px on
// the screen drags it at once, selected or not, and the drag selects it; a list item drags among
// the lists of its id; a press on a section's root, or with Shift, Ctrl or Cmd held, draws a
// selection rectangle. Esc cancels. While a drag runs the frame draws only the dimmed original,
// the slot's line and an outline of what would take the drop, and the page scrolls near the
// frame's top and bottom edge. A drop moves the node at once (the optimistic preview, with
// motion) and posts `drop` or `reorder`; a drag forwarded from the page (`drag` messages) uses the
// same slots, and an insert shows a placeholder box with the component's name until the build
// replaces the page. After a drag, the click that follows never reaches the editor's pick.
//
// The rules are in `session.ts` (no DOM), `item-slots.ts`, `slots.ts` and `rect.ts`. The page is
// read by `page-read.ts` and `slot-read.ts`, and what a drop shows is in `preview.ts`. This file
// is the pointer and the keys around them.

import { type EditFrameMessage, MAX_COPIES } from '../../channel/edit-protocol.ts';
import type {
  DragSource,
  FrameEntry,
  StructureStudioMessage,
} from '../../channel/structure-protocol.ts';
import { carried, copyOfPick } from '../edit/items.ts';
import { elementsWith } from '../edit/tree.ts';
import { hold } from '../page/busy.ts';
import { takenBy } from '../page/rect.ts';
import { createAutoScroll } from './gesture/autoscroll.ts';
import { createCursor } from './gesture/cursor.ts';
import type { GestureEnd, GestureLog } from './gesture/gesture-log.ts';
import { createRectLayer } from './gesture/rect-layer.ts';
import { createDropRecord } from './motion/drop-record.ts';
import { dim, placeDrop, placeholderOf, showDrop } from './motion/preview.ts';
import {
  chainOf,
  draggedOf,
  dropsOf,
  familyOf,
  firstOf,
  holdOf,
  idAt,
  measureLists,
  type PageLists,
  picksOf,
  type RectRead,
  readLists,
  readRect,
} from './page-read.ts';
import { createSession, pressOf } from './session.ts';
import { ITEM_REACH, type ItemList, type ListSlot, listSlot } from './slots/item-slots.ts';
import type { slotAt } from './slots/slot-read.ts';
import { HOME_REACH, type Indicator, type Point, type Slot } from './slots/slots.ts';

export type DragDeps = {
  /** A drag also posts the `pick` of the element it takes, so the message is any edit message. */
  post(message: EditFrameMessage): void;
  channel: string;
  entries(): ReadonlyMap<string, FrameEntry>;
  /** The selection the page last sent (`select`). */
  selection(): readonly string[];
  /** The locked elements: a rectangle takes none of them, nor anything inside one. */
  locked(): readonly string[];
  slots: typeof slotAt;
  indicator: Indicator;
  /**
   * A drag began (`true`) or ended: from its start to its end the frame draws nothing but the
   * dimmed original, the slot's line and the outline of what takes the drop.
   */
  quiet?(on: boolean): void;
  /** Hears every change of the session's state, and why each gesture ended (`gesture-log.ts`). */
  log?: GestureLog;
};

export type Drag = {
  /** Listens only while edit mode is on. */
  enable(on: boolean): void;
  /** A forwarded `drag` message from the page. */
  forward(message: Extract<StructureStudioMessage, { type: 'drag' }>): void;
  /**
   * The page heard the release the frame did not hear: a press or a drag of the frame's own
   * pointer ends at `point`, as with a release of its own.
   */
  released(point: Point): void;
  /**
   * Frame pixels per pixel on the screen (the inverse of the canvas zoom): the threshold and the
   * lines keep their size on the screen.
   */
  scale(value: number): void;
  /** A build was taken in place: a press or a drag that runs goes on, and its log says so. */
  swapped(): void;
  /**
   * The studio did not take the last drop (refused, in conflict or lost): the nodes it moved go
   * back where they stood and its placeholder leaves.
   */
  dropBack(): void;
};

/** The frame's own overlays (outlines, handles, the rectangle): never a place to press. */
const isOverlay = (target: Element): boolean => target.localName.startsWith('kitvas-');
/** An inline text edit keeps its pointer: a drag there selects text. */
const isTyping = (target: Element): boolean =>
  target instanceof HTMLElement && target.isContentEditable;

export function createDrag(deps: DragDeps): Drag {
  let on = false;
  /** The click that ends a drag is not a pick. */
  let swallow = false;
  /** The pointer of a press in the frame; a forwarded drag has none. */
  let pointer: number | undefined;
  let last: Point | undefined;
  let zoom = 1;
  let undim: (() => void) | undefined;
  let placeholder: HTMLElement | undefined;
  /** Where the nodes of the last drop stood, until the build replaces the page or the drop is refused. */
  const dropped = createDropRecord<ChildNode>();
  /** Ends the hold on the page's swaps (`busy.ts`) while a drag or a rectangle runs. */
  let free: (() => void) | undefined;
  /** The page's elements as a rectangle found them, until the page scrolls under it. */
  let measured: RectRead | undefined;
  /** The marked elements around the last press in the frame, the nearest first. */
  let pressed: Element[] = [];
  /** A drag runs, not a rectangle: everything else the frame draws is hidden. */
  let dragging = false;
  /** The elements the drag moves and where it is held, kept for the preview of its drop. */
  let moved: Element[] = [];
  let held: ReturnType<typeof holdOf> | undefined;
  /** The lists a dragged item can go to: the elements for one drag, the boxes until a scroll. */
  let lists: PageLists | undefined;
  let rows: ItemList[] | undefined;
  let unlisten: (() => void)[] = [];
  const rectangle = createRectLayer();
  const cursor = createCursor();
  const auto = createAutoScroll({
    height: () => document.documentElement.clientHeight,
    scale: () => zoom,
    // At once: a page that scrolls smoothly would lag behind the pointer.
    scrollBy: (dy) => window.scrollBy({ top: dy, behavior: 'instant' }),
    frame: (step) => requestAnimationFrame(step),
    cancel: (handle) => cancelAnimationFrame(handle),
  });

  function capture(id: number, take: boolean): void {
    // Captured, the pointer keeps reporting outside the frame, so a release there ends the drag.
    try {
      if (take) document.documentElement.setPointerCapture(id);
      else document.documentElement.releasePointerCapture(id);
    } catch {
      // The pointer is gone already; there is nothing to hold or let go.
    }
  }

  function preview(source: DragSource, slot: Slot): void {
    if (source.kind === 'insert') {
      const anchor = firstOf([slot.anchor])[0];
      if (!anchor) return;
      placeholder = placeholderOf(source.label);
      dropped.note([placeholder]);
      showDrop([placeholder], anchor, slot.place);
      return;
    }
    const [shown, ...others] = dropsOf(source.ids, slot.anchor, moved, held?.bound ?? null, last);
    if (shown) {
      dropped.note(shown.nodes);
      showDrop(shown.nodes, shown.anchor, slot.place);
    }
    // The same part in the other copies of its list item: at once, with no motion of their own.
    for (const other of others) {
      dropped.note(other.nodes);
      placeDrop(other.nodes, other.anchor, slot.place);
    }
  }

  /** The dragged copy goes beside the copy the slot names, in its own list or in another one. */
  function previewItem(slot: ListSlot): void {
    const own = lists?.own;
    const row = own ? lists?.lists[own.list]?.rows[own.index] : undefined;
    const anchor = lists?.lists[slot.list]?.rows[slot.anchor];
    if (!row || !anchor) return;
    dropped.note([row]);
    showDrop([row], anchor, slot.place);
  }

  const session = createSession({
    channel: deps.channel,
    post: deps.post,
    scale: () => zoom,
    slot: (point, source) =>
      deps.slots(
        document,
        point,
        source,
        deps.entries(),
        held && { ...held, reach: HOME_REACH * zoom },
      ),
    itemSlot(point, source) {
      lists ??= readLists(source.id, source.item, deps.entries().get(source.id)?.lists);
      rows ??= measureLists(lists);
      const slot = listSlot(point, rows, lists.own, ITEM_REACH * zoom);
      // A path the protocol does not carry is no place to drop on.
      const sent = slot && carried(slot.path) ? slot : null;
      return { slot: sent, lists: rows.map((row) => row.parent) };
    },
    indicate(slot, around) {
      deps.indicator.show(slot, around);
      if (dragging) cursor.set(slot ? 'grabbing' : 'not-allowed');
    },
    scroll: () => ({ x: scrollX, y: scrollY }),
    outline: (rect, boxes) => rectangle.draw(rect, boxes, zoom),
    taken(rect) {
      measured ??= readRect(new Set(deps.locked()));
      const read = measured;
      const { taken, boxes } = takenBy(read.items, rect, MAX_COPIES);
      return { boxes, picks: () => picksOf(taken, read, deps.entries()) };
    },
    family: familyOf,
    started(source) {
      free?.();
      free = hold();
      measured = undefined;
      lists = undefined;
      rows = undefined;
      moved = [];
      held = undefined;
      if (pointer !== undefined) {
        swallow = true;
        capture(pointer, true);
      }
      // A placeholder still here was never built (the insert was refused): it leaves now.
      placeholder?.remove();
      placeholder = undefined;
      dropped.forget();
      if (source === null) return;
      dragging = true;
      deps.quiet?.(true);
      cursor.set('grabbing');
      if (source.kind === 'move') {
        // A build taken since the press put other elements in the place of the pressed ones.
        const copies = pressed.filter((element) => element.isConnected);
        moved = draggedOf(source.ids, copies);
        const grabbed = copies.length > 0 ? moved[0] : undefined;
        if (grabbed) held = holdOf(grabbed, deps.entries().get(idAt(grabbed)));
        undim = dim(moved);
      }
      if (source.kind === 'item') {
        const copy = elementsWith(new Set([source.id]))[source.item];
        if (copy) undim = dim([copy]);
      }
    },
    ended() {
      undim?.();
      undim = undefined;
      measured = undefined;
      rows = undefined;
      auto.stop();
      cursor.set(null);
      if (dragging) deps.quiet?.(false);
      dragging = false;
      if (pointer !== undefined) capture(pointer, false);
      free?.();
      free = undefined;
    },
    preview,
    previewItem: (_source, slot) => previewItem(slot),
    ...(deps.log ? { log: deps.log } : {}),
  });

  /** Ends whatever runs and forgets the pointer: a rectangle, an indicator and a dimming leave. */
  function letGo(why: GestureEnd): void {
    session.cancel(why);
    pointer = undefined;
  }

  function onDown(event: PointerEvent): void {
    // Before anything else, for any button and any finger: a gesture whose release the frame
    // never heard ends with the next press at the latest.
    swallow = false;
    letGo('new-press');
    if (!event.isPrimary || event.button !== 0) return;
    const target = event.target;
    if (!(target instanceof Element) || isOverlay(target) || isTyping(target)) return;
    // A press on a scroll bar scrolls.
    const { clientWidth, clientHeight } = document.documentElement;
    if (event.clientX >= clientWidth || event.clientY >= clientHeight) return;
    const entries = deps.entries();
    const chain = chainOf(target);
    const copyAt = (id: string): Element | null => chain.find((at) => idAt(at) === id) ?? null;
    // Shift, Ctrl and Cmd all add to the selection, as they do for a click.
    const add = event.shiftKey || event.ctrlKey || event.metaKey;
    const press = pressOf({
      path: chain.map(idAt),
      selection: deps.selection(),
      add,
      movable: (id) => entries.get(id)?.movable === true,
      item: (id) => entries.get(id)?.item === true,
      section: (id) => entries.get(id)?.root === 'section',
      siblings: (id) => familyOf(id).row,
      copy: (id) => copyOfPick(copyAt(id), id, entries.get(id)?.lists),
    });
    pressed = chain;
    pointer = event.pointerId;
    last = { x: event.clientX, y: event.clientY };
    session.press(press, last, add);
  }

  function onMove(event: PointerEvent): void {
    if (event.pointerId !== pointer) return;
    // No button is down any more: the release happened where the frame could not hear it.
    if (event.buttons === 0) {
      letGo('no-buttons');
      return;
    }
    last = { x: event.clientX, y: event.clientY };
    session.move(last);
    if (dragging) auto.at(last.y);
  }

  function onUp(event: PointerEvent): void {
    if (event.pointerId === pointer) {
      last = { x: event.clientX, y: event.clientY };
      session.release(last);
      pointer = undefined;
      return;
    }
    // A rectangle never stays on the page: a release of any pointer ends it, with what it showed
    // when its own pointer last moved.
    if (pointer !== undefined && last && session.drawing()) {
      session.release(last);
      pointer = undefined;
    }
  }

  function onCaptureLost(event: PointerEvent): void {
    // Only the capture this drag took: an element of the page may hold and lose one of its own.
    if (event.pointerId === pointer && event.target === document.documentElement) {
      letGo('capture-lost');
    }
  }

  /**
   * The page moved under a still pointer: the slot or the rectangle is another one now, and the
   * indicator, which does not follow a scroll by itself, is shown again where the slot is.
   */
  function onScroll(): void {
    measured = undefined;
    rows = undefined;
    if (last && session.active()) session.move(last);
  }

  function onKey(event: KeyboardEvent): void {
    if (event.key !== 'Escape') return;
    if (session.active()) {
      // Esc ends the drag and nothing else: the selection stays.
      event.preventDefault();
      event.stopImmediatePropagation();
    }
    session.cancel('escape');
  }

  function onClick(event: MouseEvent): void {
    if (!swallow) return;
    swallow = false;
    event.preventDefault();
    event.stopImmediatePropagation();
  }

  // These two must come before the editor's own listeners on `window`, which are added each time
  // edit mode turns on: listeners of one target run in the order they were added, so they are
  // added once, here, and do nothing unless a drag ran.
  if (typeof window !== 'undefined') {
    window.addEventListener('keydown', onKey, { capture: true });
    window.addEventListener('click', onClick, { capture: true });
  }

  function listen<K extends keyof WindowEventMap>(
    type: K,
    handler: (event: WindowEventMap[K]) => void,
  ): void {
    const options = { capture: true, passive: true };
    window.addEventListener(type, handler, options);
    unlisten.push(() => window.removeEventListener(type, handler, options));
  }

  return {
    enable(next) {
      if (next === on) return;
      on = next;
      if (on) {
        listen('pointerdown', onDown);
        listen('pointermove', onMove);
        listen('pointerup', onUp);
        listen('pointercancel', () => letGo('cancelled'));
        listen('lostpointercapture', onCaptureLost);
        listen('blur', () => letGo('blur'));
        // The page is left under a press or a drag: its log is posted now, there is no later.
        listen('pagehide', () => letGo('unloaded'));
        listen('scroll', onScroll);
        return;
      }
      session.cancel('off');
      for (const stop of unlisten) stop();
      unlisten = [];
      pointer = undefined;
      last = undefined;
      pressed = [];
      swallow = false;
    },

    forward(message) {
      if (!on) return;
      const point = { x: message.x, y: message.y };
      if (message.phase === 'start') {
        if (!message.source) return;
        // The page's pointer leads now; a press in the frame is over.
        letGo('new-press');
        pressed = [];
        last = point;
        session.begin(message.source, point);
        return;
      }
      // Only a forwarded drag listens to the page: a press in the frame has its own pointer.
      if (pointer !== undefined) return;
      if (message.phase === 'move') {
        last = point;
        session.move(point);
        if (dragging) auto.at(point.y);
      } else if (message.phase === 'end') {
        last = point;
        session.release(point);
      } else {
        session.cancel('cancelled');
      }
    },

    released(point) {
      // A forwarded drag has no pointer of the frame and ends with its own message.
      if (!on || pointer === undefined) return;
      last = point;
      session.release(point);
      pointer = undefined;
    },

    scale(value) {
      zoom = value > 0 && Number.isFinite(value) ? value : 1;
      deps.indicator.scale(zoom);
    },

    swapped() {
      // The build replaced the elements the record names.
      dropped.forget();
      placeholder = undefined;
      session.note('swapped');
    },

    dropBack() {
      dropped.back();
      placeholder = undefined;
    },
  };
}
