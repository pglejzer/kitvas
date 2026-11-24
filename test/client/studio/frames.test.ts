import assert from 'node:assert/strict';
import { test } from 'node:test';
import { parseStudioMessage } from '../../../client/channel/protocol.ts';
import { type Frame, sendSwap } from '../../../client/studio/frames.ts';

const CHANNEL = 'c'.repeat(20);

/** A frame whose window only notes what is posted to it. */
function fakeFrame(): { frame: Frame; posted: [unknown, string][] } {
  const posted: [unknown, string][] = [];
  const element = {
    contentWindow: {
      postMessage: (message: unknown, target: string) => {
        posted.push([message, target]);
      },
    },
  };
  const frame: Frame = {
    role: 'current',
    channel: CHANNEL,
    element: element as unknown as HTMLIFrameElement,
    ready: true,
  };
  return { frame, posted };
}

test('a swap goes to the frame on its own channel with the number of the build', () => {
  const { frame, posted } = fakeFrame();
  sendSwap(frame, 7);
  const message = { kitvas: 1, channel: CHANNEL, type: 'swap', live: 7 };
  assert.deepEqual(posted, [[message, '*']]);
  assert.deepEqual(parseStudioMessage(posted[0]?.[0], CHANNEL), message, 'a frame takes it');
});
