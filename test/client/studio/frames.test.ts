import assert from 'node:assert/strict';
import { test } from 'node:test';
import { type LensPin, readLensStudio } from '../../../client/channel/lens-protocol.ts';
import { parseStudioMessage } from '../../../client/channel/protocol.ts';
import { type Frame, lensMessage, sendLens, sendSwap } from '../../../client/studio/frames.ts';

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

test('the lens pins go to the frame on its own channel, as its lens reader takes them', () => {
  const { frame, posted } = fakeFrame();
  const pins: LensPin[] = [
    { key: 'check:f0', id: 'a:main', kind: 'check', tone: 'fix', text: 'Text contrast is too low' },
  ];
  sendLens(frame, { type: 'lens-pins', pins });
  const message = { kitvas: 1, channel: CHANNEL, type: 'lens-pins', pins };
  assert.deepEqual(posted, [[message, '*']]);
  assert.deepEqual(readLensStudio(posted[0]?.[0], CHANNEL), message);
  // The other parsers do not take it: the frame asks the lens reader first.
  assert.equal(parseStudioMessage(posted[0]?.[0], CHANNEL), undefined);
});

test('a click on a pin counts only from a frame of the page, on its own channel', () => {
  const { frame } = fakeFrame();
  const source = frame.element.contentWindow;
  const click = { kitvas: 1, channel: CHANNEL, type: 'pin', key: 'check:f0' };
  const event = (over: Record<string, unknown>): MessageEvent =>
    ({ origin: 'null', source, data: click, ...over }) as unknown as MessageEvent;
  assert.deepEqual(lensMessage([frame], event({})), { frame, message: click });
  assert.equal(lensMessage([frame], event({ origin: 'http://localhost:4000' })), undefined);
  assert.equal(lensMessage([frame], event({ source: {} })), undefined);
  assert.equal(lensMessage([frame], event({ source: null })), undefined);
  assert.equal(lensMessage([frame], event({ data: { ...click, channel: 'other' } })), undefined);
  assert.equal(lensMessage([], event({})), undefined);
});
