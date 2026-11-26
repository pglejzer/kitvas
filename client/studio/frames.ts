// The prototype frames of a draft page, the checks every message from one must pass (shared
// contract 1), and the messages the page sends them. The lens's messages (plan 19) have readers of
// their own (`lens-protocol.ts`): `lensMessage` checks one as `frameMessage` checks the others.

import type { OptionChoice } from '../../src/shared/values/options.ts';
import type { EditStudioBody } from '../channel/edit-protocol.ts';
import {
  type LensFrameMessage,
  type LensStudioBody,
  type LensStudioMessage,
  readLensFrame,
} from '../channel/lens-protocol.ts';
import type { LiveStudioBody } from '../channel/live-protocol.ts';
import {
  type FrameMessage,
  flashIds,
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

/** A click on a lens pin from one of `frames`: `frameMessage`'s checks, the lens's reader. */
export function lensMessage(
  frames: readonly Frame[],
  event: MessageEvent,
): { frame: Frame; message: LensFrameMessage } | undefined {
  if (event.origin !== 'null' || event.source === null) return undefined;
  const frame = frames.find((item) => item.element.contentWindow === event.source);
  if (!frame) return undefined;
  const message = readLensFrame(event.data, frame.channel);
  return message ? { frame, message } : undefined;
}

/** A sandboxed frame has an opaque origin, so the target is `*`; nothing secret is ever sent. */
function post(frame: Frame, message: StudioMessage | LensStudioMessage): void {
  frame.element.contentWindow?.postMessage(message, '*');
}

/** The pins of the lens that is on (client/channel/lens-protocol.ts); `[]` takes them away. */
export function sendLens(frame: Frame, body: LensStudioBody): void {
  post(frame, { kitvas: 1, channel: frame.channel, ...body });
}

export function sendMeasure(frame: Frame, request: number): void {
  post(frame, { kitvas: 1, channel: frame.channel, type: 'measure', request });
}

export function sendMarks(frame: Frame, marks: Mark[]): void {
  post(frame, { kitvas: 1, channel: frame.channel, type: 'marks', marks });
}

/** A ring flashes once on each of `ids` in the frame: a change was just applied to them. */
export function sendFlash(frame: Frame, ids: readonly string[]): void {
  const named = flashIds(ids);
  if (named.length === 0) return;
  post(frame, { kitvas: 1, channel: frame.channel, type: 'flash', ids: named });
}

export function sendState(frame: Frame, state: string): void {
  post(frame, { kitvas: 1, channel: frame.channel, type: 'state', state });
}

/** Shows these values of the version's options in the frame, in place; it answers `shown`. */
export function sendOptions(frame: Frame, choice: OptionChoice): void {
  post(frame, { kitvas: 1, channel: frame.channel, type: 'options', choice });
}

/**
 * Asks a frame to take the build on disk into the page it shows, without loading it again
 * (ADR 0058). It answers `ready` with `live`, or `swap` with the step it is at.
 */
export function sendSwap(frame: Frame, live: number): void {
  post(frame, { kitvas: 1, channel: frame.channel, type: 'swap', live });
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
