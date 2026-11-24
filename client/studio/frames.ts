// The prototype frames of a draft page, the checks every message from one must pass (shared
// contract 1), and the messages the page sends them.

import type { EditStudioBody } from '../channel/edit-protocol.ts';
import type { LiveStudioBody } from '../channel/live-protocol.ts';
import {
  type FrameMessage,
  type Mark,
  parseFrameMessage,
  parseStudioMessage,
  type StudioMessage,
} from '../channel/protocol.ts';

export type FrameRole = 'current' | 'before';

export type Frame = {
  role: FrameRole;
  channel: string;
  element: HTMLIFrameElement;
  /** It has spoken: `ready`, or an answer to a `measure` sent before its `ready` was heard. */
  ready: boolean;
};

/** `iframe[data-frame]` with a channel; the first frame of each role counts. */
export function findFrames(main: HTMLElement): Frame[] {
  const frames: Frame[] = [];
  for (const element of main.querySelectorAll<HTMLIFrameElement>('iframe[data-frame]')) {
    const role = element.dataset.frame;
    const channel = element.dataset.channel;
    if (role !== 'current' && role !== 'before') continue;
    if (!channel || frames.some((frame) => frame.role === role)) continue;
    frames.push({ role, channel, element, ready: false });
  }
  return frames;
}

/**
 * The frame a message came from and what it said. A sandboxed frame's origin is `'null'`; the
 * source must be that frame's window and the data must pass the protocol's check on its channel.
 */
export function frameMessage(
  frames: readonly Frame[],
  event: MessageEvent,
): { frame: Frame; message: FrameMessage } | undefined {
  if (event.origin !== 'null' || event.source === null) return undefined;
  const frame = frames.find((item) => item.element.contentWindow === event.source);
  if (!frame) return undefined;
  const message = parseFrameMessage(event.data, frame.channel);
  return message ? { frame, message } : undefined;
}

/** A sandboxed frame has an opaque origin, so the target is `*`; nothing secret is ever sent. */
function post(frame: Frame, message: StudioMessage): void {
  frame.element.contentWindow?.postMessage(message, '*');
}

export function sendMeasure(frame: Frame, request: number): void {
  post(frame, { kitvas: 1, channel: frame.channel, type: 'measure', request });
}

export function sendMarks(frame: Frame, marks: Mark[]): void {
  post(frame, { kitvas: 1, channel: frame.channel, type: 'marks', marks });
}

export function sendState(frame: Frame, state: string): void {
  post(frame, { kitvas: 1, channel: frame.channel, type: 'state', state });
}

/** One of the editor's messages (client/channel/edit-protocol.ts). */
export function sendEdit(frame: Frame, body: EditStudioBody): void {
  post(frame, { kitvas: 1, channel: frame.channel, ...body } as StudioMessage);
}

/** One of stage 4c's live messages (client/channel/live-protocol.ts). */
export function sendLive(frame: Frame, body: LiveStudioBody): void {
  post(frame, { kitvas: 1, channel: frame.channel, ...body } as StudioMessage);
}

/** Only for asking the protocol whether a state id is valid; never sent. */
const PROBE_CHANNEL = 'state-check';

/** Whether the frames would take `state`: the protocol's own check decides. */
export function isStateId(state: string): boolean {
  const message = { kitvas: 1, channel: PROBE_CHANNEL, type: 'state', state };
  return parseStudioMessage(message, PROBE_CHANNEL) !== undefined;
}
