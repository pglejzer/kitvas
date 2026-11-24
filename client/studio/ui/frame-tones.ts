// Tells every prototype frame of the page the studio's theme and accent (ADR 0057), so what a
// frame draws over a draft (the selection, the marks) takes the studio's tones. A frame is told
// when it says `ready` (also after it loads again), at its first word of any kind (a frame that
// loaded before this script says `ready` to nobody, and stops saying it once the page speaks to
// it) and when the view changes; it is never reloaded for it. Only the two names go over the channel; the colours are the frame's own table
// (`client/frame/tones/tones.ts`).

import { parseFrameMessage, type StudioMessage } from '../../channel/protocol.ts';
import { currentTones, VIEW_EVENT } from './view-settings.ts';

const frames = (): HTMLIFrameElement[] => [
  ...document.querySelectorAll<HTMLIFrameElement>('iframe[data-channel]'),
];

function tell(frame: HTMLIFrameElement): void {
  const channel = frame.dataset.channel;
  if (!channel) return;
  const message: StudioMessage = { kitvas: 1, channel, type: 'tones', ...currentTones() };
  // A sandboxed frame has an opaque origin, so the target is `*`; nothing secret is sent.
  frame.contentWindow?.postMessage(message, '*');
}

/** A message of the studio's protocol on the frame's own channel, whatever its type. */
export function fromChannel(data: unknown, channel: string): boolean {
  if (typeof data !== 'object' || data === null) return false;
  return 'kitvas' in data && data.kitvas === 1 && 'channel' in data && data.channel === channel;
}

export function mountFrameTones(): void {
  /** The frames told once: any later word of theirs but `ready` needs no tones again. */
  const told = new WeakSet<HTMLIFrameElement>();
  window.addEventListener('message', (event) => {
    // The same checks as every other listener of the frames (`frames.ts`).
    if (event.origin !== 'null' || event.source === null) return;
    const frame = frames().find((item) => item.contentWindow === event.source);
    const channel = frame?.dataset.channel;
    if (!frame || !channel) return;
    if (!fromChannel(event.data, channel)) return;
    const loaded = parseFrameMessage(event.data, channel)?.type === 'ready';
    if (!loaded && told.has(frame)) return;
    told.add(frame);
    tell(frame);
  });
  document.addEventListener(VIEW_EVENT, () => {
    for (const frame of frames()) tell(frame);
  });
}
