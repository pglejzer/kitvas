// Live checks in the frame (spec 4c, goals 5, 7 and 8; plan 16, task C): measures the elements the
// page names after an edit's build (contrast, target size, overflow, clipping, the build against
// what the editor showed) and answers the accessibility card. The findings show as the Checks
// lens's pins (`client/frame/lens/`, plan 19).

import type {
  A11yCard,
  Expected,
  LiveFact,
  LiveStudioMessage,
} from '../../channel/live-protocol.ts';
import type { FrameMessage } from '../../channel/protocol.ts';
import { settle } from '../page/measure.ts';
import { readCard } from './a11y.ts';
import { measureLive } from './measure.ts';

export type LiveDeps = {
  channel: string;
  post: (message: FrameMessage) => void;
};

export type Live = {
  /** `measure-live` and `a11y` (`force` goes to `force.ts`). */
  handle(message: LiveStudioMessage): void;
};

/** The frame's width, as the protocol carries it: the width of the card this frame is. */
const frameWidth = (): number => Math.min(Math.max(0, Math.round(window.innerWidth)), 1e6);

export function createLive({ channel, post }: LiveDeps): Live {
  async function measure(request: number, ids: string[], expect: Expected[]): Promise<void> {
    // A box measured mid-motion has the size of a frame of the motion.
    await settle();
    let facts: LiveFact[] = [];
    try {
      facts = measureLive(ids, expect);
    } catch {
      // The page still hears an answer, so it never waits for one.
    }
    post({ kitvas: 1, channel, type: 'live-facts', request, width: frameWidth(), facts });
  }

  function card(request: number, id: string, item: number | undefined): void {
    let read: A11yCard | null = null;
    try {
      read = readCard(id, item);
    } catch {
      // An element the card cannot read is answered as not there.
    }
    post({ kitvas: 1, channel, type: 'a11y-card', request, id, card: read });
  }

  return {
    handle(message) {
      if (message.type === 'measure-live') {
        void measure(message.request, message.ids, message.expect);
      } else if (message.type === 'a11y') {
        card(message.request, message.id, message.item);
      }
    },
  };
}
