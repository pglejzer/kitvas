// Dragging in the frame (ADR 0059): a press on an element that moves more than 4 px on the screen
// drags it at once, selected or not, and the drag selects it; a list item drags among its copies;
// a press on a section's root, or with Shift, Ctrl or Cmd held, draws a selection rectangle. Esc
// cancels. A drop moves the node at once (the optimistic preview, with motion) and posts `drop`
// or `reorder`; a drag forwarded from the page (`drag` messages) uses the same slots, and an
// insert shows a placeholder box with the component's name until the build replaces the page.
// After a drag, the click that follows never reaches the editor's pick.
//
// The rules are in `session.ts` (no DOM), `item-slots.ts` and `rect.ts`, what a drop shows in
// `preview.ts`; this file is the pointer, the keys and the rectangle's overlay around them.

import type { EditFrameMessage } from '../../channel/edit-protocol.ts';
import {
  type DragSource,
  type FrameEntry,
  MAX_IDS,
  parseStructureFrame,
  type StructureStudioMessage,
} from '../../channel/structure-protocol.ts';
import { itemOfPick } from '../edit/items.ts';
import { elementsWith } from '../edit/tree.ts';
import { hold } from '../page/busy.ts';
import { type RectItem, takenBy } from '../page/rect.ts';
import { toned } from '../tones/tones.ts';
import { type ItemSlot, itemSlot } from './item-slots.ts';
import { boxOf, dim, placeholderOf, showDrop } from './preview.ts';
import { createSession, type Family, type ItemSource, pressOf } from './session.ts';
import { type Box, flowOf, type Indicator, type Point, type Slot, type slotAt } from './slots.ts';

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
};

export type Drag = {
  /** Listens only while edit mode is on. */
  enable(on: boolean): void;
  /** A forwarded `drag` message from the page. */
  forward(message: Extract<StructureStudioMessage, { type: 'drag' }>): void;
  /**
   * Frame pixels per pixel on the screen (the inverse of the canvas zoom): the threshold and the
   * lines keep their size on the screen.
   */
  scale(value: number): void;
};

const MARKED = '[data-ks]';
/** The most outlines a rectangle draws for what it would take. */
const MAX_OUTLINES = 200;

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

// The colour is the studio's selection colour (`toned`; custom properties reach into a shadow
// root); the system colour stands in until the studio has said its tones.
const SHEET = `
.rect, .take { position: absolute; left: 0; top: 0; box-sizing: border-box; pointer-events: none; }
.rect { border: 1px solid var(--kv-select, Highlight); }
.rect::before {
  content: ''; position: absolute; inset: 0; opacity: 0.1;
  background: var(--kv-select, Highlight);
}
.take { outline: 2px solid var(--kv-select, Highlight); outline-offset: -2px; }
.off { display: none; }
`;

type Layer = { host: HTMLElement; root: ShadowRoot; rect: HTMLElement; takes: HTMLElement[] };

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

/** The marked elements around the pressed one, itself first. */
function chainOf(target: Element): Element[] {
  const chain: Element[] = [];
  for (let at = target.closest(MARKED); at; at = around(at)) chain.push(at);
  return chain;
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

function rectItems(locked: ReadonlySet<string>): RectItem[] {
  const elements = [...document.querySelectorAll(MARKED)];
  const index = new Map(elements.map((element, at) => [element, at]));
  /** The element, or one around it, is locked. */
  const shut: boolean[] = [];
  return elements.map((element, at) => {
    const id = idAt(element);
    const parent = around(element);
    const up = parent ? (index.get(parent) ?? -1) : -1;
    const closed = locked.has(id) || shut[up] === true;
    shut[at] = closed;
    return { id: accepted(id) && !closed ? id : null, box: boxOf(element), parent: up };
  });
}

/**
 * The copies of a list item in the order of the data, and the element they sit in. `null` when
 * they sit in several (a list inside a list): there is no one row to order then.
 */
function copiesOf(id: string): { copies: Element[]; parent: Element } | null {
  const copies = elementsWith(new Set([id]));
  const parent = copies[0]?.parentElement;
  if (!parent || copies.some((copy) => copy.parentElement !== parent)) return null;
  return { copies, parent };
}

function itemSlotAt(point: Point, source: ItemSource): ItemSlot | null {
  const found = copiesOf(source.id);
  if (!found) return null;
  const style = getComputedStyle(found.parent);
  const flow = flowOf({
    display: style.display,
    flexDirection: style.flexDirection,
    gridAutoFlow: style.gridAutoFlow,
    gridTemplateColumns: style.gridTemplateColumns,
    gridTemplateRows: style.gridTemplateRows,
    direction: style.direction,
  });
  const row = { parent: boxOf(found.parent), flow, copies: found.copies.map(boxOf) };
  return itemSlot(point, row, source.from);
}

function setBox(node: HTMLElement, box: Box): void {
  node.style.left = `${box.left}px`;
  node.style.top = `${box.top}px`;
  node.style.width = `${box.width}px`;
  node.style.height = `${box.height}px`;
}

function createLayer(): Layer {
  const host = document.createElement('kitvas-drag');
  host.setAttribute('aria-hidden', 'true');
  host.style.cssText = HOST_STYLE;
  toned(host);
  const sheet = document.createElement('style');
  sheet.textContent = SHEET;
  const rect = document.createElement('div');
  rect.className = 'rect';
  const root = host.attachShadow({ mode: 'closed' });
  root.append(sheet, rect);
  document.body.append(host);
  return { host, root, rect, takes: [] };
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
  let zoom = 1;
  let layer: Layer | undefined;
  let undim: (() => void) | undefined;
  let placeholder: HTMLElement | undefined;
  /** Ends the hold on the page's swaps (`busy.ts`) while a drag or a rectangle runs. */
  let free: (() => void) | undefined;
  /** The page's elements as a rectangle found them, until the page scrolls under it. */
  let measured: RectItem[] | undefined;
  let unlisten: (() => void)[] = [];

  function capture(id: number, take: boolean): void {
    // Captured, the pointer keeps reporting outside the frame, so a release there ends the drag.
    try {
      if (take) document.documentElement.setPointerCapture(id);
      else document.documentElement.releasePointerCapture(id);
    } catch {
      // The pointer is gone already; there is nothing to hold or let go.
    }
  }

  /** The rectangle and an outline around each element it would take; `null` removes both. */
  function outline(rect: Box | null, boxes: readonly Box[]): void {
    if (!rect) {
      layer?.host.remove();
      layer = undefined;
      return;
    }
    layer ??= createLayer();
    setBox(layer.rect, rect);
    layer.rect.style.borderWidth = `${zoom}px`;
    const shown = boxes.slice(0, MAX_OUTLINES);
    while (layer.takes.length < shown.length) {
      const take = document.createElement('div');
      layer.root.append(take);
      layer.takes.push(take);
    }
    for (const [index, take] of layer.takes.entries()) {
      const box = shown[index];
      take.className = box ? 'take' : 'take off';
      if (!box) continue;
      setBox(take, box);
      take.style.outlineWidth = `${2 * zoom}px`;
      take.style.outlineOffset = `${-2 * zoom}px`;
    }
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

  /** The dragged copy goes beside the copy the slot names, as the build will render them. */
  function previewItem(source: ItemSource, slot: ItemSlot): void {
    const copies = copiesOf(source.id)?.copies ?? [];
    const copy = copies[source.from];
    const anchor = copies[slot.anchor];
    if (copy && anchor) showDrop([copy], anchor, slot.place);
  }

  const session = createSession({
    channel: deps.channel,
    post: deps.post,
    scale: () => zoom,
    slot: (point, source) => deps.slots(document, point, source, deps.entries()),
    itemSlot: itemSlotAt,
    indicate: (slot) => deps.indicator.show(slot),
    scroll: () => ({ x: scrollX, y: scrollY }),
    outline,
    taken(rect) {
      measured ??= rectItems(new Set(deps.locked()));
      return takenBy(measured, rect, MAX_IDS);
    },
    family: familyOf,
    started(source) {
      free?.();
      free = hold();
      measured = undefined;
      if (pointer !== undefined) {
        swallow = true;
        capture(pointer, true);
      }
      // A placeholder still here was never built (the insert was refused): it leaves now.
      placeholder?.remove();
      placeholder = undefined;
      if (source?.kind === 'move') undim = dim(firstOf(source.ids));
      if (source?.kind === 'item') {
        const copy = elementsWith(new Set([source.id]))[source.from];
        if (copy) undim = dim([copy]);
      }
    },
    ended() {
      undim?.();
      undim = undefined;
      measured = undefined;
      if (pointer !== undefined) capture(pointer, false);
      free?.();
      free = undefined;
    },
    preview,
    previewItem,
  });

  /** Ends whatever runs and forgets the pointer: a rectangle, an indicator and a dimming leave. */
  function letGo(): void {
    session.cancel();
    pointer = undefined;
  }

  function onDown(event: PointerEvent): void {
    // Before anything else, for any button and any finger: a gesture whose release the frame
    // never heard ends with the next press at the latest.
    swallow = false;
    letGo();
    if (!event.isPrimary || event.button !== 0) return;
    const target = event.target;
    if (!(target instanceof Element) || isOverlay(target) || isTyping(target)) return;
    // A press on a scroll bar scrolls.
    const { clientWidth, clientHeight } = document.documentElement;
    if (event.clientX >= clientWidth || event.clientY >= clientHeight) return;
    const entries = deps.entries();
    const chain = chainOf(target);
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
      copy: (id) => itemOfPick(chain.find((at) => idAt(at) === id) ?? null, id).item,
    });
    pointer = event.pointerId;
    last = { x: event.clientX, y: event.clientY };
    session.press(press, last, add);
  }

  function onMove(event: PointerEvent): void {
    if (event.pointerId !== pointer) return;
    // No button is down any more: the release happened where the frame could not hear it.
    if (event.buttons === 0) {
      letGo();
      return;
    }
    last = { x: event.clientX, y: event.clientY };
    session.move(last);
  }

  function onUp(event: PointerEvent): void {
    if (event.pointerId === pointer) {
      session.release({ x: event.clientX, y: event.clientY });
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
    if (event.pointerId === pointer && event.target === document.documentElement) letGo();
  }

  /**
   * The page moved under a still pointer: the slot or the rectangle is another one now, and the
   * indicator, which does not follow a scroll by itself, is shown again where the slot is.
   */
  function onScroll(): void {
    measured = undefined;
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
        listen('pointercancel', letGo);
        listen('lostpointercapture', onCaptureLost);
        listen('blur', letGo);
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
        letGo();
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

    scale(value) {
      zoom = value > 0 && Number.isFinite(value) ? value : 1;
      deps.indicator.scale(zoom);
    },
  };
}
