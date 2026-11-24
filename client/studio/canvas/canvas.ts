// The canvas of the editor screen (plan 15, task B): zoom from 10 % to 400 %, Fit that follows the
// room, pan, and "zoom to selection". It runs in Preview and in Edit, with or without the editor.
//
// The cards sit in one world (`[data-canvas="world"]`) that is scaled as a whole, so two compared
// cards share one zoom. Nothing is moved in the DOM: moving an iframe reloads it. The sizer gets
// the size of the scaled world, so the scroller (`[data-canvas="scroll"]`) is the only thing that
// scrolls. The rules are in `zoom.ts`; this file applies them.

import type { CanvasFrameMessage, CanvasStudioMessage } from '../../channel/canvas-protocol.ts';
import type { Frame } from '../frames.ts';
import { emitShellKey, onShellKey } from '../shell/bus.ts';
import { mountPan } from './pan.ts';
import { mountStrip } from './strip.ts';
import {
  anchorScroll,
  type Box,
  centreScroll,
  clampZoom,
  fitZoom,
  fromFramePoint,
  type Placement,
  type Point,
  placeWorld,
  type Size,
  selectionZoom,
  stepZoom,
  wheelPixels,
  wheelZoom,
} from './zoom.ts';

export type Canvas = {
  zoom(): number;
  /** Whether the world fits the room's width, so a card grows to both sides (the width handle). */
  centred(): boolean;
  /** Hears every zoom change; returns the way to stop. */
  onZoom(listener: (zoom: number) => void): () => void;
  /** A canvas message of one of the page's frames. */
  hear(frame: Frame, message: CanvasFrameMessage): void;
  /** A frame loaded again: what it held (Space) is gone with its page. */
  frameReady(): void;
  /** Where "zoom to selection" reads the selected element's id; `undefined` for none. */
  selectionFrom(read: () => string | undefined): void;
};

/** A sandboxed frame has an opaque origin, so the target is `*`; nothing secret is sent. */
function sendLocate(frame: Frame, request: number, id: string): void {
  const message: CanvasStudioMessage = {
    kitvas: 1,
    channel: frame.channel,
    type: 'locate',
    request,
    id,
  };
  frame.element.contentWindow?.postMessage(message, '*');
}

/** Tells a frame the zoom, so its element labels keep one size on the screen. */
function sendZoom(frame: Frame, value: number): void {
  const message: CanvasStudioMessage = { kitvas: 1, channel: frame.channel, type: 'zoom', value };
  frame.element.contentWindow?.postMessage(message, '*');
}

/** Scrolls the page in a frame to the same place as the other side of a compare. */
function sendScrollTo(frame: Frame, ratio: number): void {
  const message: CanvasStudioMessage = {
    kitvas: 1,
    channel: frame.channel,
    type: 'scroll-to',
    ratio,
  };
  frame.element.contentWindow?.postMessage(message, '*');
}

/** The corner of a frame's own viewport on the page: inside its border. */
function contentCorner(frame: Frame, zoom: number): { left: number; top: number } {
  const rect = frame.element.getBoundingClientRect();
  return {
    left: rect.left + frame.element.clientLeft * zoom,
    top: rect.top + frame.element.clientTop * zoom,
  };
}

/** The canvas's three parts; `null` on a page without them. */
function partsOf(
  main: HTMLElement,
): { scroll: HTMLElement; sizer: HTMLElement; world: HTMLElement } | null {
  const scroll = main.querySelector<HTMLElement>('[data-canvas="scroll"]');
  const sizer = main.querySelector<HTMLElement>('[data-canvas="sizer"]');
  const world = main.querySelector<HTMLElement>('[data-canvas="world"]');
  return scroll && sizer && world ? { scroll, sizer, world } : null;
}

export function mountCanvas(main: HTMLElement, frames: readonly Frame[]): Canvas | undefined {
  const parts = partsOf(main);
  if (!parts) return undefined;
  // Plain consts, so the functions below keep them non-null.
  const { scroll, sizer, world } = parts;
  const region = main.querySelector<HTMLElement>('[data-shell="canvas"]') ?? scroll;

  let zoom = 1;
  /** Fit follows the room: on until the person picks any other zoom. */
  let fitted = true;
  let place: Placement = { width: 0, height: 0, left: 0, top: 0, centred: true };
  let readSelection: () => string | undefined = () => undefined;
  let locating = 0;
  const listeners = new Set<(zoom: number) => void>();

  const room = (): Size => ({ width: scroll.clientWidth, height: scroll.clientHeight });
  const worldSize = (): Size => ({ width: world.offsetWidth, height: world.offsetHeight });

  /** Puts the world where the zoom and the room say; the frames keep their own size. */
  function draw(): void {
    place = placeWorld(room(), worldSize(), zoom);
    sizer.style.width = `${place.width}px`;
    sizer.style.height = `${place.height}px`;
    world.style.transform = `translate(${place.left}px, ${place.top}px) scale(${zoom})`;
    // Captions and the width handle keep their size on the screen (the skin divides by this).
    world.style.setProperty('--canvas-zoom', String(zoom));
  }

  const pan = mountPan(scroll, main.querySelector<HTMLElement>('[data-canvas="shield"]'));
  const strip = mountStrip(main.querySelector<HTMLElement>('[data-dock="zoom"]'), {
    step: (direction) => setZoom(stepZoom(zoom, direction)),
    set: (next) => setZoom(next),
    fit,
    selection: toSelection,
    hasSelection: () => readSelection() !== undefined,
  });

  function tell(changed: boolean): void {
    strip.show(zoom, fitted);
    if (!changed) return;
    for (const frame of frames) sendZoom(frame, zoom);
    for (const listener of [...listeners]) listener(zoom);
  }

  /**
   * A zoom the person picked: Fit goes off. `anchor` (page pixels) is the point that stays still,
   * the middle of the canvas without one.
   */
  function setZoom(next: number, anchor?: Point): void {
    const to = clampZoom(next);
    const from = zoom;
    fitted = false;
    if (to === from) {
      tell(false);
      return;
    }
    const rect = scroll.getBoundingClientRect();
    const at = anchor
      ? { x: anchor.x - rect.left, y: anchor.y - rect.top }
      : { x: scroll.clientWidth / 2, y: scroll.clientHeight / 2 };
    const before = place;
    const left = scroll.scrollLeft;
    const top = scroll.scrollTop;
    zoom = to;
    draw();
    scroll.scrollLeft = anchorScroll(
      left,
      at.x,
      { zoom: from, offset: before.left },
      { zoom: to, offset: place.left },
    );
    scroll.scrollTop = anchorScroll(
      top,
      at.y,
      { zoom: from, offset: before.top },
      { zoom: to, offset: place.top },
    );
    tell(true);
  }

  /** The room or the world changed size: Fit follows it, any other zoom only finds its place. */
  function follow(): void {
    const next = fitted ? fitZoom(room(), worldSize()) : zoom;
    const changed = next !== zoom;
    zoom = next;
    draw();
    tell(changed);
  }

  function fit(): void {
    fitted = true;
    follow();
  }

  /** Asks the current frame where the selected element is; `located` answers. */
  function toSelection(): void {
    const id = readSelection();
    const frame = frames.find((item) => item.role === 'current');
    if (id === undefined || !frame) return;
    locating += 1;
    sendLocate(frame, locating, id);
  }

  /** The element is in view in its frame at `box`: zoom so that it fills most of the canvas. */
  function onLocated(frame: Frame, box: Box): void {
    const corner = contentCorner(frame, zoom);
    const origin = world.getBoundingClientRect();
    const inWorld: Box = {
      x: (corner.left - origin.left) / zoom + box.x,
      y: (corner.top - origin.top) / zoom + box.y,
      width: box.width,
      height: box.height,
    };
    const next = selectionZoom(room(), inWorld);
    if (next === null) return;
    const changed = next !== zoom;
    fitted = false;
    zoom = next;
    draw();
    const { width, height } = room();
    scroll.scrollLeft = centreScroll(
      inWorld.x + inWorld.width / 2,
      { zoom, offset: place.left },
      width,
    );
    scroll.scrollTop = centreScroll(
      inWorld.y + inWorld.height / 2,
      { zoom, offset: place.top },
      height,
    );
    tell(changed);
  }

  // A pinch arrives as a wheel with `ctrlKey`; the browser's own zoom must not take it. A plain
  // wheel is left alone: it scrolls the canvas.
  region.addEventListener(
    'wheel',
    (event) => {
      if (!event.ctrlKey && !event.metaKey) return;
      event.preventDefault();
      const delta = wheelPixels(event.deltaY, event.deltaMode);
      setZoom(wheelZoom(zoom, delta), { x: event.clientX, y: event.clientY });
    },
    { passive: false },
  );

  onShellKey((key) => {
    if (key === 'fit') fit();
    else if (key === 'selection') toSelection();
    else if (key === 'actual') setZoom(1);
  });

  // The skin places the world by the script from here on.
  scroll.setAttribute('data-live', '');
  if (typeof ResizeObserver === 'function') {
    // The room: a panel or the window was resized. The world: a width, or a card, changed.
    const sizes = new ResizeObserver(() => follow());
    sizes.observe(scroll);
    sizes.observe(world);
  } else {
    window.addEventListener('resize', follow);
  }
  follow();

  return {
    zoom: () => zoom,
    centred: () => place.centred,
    onZoom(listener) {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
    hear(frame, message) {
      switch (message.type) {
        case 'zoom-wheel': {
          const at = fromFramePoint(message, contentCorner(frame, zoom), zoom);
          setZoom(wheelZoom(zoom, message.deltaY), at);
          break;
        }
        case 'space':
          pan.frameSpace(message.down);
          break;
        case 'shell-key':
          emitShellKey(message.key);
          break;
        case 'located':
          if (frame.role === 'current' && message.request === locating && message.box) {
            onLocated(frame, message.box);
          }
          break;
        case 'scrolled':
          // Compare: the other side follows, at the same place of its own page.
          for (const other of frames) {
            if (other !== frame) sendScrollTo(other, message.ratio);
          }
          break;
      }
    },
    frameReady() {
      pan.frameSpace(false);
      // A frame that loaded again starts at scale 1.
      for (const frame of frames) sendZoom(frame, zoom);
    },
    selectionFrom(read) {
      readSelection = read;
    },
  };
}
