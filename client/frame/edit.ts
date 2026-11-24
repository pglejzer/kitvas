// Edit mode in a prototype: while the studio has it on, a click picks an element instead of
// acting, a few keys go to the studio, and the frame draws what the studio tells it: outlines
// around the selected and the hovered elements, and an inline editor for one element's text.
// The page owns the selection and the history; nothing here decides what is selected.
//
// Outlines sit in an overlay of their own at the end of `body`, inside a closed shadow root, the
// way the marks do: no style of a page element is ever changed, and the overlay takes no pointer
// events. `keyOf` and `pickOf` are pure; the rest is the DOM around them.

import {
  type EditFrameMessage,
  type EditStudioMessage,
  MAX_INLINE_TEXT,
  type PreviewChange,
  parseEditFrame,
} from '../channel/edit-protocol.ts';
import { type KeyLike, keyOf } from './keys.ts';
import { placeRing, type Rect } from './place.ts';
import { cut } from './snapshot.ts';
import { elementsWith, inspectStyles, readTree } from './tree.ts';

const MARKED = '[data-ks]';
/** More outlines than this are not drawn: a mapped list of thousands stays cheap to follow. */
const MAX_BOXES = 500;

// Colours come from the kit's variables in the prototype's own sheet (custom properties reach
// into a shadow root). The system colours stand in for a kit that has no such variable.
const SHEET = `
.box {
  position: absolute; left: 0; top: 0; box-sizing: border-box; pointer-events: none;
  outline: 2px solid var(--kit-color-focus, Highlight); outline-offset: 0;
}
.box[data-kind="hover"] { outline: 1px solid var(--kit-color-ink-mid, GrayText); }
.off { display: none; }
@media (forced-colors: active) {
  .box { outline-color: Highlight; }
}
`;

const HOST_RULES = [
  'all: initial',
  'position: absolute',
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

// Kept importable from here for the code and tests that already do.
export { type KeyLike, keyOf };

/** As much of an element as picking needs. */
export type TargetLike = {
  closest(selector: string): { getAttribute(name: string): string | null } | null;
};
export type Picked = { id: string | null; add: boolean; double: boolean };

/** The id of the nearest marked element around `target`; `null` outside any, or for an odd id. */
export function idOf(target: TargetLike | null): string | null {
  const id = target?.closest(MARKED)?.getAttribute('data-ks') ?? null;
  // The protocol's own check: an id the studio would refuse is no id.
  if (id === null || !parseEditFrame({ type: 'hovered', id }, 'probe')) return null;
  return id;
}

/** What a click on `target` picks: Shift adds to the selection, a double click asks for more. */
export function pickOf(target: TargetLike | null, shift: boolean, double: boolean): Picked {
  return { id: idOf(target), add: shift, double };
}

export type EditDeps = {
  channel: string;
  post(message: EditFrameMessage): void;
  /** The optimistic preview (`preview.ts`). */
  preview: { apply(changes: PreviewChange[]): void; clear(): void };
};

export type Edit = {
  handle(message: EditStudioMessage): void;
  /** Keeps the outlines on their elements every frame until `until` settles (a state's motion). */
  follow(until: Promise<unknown>): void;
};

type Layer = { host: HTMLElement; root: HTMLElement; boxes: HTMLElement[] };
type Inline = {
  id: string;
  element: HTMLElement;
  before: string;
  editable: string | null;
  onBlur(): void;
};

/** Stopped while edit mode is on, so no link, button or handler of the page acts. */
const POINTER_EVENTS = [
  'pointerdown',
  'mousedown',
  'pointerup',
  'mouseup',
  'click',
  'dblclick',
  'auxclick',
] as const;

const pageRect = (element: Element): Rect => {
  const { left, top, width, height } = element.getBoundingClientRect();
  return { left: left + scrollX, top: top + scrollY, width, height };
};

function createLayer(): Layer {
  const host = document.createElement('kitvas-edit');
  host.setAttribute('aria-hidden', 'true');
  host.style.cssText = HOST_STYLE;
  const shadow = host.attachShadow({ mode: 'closed' });
  const sheet = document.createElement('style');
  sheet.textContent = SHEET;
  const root = document.createElement('div');
  shadow.append(sheet, root);
  document.body.append(host);
  return { host, root, boxes: [] };
}

/** Puts `value` into the element as one text node, keeping the node React made when it can. */
function writeText(element: HTMLElement, value: string): void {
  const first = element.firstChild;
  if (first instanceof Text) {
    first.data = value;
    while (first.nextSibling) first.nextSibling.remove();
  } else {
    element.textContent = value;
  }
}

function caretToEnd(element: HTMLElement): void {
  const selection = getSelection();
  if (!selection) return;
  const range = document.createRange();
  range.selectNodeContents(element);
  range.collapse(false);
  selection.removeAllRanges();
  selection.addRange(range);
}

const nearest = (target: EventTarget | null): Element | null =>
  target instanceof Element ? target.closest(MARKED) : null;

export function createEdit({ channel, post, preview }: EditDeps): Edit {
  const head = { kitvas: 1 as const, channel };
  let on = false;
  let layer: Layer | undefined;
  let selected: ReadonlySet<string> = new Set();
  /** What the pointer is over in the frame. */
  let overElement: Element | null = null;
  let overId: string | null = null;
  /** The element the studio points at (a row of its layers tree). */
  let shownId: string | null = null;
  let inline: Inline | undefined;
  let drawFrame = 0;
  let hoverFrame = 0;
  let pointerAt: EventTarget | null = null;
  let observed = new WeakSet<Element>();
  let unlisten: (() => void)[] = [];

  const resizes =
    typeof ResizeObserver === 'function' ? new ResizeObserver(() => schedule()) : undefined;
  // A render, a preview or typing may move an element without resizing anything observed.
  const changes =
    typeof MutationObserver === 'function' ? new MutationObserver(() => schedule()) : undefined;

  function targets(): { element: Element; kind: 'hover' | 'select' }[] {
    const hovered = new Set<Element>();
    if (overElement?.isConnected) hovered.add(overElement);
    const shown = shownId === null ? [] : elementsWith(new Set([shownId]));
    for (const element of shown) hovered.add(element);
    const list: { element: Element; kind: 'hover' | 'select' }[] = [];
    for (const element of hovered) list.push({ element, kind: 'hover' });
    // Selected last, so its outline is drawn over a hover outline on the same element.
    for (const element of elementsWith(selected)) {
      list.push({ element, kind: 'select' });
      if (resizes && !observed.has(element)) {
        observed.add(element);
        resizes.observe(element);
      }
    }
    return list.slice(0, MAX_BOXES);
  }

  /** Puts every outline where its element is now. Elements are found again each time by id. */
  function draw(): void {
    if (!layer) return;
    const hostRect = pageRect(layer.host);
    const host = { left: hostRect.left, top: hostRect.top };
    const pageWidth = document.documentElement.clientWidth;
    const list = targets();
    while (layer.boxes.length < list.length) {
      const box = document.createElement('div');
      box.className = 'box';
      layer.root.append(box);
      layer.boxes.push(box);
    }
    for (const [index, box] of layer.boxes.entries()) {
      const target = list[index];
      const ring = target ? placeRing(pageRect(target.element), host, pageWidth) : undefined;
      box.classList.toggle('off', !target || !ring);
      if (!target || !ring) continue;
      box.dataset.kind = target.kind;
      box.style.left = `${ring.left}px`;
      box.style.top = `${ring.top}px`;
      box.style.width = `${ring.width}px`;
      box.style.height = `${ring.height}px`;
    }
  }

  function schedule(): void {
    if (!on || drawFrame !== 0) return;
    drawFrame = requestAnimationFrame(() => {
      drawFrame = 0;
      draw();
    });
  }

  /** Ends the inline editor: `keep` sends the new text, otherwise the old text comes back. */
  function endText(keep: boolean): void {
    const ending = inline;
    if (!ending) return;
    // First, so the blur that follows does not end it a second time.
    inline = undefined;
    const { element } = ending;
    element.removeEventListener('blur', ending.onBlur);
    // A pasted line break becomes a space: JSX text shows it as one, and the write refuses breaks.
    const typed = (element.textContent ?? '').replace(/\s*[\r\n]+\s*/g, ' ').trim();
    const value = keep ? cut(typed, MAX_INLINE_TEXT) : null;
    writeText(element, value ?? ending.before);
    if (ending.editable === null) element.removeAttribute('contenteditable');
    else element.setAttribute('contenteditable', ending.editable);
    if (document.activeElement === element) element.blur();
    post({ ...head, type: 'text', id: ending.id, value });
    schedule();
  }

  function startText(id: string): void {
    // Only one at a time: the one before keeps what was typed.
    endText(true);
    const element = on ? elementsWith(new Set([id]))[0] : undefined;
    // Only plain text is edited in place; the studio is told at once, so it never waits.
    if (!(element instanceof HTMLElement) || element.childElementCount > 0) {
      post({ ...head, type: 'text', id, value: null });
      return;
    }
    const started: Inline = {
      id,
      element,
      before: element.textContent ?? '',
      editable: element.getAttribute('contenteditable'),
      onBlur: () => endText(true),
    };
    element.setAttribute('contenteditable', 'plaintext-only');
    // A browser that does not know the value reads it back as something else.
    if (element.contentEditable !== 'plaintext-only') {
      element.setAttribute('contenteditable', 'true');
    }
    element.addEventListener('blur', started.onBlur);
    inline = started;
    element.focus();
    caretToEnd(element);
  }

  const inEditor = (target: EventTarget | null): boolean =>
    inline !== undefined && target instanceof Node && inline.element.contains(target);

  function onPointer(event: MouseEvent): void {
    event.stopPropagation();
    if (inEditor(event.target)) {
      // The caret and the selection work as usual; only the click itself (a link, a button)
      // does nothing.
      if (event.type === 'click' || event.type === 'auxclick') event.preventDefault();
      return;
    }
    // `pointerdown` is left alone: preventing it would keep `mousedown` from coming at all.
    if (event.type === 'pointerdown' || event.type === 'pointerup') return;
    event.preventDefault();
    if (event.type === 'mousedown') {
      endText(true);
      // The prevented press gave the frame no focus, and the keys below need it.
      window.focus();
      return;
    }
    // A double click comes as two clicks and a `dblclick`: the second click picks nothing more.
    const double = event.type === 'dblclick';
    if (!double && !(event.type === 'click' && event.detail <= 1)) return;
    post({ ...head, type: 'pick', ...pickOf(nearest(event.target), event.shiftKey, double) });
  }

  function onKey(event: KeyboardEvent): void {
    if (inline) {
      // Typing belongs to the text: arrows move the caret and undo is the browser's.
      event.stopPropagation();
      if (event.isComposing) return;
      if (event.key === 'Enter' || event.key === 'Escape') {
        event.preventDefault();
        endText(event.key === 'Enter');
      }
      return;
    }
    const key = keyOf(event);
    if (!key) return;
    event.preventDefault();
    event.stopPropagation();
    post({ ...head, type: 'key', key });
  }

  function flushHover(): void {
    hoverFrame = 0;
    const element = nearest(pointerAt);
    const id = idOf(element);
    const moved = element !== overElement;
    overElement = id === null ? null : element;
    if (id !== overId) {
      overId = id;
      post({ ...head, type: 'hovered', id });
    }
    if (moved) draw();
  }

  function onMove(event: MouseEvent): void {
    pointerAt = event.target;
    if (hoverFrame === 0) hoverFrame = requestAnimationFrame(flushHover);
  }

  function onOut(event: MouseEvent): void {
    // No related target: the pointer left the frame.
    if (event.relatedTarget !== null) return;
    pointerAt = null;
    if (hoverFrame === 0) hoverFrame = requestAnimationFrame(flushHover);
  }

  function listen<K extends keyof WindowEventMap>(
    type: K,
    handler: (event: WindowEventMap[K]) => void,
    passive: boolean,
  ): void {
    const options = { capture: true, passive };
    window.addEventListener(type, handler, options);
    unlisten.push(() => window.removeEventListener(type, handler, options));
  }

  function turnOn(): void {
    if (on) return;
    on = true;
    layer = createLayer();
    for (const type of POINTER_EVENTS) listen(type, onPointer, false);
    listen('keydown', onKey, false);
    listen('mousemove', onMove, true);
    listen('mouseout', onOut, true);
    // Capture: scrolling inside any scroll box of the prototype moves its elements too.
    listen('scroll', schedule, true);
    listen('resize', schedule, true);
    listen('load', schedule, true);
    resizes?.observe(document.documentElement);
    resizes?.observe(document.body);
    changes?.observe(document.body, {
      childList: true,
      subtree: true,
      characterData: true,
      attributes: true,
      attributeFilter: ['class', 'style', 'hidden'],
    });
    // Web fonts that arrive later change the boxes.
    document.fonts?.ready.then(schedule, () => undefined);
  }

  function turnOff(): void {
    if (!on) return;
    endText(false);
    on = false;
    for (const stop of unlisten) stop();
    unlisten = [];
    resizes?.disconnect();
    changes?.disconnect();
    observed = new WeakSet();
    cancelAnimationFrame(drawFrame);
    cancelAnimationFrame(hoverFrame);
    drawFrame = 0;
    hoverFrame = 0;
    layer?.host.remove();
    layer = undefined;
    selected = new Set();
    overElement = null;
    overId = null;
    shownId = null;
    pointerAt = null;
  }

  return {
    handle(message) {
      switch (message.type) {
        case 'edit':
          if (message.on) turnOn();
          else turnOff();
          break;
        case 'select':
          // Outside edit mode nothing is drawn; the studio sends the selection again with `edit`.
          if (!on) break;
          selected = new Set(message.ids);
          draw();
          break;
        case 'hover':
          if (!on) break;
          shownId = message.id;
          draw();
          break;
        case 'tree':
          post({ ...head, type: 'tree', request: message.request, nodes: readTree() });
          break;
        case 'inspect':
          post({
            ...head,
            type: 'inspected',
            request: message.request,
            id: message.id,
            ...inspectStyles(message.id),
          });
          break;
        case 'edit-text':
          startText(message.id);
          break;
        case 'preview':
          preview.apply(message.changes);
          schedule();
          break;
        case 'unpreview':
          preview.clear();
          schedule();
          break;
      }
    },

    follow(until) {
      if (!on) return;
      let active = true;
      const tick = (): void => {
        if (!active || !on) return;
        draw();
        requestAnimationFrame(tick);
      };
      requestAnimationFrame(tick);
      const end = (): void => {
        active = false;
        schedule();
      };
      until.then(end, end);
    },
  };
}
