// The frame's side of the editor screen's canvas (plan 15, task B). A frame takes the pointer and
// the keys while the person is over it, so it forwards what belongs to the screen, in Preview and
// in Edit: the zoom wheel (Ctrl or Cmd with the wheel; a pinch arrives as one) and the screen's
// keys. In Edit it also forwards Space, which pans the canvas; in Preview Space is the page's. It
// answers `locate` with an element's box, for "zoom to selection".
//
// Keys typed into a field stay with the field. The editor's own keys (`keys.ts`) are other keys,
// and its inline text editor is a field, so no key is handled twice.
// `wheelOf`, `spaceStep`, `isField` and `boxOf` are pure; the rest is the DOM around them.

import {
  type CanvasStudioMessage,
  type FrameBox,
  MAX_CANVAS_PX,
  MAX_DELTA,
  type ShellKeyLike,
  shellKeyOf,
} from '../../channel/canvas-protocol.ts';
import type { FrameMessage } from '../../channel/protocol.ts';
import { elementsWith } from '../edit/tree.ts';

export type CanvasDeps = {
  channel: string;
  post: (message: FrameMessage) => void;
};

export type Canvas = {
  /** A canvas message from the page (`locate`). */
  handle(message: CanvasStudioMessage): void;
  /** Edit mode went on or off: Space is forwarded only while it is on. */
  edit(on: boolean): void;
};

const cut = (value: number, most: number): number => Math.max(-most, Math.min(most, value));

/** The parts of a wheel event the forwarding reads. */
export type WheelLike = {
  ctrlKey: boolean;
  metaKey: boolean;
  clientX: number;
  clientY: number;
  deltaY: number;
  /** 0 pixels, 1 lines, 2 pages. */
  deltaMode: number;
};

/**
 * What a wheel event sends to the page: only with Ctrl or Cmd held (a pinch sets `ctrlKey`). The
 * step is in pixels and, like the point, inside what the protocol carries. `null` for a plain
 * wheel, which scrolls the page in the frame.
 */
export function wheelOf(event: WheelLike): { x: number; y: number; deltaY: number } | null {
  if (!event.ctrlKey && !event.metaKey) return null;
  const { clientX, clientY, deltaY } = event;
  if (![clientX, clientY, deltaY].every(Number.isFinite)) return null;
  // A mouse may report lines or pages; the page zooms by pixels.
  const unit = event.deltaMode === 1 ? 16 : event.deltaMode === 2 ? 400 : 1;
  const pixels = deltaY * unit;
  return {
    x: cut(clientX, MAX_CANVAS_PX),
    y: cut(clientY, MAX_CANVAS_PX),
    deltaY: cut(pixels, MAX_DELTA),
  };
}

/** The parts of a key event's target the field check reads. */
export type FieldLike = { tagName?: string; isContentEditable?: boolean } | null;

/** Typing belongs here: an input, a textarea, a select, or text being edited in place. */
export function isField(target: FieldLike): boolean {
  if (!target) return false;
  if (target.isContentEditable === true) return true;
  const tag = (target.tagName ?? '').toUpperCase();
  return tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT';
}

/** The parts of a key event the Space rule reads. */
export type SpaceLike = {
  type: string;
  code: string;
  ctrlKey: boolean;
  metaKey: boolean;
  altKey: boolean;
};

/**
 * What a key event means for panning.
 * - `send`: tell the page Space went down (`true`) or up (`false`); `null` to say nothing.
 * - `prevent`: the page in the frame must not get the key (it would scroll or press a button).
 * Space is the canvas's only in Edit mode and outside a field; a repeat of a held Space is kept
 * from the page without being sent again. A key that comes up is always told, so the canvas
 * never stays in pan.
 */
export function spaceStep(
  event: SpaceLike,
  state: { edit: boolean; down: boolean; field: boolean },
): { send: boolean | null; prevent: boolean } {
  const nothing = { send: null, prevent: false };
  if (event.code !== 'Space') return nothing;
  if (event.type === 'keyup') return state.down ? { send: false, prevent: true } : nothing;
  if (event.type !== 'keydown') return nothing;
  if (!state.edit || state.field || event.ctrlKey || event.metaKey || event.altKey) return nothing;
  return { send: state.down ? null : true, prevent: true };
}

/** What `boxOf` reads of a `DOMRect`. */
export type RectLike = { left: number; top: number; width: number; height: number };

/** A rectangle of the frame's viewport as the protocol carries it; `null` for one it refuses. */
export function boxOf(rect: RectLike): FrameBox | null {
  const { left, top, width, height } = rect;
  if (![left, top, width, height].every(Number.isFinite)) return null;
  if (Math.abs(left) > MAX_CANVAS_PX || Math.abs(top) > MAX_CANVAS_PX) return null;
  if (width < 0 || height < 0) return null;
  return {
    x: left,
    y: top,
    width: Math.min(width, MAX_CANVAS_PX),
    height: Math.min(height, MAX_CANVAS_PX),
  };
}

/** How far down the page is scrolled, 0 to 1; 0 when the page is no taller than the view. */
export function scrollRatio(top: number, height: number, view: number): number {
  const room = height - view;
  if (!(room > 0) || !Number.isFinite(top)) return 0;
  return Math.min(1, Math.max(0, top / room));
}

/** The scroll position for `ratio` on a page of `height` seen through `view`. */
export function scrollTopOf(ratio: number, height: number, view: number): number {
  return Math.round(Math.min(1, Math.max(0, ratio)) * Math.max(0, height - view));
}

/** After a `scroll-to`, the scrolls it causes are not reported back for this long. */
export const FOLLOW_QUIET_MS = 120;

export function createCanvas({ channel, post }: CanvasDeps): Canvas {
  const head = { kitvas: 1 as const, channel };
  let edit = false;
  /** Space is held and the page was told. */
  let down = false;

  const fieldOf = (target: EventTarget | null): boolean =>
    isField(target instanceof HTMLElement ? target : null);

  function release(): void {
    if (!down) return;
    down = false;
    post({ ...head, type: 'space', down: false });
  }

  function onWheel(event: WheelEvent): void {
    const wheel = wheelOf(event);
    if (!wheel) return;
    // The browser's own zoom must not take it; the page zooms the canvas instead.
    event.preventDefault();
    post({ ...head, type: 'zoom-wheel', ...wheel });
  }

  function onSpace(event: KeyboardEvent): boolean {
    const step = spaceStep(event, { edit, down, field: fieldOf(event.target) });
    if (step.prevent) event.preventDefault();
    if (step.send !== null) {
      down = step.send;
      post({ ...head, type: 'space', down });
    }
    return step.prevent;
  }

  function onKeyDown(event: KeyboardEvent): void {
    if (event.isComposing || onSpace(event)) return;
    if (fieldOf(event.target)) return;
    const like: ShellKeyLike = event;
    const key = shellKeyOf(like);
    if (key === null) return;
    // The browser's own Ctrl+0, and the page in the frame, must not get a screen key.
    event.preventDefault();
    // A held key is one press for the screen.
    if (!event.repeat) post({ ...head, type: 'shell-key', key });
  }

  // Capture, on the window: before any handler of the prototype, which may stop the event.
  window.addEventListener('wheel', onWheel, { capture: true, passive: false });
  window.addEventListener('keydown', onKeyDown, { capture: true });
  window.addEventListener('keyup', (event) => void onSpace(event), { capture: true });
  // The key may come up outside the frame.
  window.addEventListener('blur', release);

  // Compare scrolls both sides together: the page hears each scroll, once a frame.
  let quietUntil = 0;
  let scrollFrame = 0;
  const page = (): { top: number; height: number; view: number } => ({
    top: window.scrollY,
    height: document.documentElement.scrollHeight,
    view: window.innerHeight,
  });
  window.addEventListener(
    'scroll',
    () => {
      if (scrollFrame !== 0) return;
      scrollFrame = requestAnimationFrame(() => {
        scrollFrame = 0;
        if (performance.now() < quietUntil) return;
        const { top, height, view } = page();
        post({ ...head, type: 'scrolled', ratio: scrollRatio(top, height, view) });
      });
    },
    { passive: true },
  );

  return {
    handle(message) {
      // `zoom` goes to the edit layer's labels (`runtime.ts`).
      if (message.type === 'scroll-to') {
        const { height, view } = page();
        quietUntil = performance.now() + FOLLOW_QUIET_MS;
        window.scrollTo({ top: scrollTopOf(message.ratio, height, view), behavior: 'instant' });
        return;
      }
      if (message.type !== 'locate') return;
      // One copy of a list item when the page names it; the first otherwise.
      const element = elementsWith(new Set([message.id]))[message.item ?? 0];
      let box: FrameBox | null = null;
      if (element) {
        // The tools on the selection only read the box: they must not fight the person's scroll.
        if (message.scroll !== false) {
          element.scrollIntoView({ block: 'nearest', inline: 'nearest', behavior: 'instant' });
        }
        box = boxOf(element.getBoundingClientRect());
      }
      post({ ...head, type: 'located', request: message.request, box });
    },
    edit(on) {
      edit = on;
      if (!on) release();
    },
  };
}
