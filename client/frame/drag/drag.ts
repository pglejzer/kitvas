// Dragging in the frame (spec 4b, decisions 11 and 6; plan 14, task C2): a press on a selected
// element that moves more than 4 px drags it; one elsewhere draws a selection rectangle. Esc
// cancels. A drop moves the node at once (the optimistic preview, with motion) and posts `drop`;
// a drag forwarded from the page (`drag` messages) uses the same slots, and an insert shows a
// placeholder box with the component's name until the build replaces the page. After a drag, the
// click that follows never reaches the editor's pick.
//
// The rules are in `drag-session.ts` (no DOM) and `rect.ts`, what a drop shows in
// `drag-preview.ts`; this file is the pointer, the keys and the rectangle's overlay around them.

import {
  type DragSource,
  type FrameEntry,
  MAX_IDS,
  parseStructureFrame,
  type StructureFrameMessage,
  type StructureStudioMessage,
} from '../../channel/structure-protocol.ts';
import { elementsWith } from '../edit/tree.ts';
import { outermost, type RectItem } from '../page/rect.ts';
import { boxOf, dim, placeholderOf, showDrop } from './preview.ts';
import { createSession, type Family, pressOf } from './session.ts';
import type { Box, Indicator, Point, Slot, slotAt } from './slots.ts';

export type DragDeps = {
  post(message: StructureFrameMessage): void;
  channel: string;
  entries(): ReadonlyMap<string, FrameEntry>;
  /** The selection the page last sent (`select`). */
  selection(): readonly string[];
  slots: typeof slotAt;
  indicator: Indicator;
};

export type Drag = {
  /** Listens only while edit mode is on. */
  enable(on: boolean): void;
  /** A forwarded `drag` message from the page. */
  forward(message: Extract<StructureStudioMessage, { type: 'drag' }>): void;
};

const MARKED = '[data-ks]';

const HOST_RULES = [
  'all: initial',
  'position: fixed',
  'left: 0',
  'top: 0',
  'width: 0',
  'height: 0',
  'overflow: visible',
  'pointer-events: none',
  'z-index: 2147483646',
];
/** Inline and important, so no rule of the prototype moves or hides the overlay itself. */
const HOST_STYLE = HOST_RULES.map((rule) => `${rule} !important;`).join(' ');

// The colour comes from the kit's variable (custom properties reach into a shadow root); the
// system colour stands in for a kit that has no such variable.
const SHEET = `
.rect {
  position: absolute; box-sizing: border-box; pointer-events: none;
  border: 1px solid var(--kit-color-focus, Highlight);
}
.rect::before {
  content: ''; position: absolute; inset: 0; opacity: 0.1;
  background: var(--kit-color-focus, Highlight);
}
`;

type Layer = { host: HTMLElement; rect: HTMLElement };

const around = (element: Element): Element | null => element.parentElement?.closest(MARKED) ?? null;
const idAt = (element: Element): string => element.getAttribute('data-ks') ?? '';

/** The protocol's own check: one odd id would make the studio refuse the whole message. */
const accepted = (id: string): boolean =>
  parseStructureFrame({ type: 'rect', ids: [id], add: false }, 'probe') !== undefined;

/** The first element of each id, in document order: the items of a mapped list share one. */
function firstOf(ids: readonly string[]): Element[] {
  const seen = new Set<string>();
  return elementsWith(new Set(ids)).filter((element) => {
    const id = idAt(element);
    if (seen.has(id)) return false;
    seen.add(id);
    return true;
  });
}

function pathOf(target: Element): string[] {
  const path: string[] = [];
  for (let at = target.closest(MARKED); at; at = around(at)) path.push(idAt(at));
  return path;
}

/** The nearest marked element around the element, and the marked elements right inside that. */
function familyOf(id: string): Family {
  const element = firstOf([id])[0];
  if (!element) return { parent: null, row: [] };
  const parent = around(element);
  const row = new Set<string>();
  for (const child of (parent ?? document.body).querySelectorAll(MARKED)) {
    if (around(child) === parent) row.add(idAt(child));
  }
  return { parent: parent ? idAt(parent) : null, row: [...row] };
}

function rectItems(): RectItem[] {
  const elements = [...document.querySelectorAll(MARKED)];
  const index = new Map(elements.map((element, at) => [element, at]));
  return elements.map((element) => {
    const id = idAt(element);
    const parent = around(element);
    return {
      id: accepted(id) ? id : null,
      box: boxOf(element),
      parent: parent ? (index.get(parent) ?? -1) : -1,
    };
  });
}

function createLayer(): Layer {
  const host = document.createElement('kitvas-drag');
  host.setAttribute('aria-hidden', 'true');
  host.style.cssText = HOST_STYLE;
  const sheet = document.createElement('style');
  sheet.textContent = SHEET;
  const rect = document.createElement('div');
  rect.className = 'rect';
  host.attachShadow({ mode: 'closed' }).append(sheet, rect);
  document.body.append(host);
  return { host, rect };
}

/** The frame's own overlays (outlines, handles, this rectangle): never a place to press. */
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
  let layer: Layer | undefined;
  let undim: (() => void) | undefined;
  let placeholder: HTMLElement | undefined;
  let unlisten: (() => void)[] = [];

  function capture(id: number, hold: boolean): void {
    // Captured, the pointer keeps reporting outside the frame, so a release there ends the drag.
    try {
      if (hold) document.documentElement.setPointerCapture(id);
      else document.documentElement.releasePointerCapture(id);
    } catch {
      // The pointer is gone already; there is nothing to hold or let go.
    }
  }

  function outline(rect: Box | null): void {
    if (!rect) {
      layer?.host.remove();
      layer = undefined;
      return;
    }
    layer ??= createLayer();
    const { style } = layer.rect;
    style.left = `${rect.left}px`;
    style.top = `${rect.top}px`;
    style.width = `${rect.width}px`;
    style.height = `${rect.height}px`;
  }

  function preview(source: DragSource, slot: Slot): void {
    const anchor = firstOf([slot.anchor])[0];
    if (!anchor) return;
    if (source.kind === 'move') {
      showDrop(firstOf(source.ids), anchor, slot.place);
      return;
    }
    placeholder = placeholderOf(source.label);
    showDrop([placeholder], anchor, slot.place);
  }

  const session = createSession({
    channel: deps.channel,
    post: deps.post,
    slot: (point, source) => deps.slots(document, point, source, deps.entries()),
    indicate: (slot) => deps.indicator.show(slot),
    scroll: () => ({ x: scrollX, y: scrollY }),
    outline,
    taken: (rect) => outermost(rectItems(), rect, MAX_IDS),
    family: familyOf,
    started(source) {
      if (pointer !== undefined) {
        swallow = true;
        capture(pointer, true);
      }
      // A placeholder still here was never built (the insert was refused): it leaves now.
      placeholder?.remove();
      placeholder = undefined;
      if (source?.kind === 'move') undim = dim(firstOf(source.ids));
    },
    ended() {
      undim?.();
      undim = undefined;
      if (pointer !== undefined) capture(pointer, false);
    },
    preview,
  });

  function onDown(event: PointerEvent): void {
    if (!event.isPrimary || event.button !== 0) return;
    swallow = false;
    session.cancel();
    pointer = undefined;
    const target = event.target;
    if (!(target instanceof Element) || isOverlay(target) || isTyping(target)) return;
    // A press on a scroll bar scrolls.
    const { clientWidth, clientHeight } = document.documentElement;
    if (event.clientX >= clientWidth || event.clientY >= clientHeight) return;
    const entries = deps.entries();
    const press = pressOf({
      path: pathOf(target),
      selection: deps.selection(),
      movable: (id) => entries.get(id)?.movable === true,
      siblings: (id) => familyOf(id).row,
    });
    pointer = event.pointerId;
    last = { x: event.clientX, y: event.clientY };
    session.press(press, last, event.shiftKey);
  }

  function onMove(event: PointerEvent): void {
    if (event.pointerId !== pointer) return;
    last = { x: event.clientX, y: event.clientY };
    session.move(last);
  }

  function onUp(event: PointerEvent): void {
    if (event.pointerId !== pointer) return;
    session.release({ x: event.clientX, y: event.clientY });
    pointer = undefined;
  }

  function onLost(): void {
    session.cancel();
    pointer = undefined;
  }

  /**
   * The page moved under a still pointer: the slot or the rectangle is another one now, and the
   * indicator, which does not follow a scroll by itself, is shown again where the slot is.
   */
  function onScroll(): void {
    if (last && session.active()) session.move(last);
  }

  function onKey(event: KeyboardEvent): void {
    if (event.key !== 'Escape') return;
    if (session.active()) {
      // Esc ends the drag and nothing else: the selection stays.
      event.preventDefault();
      event.stopImmediatePropagation();
    }
    session.cancel();
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
        listen('pointercancel', onLost);
        listen('blur', onLost);
        listen('scroll', onScroll);
        return;
      }
      session.cancel();
      for (const stop of unlisten) stop();
      unlisten = [];
      pointer = undefined;
      last = undefined;
      swallow = false;
    },

    forward(message) {
      if (!on) return;
      const point = { x: message.x, y: message.y };
      if (message.phase === 'start') {
        if (!message.source) return;
        // The page's pointer leads now; a press in the frame is over.
        session.cancel();
        pointer = undefined;
        last = point;
        session.begin(message.source, point);
        return;
      }
      // Only a forwarded drag listens to the page: a press in the frame has its own pointer.
      if (pointer !== undefined) return;
      if (message.phase === 'move') {
        last = point;
        session.move(point);
      } else if (message.phase === 'end') {
        session.release(point);
      } else {
        session.cancel();
      }
    },
  };
}
