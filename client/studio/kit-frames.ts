// The example frames of the kit page (shared contract 9): the checks every message from one must
// pass and what a message may change. Kit code runs in these frames, so a frame only ever sizes
// or hides its own element, within limits; nothing it sends is put into the page as markup.

import { parseFrameMessage } from '../channel/protocol.ts';

/** The heights, in CSS pixels, a frame may ask for. */
export const MIN_HEIGHT = 48;
export const MAX_HEIGHT = 1200;

const FRAMES = 'iframe.example-frame[data-example][data-channel]';
const PREVIEW_NOTES = '[data-preview-note]';

/** What the checks need of a frame element: its window, to compare with a message's source. */
export type FrameHost = { readonly contentWindow: unknown };

export type ExampleFrame<Host extends FrameHost = HTMLIFrameElement> = {
  /** `<Component>.<n>`, from `data-example`. */
  key: string;
  channel: string;
  element: Host;
};

/** The parts of a `message` event the checks read; a `MessageEvent` has them. */
export type FrameEvent = {
  readonly origin: string;
  readonly source: unknown;
  readonly data: unknown;
};

/** What one frame said about its example. */
export type ExampleReport<Frame> =
  | { frame: Frame; shown: true; height: number }
  | { frame: Frame; shown: false };

/** A height in whole pixels between the limits. */
export function clampHeight(height: number): number {
  return Math.min(MAX_HEIGHT, Math.max(MIN_HEIGHT, Math.ceil(height)));
}

/**
 * The frame a message came from and what it said; `undefined` for anything else. A sandboxed
 * frame's origin is `'null'`, the source must be that frame's window (read now: it changes when
 * the frame loads another page) and the data must be an `example` on that frame's own channel.
 */
export function exampleReport<Frame extends ExampleFrame<FrameHost>>(
  frames: readonly Frame[],
  event: FrameEvent,
): ExampleReport<Frame> | undefined {
  if (event.origin !== 'null' || event.source === null || event.source === undefined) {
    return undefined;
  }
  const frame = frames.find((item) => item.element.contentWindow === event.source);
  if (!frame) return undefined;
  const message = parseFrameMessage(event.data, frame.channel);
  if (message?.type !== 'example') return undefined;
  return message.shown
    ? { frame, shown: true, height: clampHeight(message.height) }
    : { frame, shown: false };
}

/** `iframe.example-frame` with a key and a channel, inside the page's `main`. */
export function findExampleFrames(main: HTMLElement): ExampleFrame[] {
  const frames: ExampleFrame[] = [];
  for (const element of main.querySelectorAll<HTMLIFrameElement>(FRAMES)) {
    const key = element.dataset.example;
    const channel = element.dataset.channel;
    if (key && channel) frames.push({ key, channel, element });
  }
  return frames;
}

/** Shown: the frame takes the height. Not shown: the frame hides and its note shows. */
export function applyReport(main: HTMLElement, report: ExampleReport<ExampleFrame>): void {
  const { element, key } = report.frame;
  if (report.shown) {
    element.style.height = `${report.height}px`;
    return;
  }
  element.hidden = true;
  // The skin makes the frame a block, which beats the `hidden` attribute on its own.
  element.style.display = 'none';
  // Compared as text, never built into a selector.
  for (const note of main.querySelectorAll<HTMLElement>(PREVIEW_NOTES)) {
    if (note.dataset.previewNote === key) note.hidden = false;
  }
}
